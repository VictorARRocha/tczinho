-- CAUSA RAIZ ENCONTRADA
--
-- A tabela tem o check:
--   agent_tc_app_users_username_format
--   CHECK (username = lower(username) AND username ~ '^[a-z0-9._-]{3,...}$')
--
-- O cadastro enviava o username digitado "cru" (ex.: "Jucimeire Santos", com
-- maiúscula/espaço/acento). O insert do perfil violava o check, o trigger
-- engolia o erro com "raise warning" e a conta ficava só no Authentication —
-- por isso ela não aparece na tela de Administração.
--
-- Solução: sanitizar o username dentro do próprio trigger (e no app).
-- Idempotente: pode rodar quantas vezes quiser.

-- 1) Função de sanitização (minúsculo, sem acento, espaço -> ponto,
--    só [a-z0-9._-], mínimo 3 caracteres).
create or replace function public.agent_tc_slug_username(raw text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
begin
  v := lower(trim(coalesce(raw, '')));
  v := translate(v,
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn');
  v := regexp_replace(v, '\s+', '.', 'g');
  v := regexp_replace(v, '[^a-z0-9._-]', '', 'g');
  v := regexp_replace(v, '^[._-]+|[._-]+$', '', 'g');
  if v is null or length(v) < 3 then
    v := null;
  end if;
  return v;
end;
$$;

-- 2) Trigger resiliente + username sanitizado + desambiguação por sufixo.
create or replace function public.agent_tc_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_base text;
  v_existing_id uuid;
  v_try int := 0;
begin
  v_username := coalesce(
    public.agent_tc_slug_username(new.raw_user_meta_data->>'username'),
    public.agent_tc_slug_username(split_part(new.email, '@', 1)),
    'user' || replace(new.id::text, '-', '')
  );
  v_base := v_username;

  -- Perfil já existe com esse username (migração/tentativa anterior): religa.
  select id into v_existing_id
  from public.agent_tc_app_users
  where username = v_username
  limit 1;

  if v_existing_id is not null then
    update public.agent_tc_app_users
       set auth_user_id = new.id,
           email = coalesce(email, new.email),
           first_name = coalesce(first_name, new.raw_user_meta_data->>'first_name'),
           last_name = coalesce(last_name, new.raw_user_meta_data->>'last_name'),
           updated_at = now()
     where id = v_existing_id;
    return new;
  end if;

  loop
    begin
      insert into public.agent_tc_app_users (
        id, auth_user_id, username, first_name, last_name, email, status, role
      ) values (
        new.id, new.id, v_username,
        new.raw_user_meta_data->>'first_name',
        new.raw_user_meta_data->>'last_name',
        new.email, 'pending', 'user'
      )
      on conflict (id) do update
        set auth_user_id = excluded.auth_user_id,
            email = coalesce(public.agent_tc_app_users.email, excluded.email),
            updated_at = now();
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      exit when v_try > 5;
      v_username := v_base || v_try::text;
    end;
  end loop;

  return new;
exception when others then
  raise warning 'agent_tc_handle_new_user falhou para %: % (%)', new.id, sqlerrm, sqlstate;
  return new;
end;
$$;

drop trigger if exists agent_tc_on_auth_user_created on auth.users;
create trigger agent_tc_on_auth_user_created
  after insert on auth.users
  for each row execute function public.agent_tc_handle_new_user();

-- 3) Backfill: cria o perfil de quem ficou de fora (ex.: Jucimeire), já com
--    username válido pelo check.
insert into public.agent_tc_app_users (
  id, auth_user_id, username, first_name, last_name, email, status, role
)
select
  u.id,
  u.id,
  coalesce(
    public.agent_tc_slug_username(u.raw_user_meta_data->>'username'),
    public.agent_tc_slug_username(split_part(u.email, '@', 1)),
    'user' || replace(u.id::text, '-', '')
  ),
  u.raw_user_meta_data->>'first_name',
  u.raw_user_meta_data->>'last_name',
  u.email,
  'pending',
  'user'
from auth.users u
where not exists (
  select 1 from public.agent_tc_app_users p
  where p.auth_user_id = u.id or p.id = u.id
)
on conflict do nothing;

notify pgrst, 'reload schema';

-- 4) Conferência
select
  u.email,
  p.username,
  p.status,
  p.role,
  case when p.id is null then 'SEM PERFIL' else 'OK' end as diagnostico
from auth.users u
left join public.agent_tc_app_users p
  on p.auth_user_id = u.id or p.id = u.id
order by u.created_at desc;
