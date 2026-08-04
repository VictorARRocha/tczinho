-- Corrige o vínculo entre os perfis importados e as contas do Authentication
-- do projeto atual. Execute uma vez no SQL Editor do projeto novo.
--
-- A aprovação em public.agent_tc_app_users não autentica o usuário sozinha:
-- auth_user_id precisa ser o id da conta correspondente em auth.users.

begin;

-- Garante as colunas usadas abaixo (perfis importados podem não tê-las).
alter table public.agent_tc_app_users add column if not exists email text;
alter table public.agent_tc_app_users add column if not exists first_name text;
alter table public.agent_tc_app_users add column if not exists last_name text;
alter table public.agent_tc_app_users add column if not exists updated_at timestamptz default now();



-- Torna novos cadastros compatíveis com perfis trazidos do projeto antigo:
-- se o username já existir, preserva o perfil/aprovação e troca somente o
-- vínculo para a nova conta do Authentication.
create or replace function public.agent_tc_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.agent_tc_app_users (
    id, auth_user_id, username, first_name, last_name, email, status, role
  )
  values (
    new.id,
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.email,
    'pending',
    'user'
  )
  on conflict (username) do update
    set auth_user_id = excluded.auth_user_id,
        email = excluded.email,
        first_name = coalesce(public.agent_tc_app_users.first_name, excluded.first_name),
        last_name = coalesce(public.agent_tc_app_users.last_name, excluded.last_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists agent_tc_on_auth_user_created on auth.users;
create trigger agent_tc_on_auth_user_created
  after insert on auth.users
  for each row execute function public.agent_tc_handle_new_user();

-- Interrompe sem alterar nada se houver nomes duplicados no Authentication.
do $$
begin
  if exists (
    select 1
    from auth.users au
    cross join lateral (
      select lower(coalesce(
        nullif(au.raw_user_meta_data->>'username', ''),
        split_part(au.email, '@', 1)
      )) as username
    ) identity
    where identity.username <> ''
    group by identity.username
    having count(*) > 1
  ) then
    raise exception 'Existem usernames duplicados em auth.users; nenhum vínculo foi alterado.';
  end if;
end
$$;

-- Religa cada perfil à conta autenticável do projeto atual.
-- O username salvo nos metadados é a fonte principal; o prefixo do e-mail
-- sintético é usado apenas como compatibilidade.
update public.agent_tc_app_users profile
set auth_user_id = account.id,
    email = coalesce(account.email, profile.email),
    updated_at = now()
from auth.users account
where lower(profile.username) = lower(coalesce(
        nullif(account.raw_user_meta_data->>'username', ''),
        split_part(account.email, '@', 1)
      ))
  and profile.auth_user_id is distinct from account.id;

commit;

notify pgrst, 'reload schema';

-- Validação: auth_user_id e authentication_id devem ser iguais.
select
  profile.username,
  profile.status,
  profile.role,
  profile.auth_user_id,
  account.id as authentication_id,
  account.email,
  account.email_confirmed_at,
  case
    when account.id is null then 'SEM CONTA NO AUTHENTICATION'
    when profile.auth_user_id = account.id then 'VINCULO CORRETO'
    else 'VINCULO INCORRETO'
  end as diagnostico
from public.agent_tc_app_users profile
left join auth.users account
  on account.id = profile.auth_user_id
order by profile.username;