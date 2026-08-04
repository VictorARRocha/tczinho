-- Corrige o vínculo entre os perfis importados e as contas do Authentication
-- do projeto atual. Execute uma vez no SQL Editor do projeto novo.
--
-- A aprovação em public.agent_tc_app_users não autentica o usuário sozinha:
-- auth_user_id precisa ser o id da conta correspondente em auth.users.

begin;

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