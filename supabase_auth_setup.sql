-- =============================================================
-- Agent TC — Autenticação, aprovação e permissões
-- Rode este arquivo INTEIRO no SQL Editor do Supabase do projeto.
-- =============================================================

-- 1. Tabela de perfis
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null,
  role text not null default 'user' check (role in ('admin','user')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id)
);

create index if not exists idx_user_profiles_username on public.user_profiles(username);
create index if not exists idx_user_profiles_status   on public.user_profiles(status);
create index if not exists idx_user_profiles_role     on public.user_profiles(role);

-- 2. Tabela de permissões
create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, permission)
);

create index if not exists idx_user_permissions_user on public.user_permissions(user_id);

-- 3. Grants (Data API)
grant select, insert, update, delete on public.user_profiles    to authenticated;
grant all on public.user_profiles    to service_role;
grant select, insert, update, delete on public.user_permissions to authenticated;
grant all on public.user_permissions to service_role;

-- 4. Funções auxiliares (SECURITY DEFINER — evitam recursão de RLS)
create or replace function public.is_admin(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = _uid and role = 'admin' and status = 'approved'
  );
$$;

create or replace function public.has_permission(_uid uuid, _perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin(_uid)
    or exists (
      select 1 from public.user_permissions
      where user_id = _uid and permission = 'admin_all' and allowed = true
    )
    or exists (
      select 1 from public.user_permissions
      where user_id = _uid and permission = _perm and allowed = true
    );
$$;

-- 5. Trigger que cria o perfil pendente quando o auth.users é criado
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, username, full_name, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'user',
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. RLS
alter table public.user_profiles    enable row level security;
alter table public.user_permissions enable row level security;

-- user_profiles
drop policy if exists "profiles_select_own_or_admin" on public.user_profiles;
create policy "profiles_select_own_or_admin"
  on public.user_profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "profiles_update_admin" on public.user_profiles;
create policy "profiles_update_admin"
  on public.user_profiles for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "profiles_delete_admin" on public.user_profiles;
create policy "profiles_delete_admin"
  on public.user_profiles for delete
  to authenticated
  using (public.is_admin(auth.uid()) and role <> 'admin');

-- user_permissions
drop policy if exists "perms_select_own_or_admin" on public.user_permissions;
create policy "perms_select_own_or_admin"
  on public.user_permissions for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "perms_write_admin" on public.user_permissions;
create policy "perms_write_admin"
  on public.user_permissions for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- =============================================================
-- PRIMEIRO ADMIN
-- Cadastre-se em /cadastro e depois rode (troque SEU_USERNAME):
-- =============================================================
-- update public.user_profiles
--   set role='admin', status='approved', approved_at=now()
--   where username='SEU_USERNAME';
--
-- insert into public.user_permissions(user_id, permission, allowed)
-- select id, 'admin_all', true from public.user_profiles where username='SEU_USERNAME'
-- on conflict (user_id, permission) do update set allowed = excluded.allowed;
