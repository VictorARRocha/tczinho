-- =====================================================================
-- Agent TC — Auth, aprovação de usuários e permissões
-- Rodar no SQL Editor do Supabase (projeto bxbqciqyxvcrlkheszdk).
-- Idempotente: pode reexecutar.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1) Perfil do app (linkado a auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.agent_tc_app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  username text unique not null,
  first_name text,
  last_name  text,
  email      text,
  role       text not null default 'user'   check (role in ('user','admin')),
  status     text not null default 'pending' check (status in ('pending','approved','rejected','disabled')),
  approved_at    timestamptz,
  approved_by    uuid,
  rejected_at    timestamptz,
  rejected_by    uuid,
  rejection_reason text,
  disabled_at    timestamptz,
  disabled_by    uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compatibilidade com instalações anteriores: CREATE TABLE IF NOT EXISTS
-- não adiciona colunas novas quando a tabela já existe.
alter table public.agent_tc_app_users add column if not exists username text;
alter table public.agent_tc_app_users add column if not exists auth_user_id uuid;
alter table public.agent_tc_app_users add column if not exists first_name text;
alter table public.agent_tc_app_users add column if not exists last_name text;
alter table public.agent_tc_app_users add column if not exists email text;
alter table public.agent_tc_app_users add column if not exists role text not null default 'user';
alter table public.agent_tc_app_users add column if not exists status text not null default 'pending';
alter table public.agent_tc_app_users add column if not exists approved_at timestamptz;
alter table public.agent_tc_app_users add column if not exists approved_by uuid;
alter table public.agent_tc_app_users add column if not exists rejected_at timestamptz;
alter table public.agent_tc_app_users add column if not exists rejected_by uuid;
alter table public.agent_tc_app_users add column if not exists rejection_reason text;
alter table public.agent_tc_app_users add column if not exists disabled_at timestamptz;
alter table public.agent_tc_app_users add column if not exists disabled_by uuid;
alter table public.agent_tc_app_users add column if not exists created_at timestamptz not null default now();
alter table public.agent_tc_app_users add column if not exists updated_at timestamptz not null default now();

-- Compatibilidade: em algumas instalações antigas, id é o ID interno do perfil
-- e auth_user_id é quem aponta para auth.users(id). Em instalações novas, id pode
-- ser o próprio auth.users(id). Mantemos auth_user_id preenchido quando possível.
update public.agent_tc_app_users u
   set auth_user_id = u.id
 where u.auth_user_id is null
   and exists (select 1 from auth.users au where au.id = u.id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_tc_app_users_auth_user_id_fkey'
      and conrelid = 'public.agent_tc_app_users'::regclass
  ) then
    alter table public.agent_tc_app_users
      add constraint agent_tc_app_users_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete cascade not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_tc_app_users_role_check'
      and conrelid = 'public.agent_tc_app_users'::regclass
  ) then
    alter table public.agent_tc_app_users
      add constraint agent_tc_app_users_role_check check (role in ('user','admin'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_tc_app_users_status_check'
      and conrelid = 'public.agent_tc_app_users'::regclass
  ) then
    alter table public.agent_tc_app_users
      add constraint agent_tc_app_users_status_check check (status in ('pending','approved','rejected','disabled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_tc_app_users_username_key'
      and conrelid = 'public.agent_tc_app_users'::regclass
  ) then
    alter table public.agent_tc_app_users
      add constraint agent_tc_app_users_username_key unique (username);
  end if;
end $$;

create index if not exists agent_tc_app_users_status_idx on public.agent_tc_app_users(status);
create index if not exists agent_tc_app_users_role_idx   on public.agent_tc_app_users(role);
create index if not exists agent_tc_app_users_auth_user_id_idx on public.agent_tc_app_users(auth_user_id);

-- ---------------------------------------------------------------------
-- 2) Catálogo de permissões
-- ---------------------------------------------------------------------
create table if not exists public.agent_tc_permission_catalog (
  code text primary key,
  label text not null,
  categoria text,
  descricao text,
  created_at timestamptz not null default now()
);

insert into public.agent_tc_permission_catalog (code, label, categoria) values
  ('dashboard.view',           'Ver dashboard',          'plataforma'),
  ('modules.view',             'Ver módulos',            'plataforma'),
  ('runs.view',                'Ver rodagens',           'plataforma'),
  ('failures.view',            'Ver falhas',             'plataforma'),
  ('groups.view',              'Ver agrupamentos',       'plataforma'),
  ('performance.view',         'Ver performance',        'plataforma'),
  ('history.view',             'Ver histórico',          'plataforma'),
  ('evidence.view',            'Ver evidências',         'plataforma'),
  ('jenkins.view',             'Ver Jenkins',            'jenkins'),
  ('jenkins.run',              'Disparar Jenkins',       'jenkins'),
  ('admin.view',               'Ver admin',              'admin'),
  ('admin.users.manage',       'Gerenciar usuários',     'admin'),
  ('admin.permissions.manage', 'Gerenciar permissões',   'admin')
on conflict (code) do update set label = excluded.label, categoria = excluded.categoria;

-- ---------------------------------------------------------------------
-- 3) Permissões funcionais por usuário
-- ---------------------------------------------------------------------
create table if not exists public.agent_tc_user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.agent_tc_app_users(id) on delete cascade,
  permission_code text not null references public.agent_tc_permission_catalog(code) on delete cascade,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  unique (user_id, permission_code)
);
create index if not exists agent_tc_user_permissions_user_idx on public.agent_tc_user_permissions(user_id);

-- ---------------------------------------------------------------------
-- 4) Permissões por módulo
-- ---------------------------------------------------------------------
create table if not exists public.agent_tc_user_module_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.agent_tc_app_users(id) on delete cascade,
  modulo_slug text not null,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  unique (user_id, modulo_slug)
);
create index if not exists agent_tc_user_module_permissions_user_idx on public.agent_tc_user_module_permissions(user_id);

-- ---------------------------------------------------------------------
-- 5) Auditoria admin
-- ---------------------------------------------------------------------
create table if not exists public.agent_tc_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_username text,
  target_id uuid,
  target_username text,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_tc_admin_audit_log_created_idx on public.agent_tc_admin_audit_log(created_at desc);

-- ---------------------------------------------------------------------
-- 6) Funções helper (SECURITY DEFINER, evita recursão em RLS)
-- ---------------------------------------------------------------------
create or replace function public.agent_tc_current_app_user_id(_auth_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.agent_tc_app_users u
  where u.id = _auth_user_id
     or nullif(to_jsonb(u)->>'auth_user_id', '')::uuid = _auth_user_id
  order by case when u.id = _auth_user_id then 0 else 1 end
  limit 1;
$$;

create or replace function public.agent_tc_is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agent_tc_app_users u
    where (u.id = _user_id or nullif(to_jsonb(u)->>'auth_user_id', '')::uuid = _user_id)
      and u.role = 'admin'
      and u.status = 'approved'
  );
$$;

grant execute on function public.agent_tc_current_app_user_id(uuid) to authenticated, service_role;
grant execute on function public.agent_tc_is_admin(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7) Trigger para criar perfil automaticamente após signUp
-- ---------------------------------------------------------------------
create or replace function public.agent_tc_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.agent_tc_app_users (id, auth_user_id, username, first_name, last_name, email, status, role)
  values (
    new.id,
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.email,
    'pending',
    'user'
  )
  on conflict (id) do update
    set auth_user_id = coalesce(public.agent_tc_app_users.auth_user_id, excluded.auth_user_id),
        email = coalesce(public.agent_tc_app_users.email, excluded.email),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists agent_tc_on_auth_user_created on auth.users;
create trigger agent_tc_on_auth_user_created
  after insert on auth.users
  for each row execute function public.agent_tc_handle_new_user();

-- ---------------------------------------------------------------------
-- 8) RLS
-- ---------------------------------------------------------------------
alter table public.agent_tc_app_users              enable row level security;
alter table public.agent_tc_permission_catalog     enable row level security;
alter table public.agent_tc_user_permissions       enable row level security;
alter table public.agent_tc_user_module_permissions enable row level security;
alter table public.agent_tc_admin_audit_log        enable row level security;

grant select on public.agent_tc_permission_catalog to anon, authenticated;
grant select, update on public.agent_tc_app_users to authenticated;
grant select, insert, update, delete on public.agent_tc_user_permissions to authenticated;
grant select, insert, update, delete on public.agent_tc_user_module_permissions to authenticated;
grant select, insert on public.agent_tc_admin_audit_log to authenticated;
grant all on public.agent_tc_app_users to service_role;
grant all on public.agent_tc_permission_catalog to service_role;
grant all on public.agent_tc_user_permissions to service_role;
grant all on public.agent_tc_user_module_permissions to service_role;
grant all on public.agent_tc_admin_audit_log to service_role;

-- app_users: cada um vê seu perfil; admin vê tudo; admin atualiza tudo
drop policy if exists "app_users self read"       on public.agent_tc_app_users;
drop policy if exists "app_users admin read all"  on public.agent_tc_app_users;
drop policy if exists "app_users admin update"    on public.agent_tc_app_users;
create policy "app_users self read"
  on public.agent_tc_app_users for select to authenticated
  using (
    id = auth.uid()
    or nullif(to_jsonb(agent_tc_app_users)->>'auth_user_id', '')::uuid = auth.uid()
    or public.agent_tc_is_admin(auth.uid())
  );
create policy "app_users admin update"
  on public.agent_tc_app_users for update to authenticated
  using (public.agent_tc_is_admin(auth.uid()))
  with check (public.agent_tc_is_admin(auth.uid()));

-- permission catalog: leitura livre autenticado
drop policy if exists "perm catalog read" on public.agent_tc_permission_catalog;
create policy "perm catalog read"
  on public.agent_tc_permission_catalog for select
  using (true);

-- user_permissions
drop policy if exists "user_perm self read"    on public.agent_tc_user_permissions;
drop policy if exists "user_perm admin write"  on public.agent_tc_user_permissions;
create policy "user_perm self read"
  on public.agent_tc_user_permissions for select to authenticated
  using (
    user_id = auth.uid()
    or user_id = public.agent_tc_current_app_user_id(auth.uid())
    or public.agent_tc_is_admin(auth.uid())
  );
create policy "user_perm admin write"
  on public.agent_tc_user_permissions for all to authenticated
  using (public.agent_tc_is_admin(auth.uid()))
  with check (public.agent_tc_is_admin(auth.uid()));

-- user_module_permissions
drop policy if exists "user_mod_perm self read"   on public.agent_tc_user_module_permissions;
drop policy if exists "user_mod_perm admin write" on public.agent_tc_user_module_permissions;
create policy "user_mod_perm self read"
  on public.agent_tc_user_module_permissions for select to authenticated
  using (
    user_id = auth.uid()
    or user_id = public.agent_tc_current_app_user_id(auth.uid())
    or public.agent_tc_is_admin(auth.uid())
  );
create policy "user_mod_perm admin write"
  on public.agent_tc_user_module_permissions for all to authenticated
  using (public.agent_tc_is_admin(auth.uid()))
  with check (public.agent_tc_is_admin(auth.uid()));

-- audit log
drop policy if exists "audit admin read"   on public.agent_tc_admin_audit_log;
drop policy if exists "audit admin insert" on public.agent_tc_admin_audit_log;
create policy "audit admin read"
  on public.agent_tc_admin_audit_log for select to authenticated
  using (public.agent_tc_is_admin(auth.uid()));
create policy "audit admin insert"
  on public.agent_tc_admin_audit_log for insert to authenticated
  with check (public.agent_tc_is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 9) Promover o PRIMEIRO admin manualmente:
--    (rode depois de cadastrar seu usuário)
--
-- update public.agent_tc_app_users
--    set role = 'admin', status = 'approved', approved_at = now()
--  where username = 'SEU_USERNAME'
--     or id = 'UUID_DO_AUTH_USERS'
--     or auth_user_id = 'UUID_DO_AUTH_USERS';
-- ---------------------------------------------------------------------
