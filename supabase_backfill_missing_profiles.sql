-- Backfill de perfis faltantes em public.agent_tc_app_users
--
-- Sintoma: usuário se cadastra (aparece em Authentication > Users), mas não
-- aparece na tela de Administração > Usuários para aprovar/rejeitar.
--
-- Causa raiz: o trigger agent_tc_handle_new_user() tem um
-- "exception when others -> raise warning" (para não derrubar o signUp).
-- Quando a inserção do perfil falha (unique/constraint/coluna faltando), a
-- conta é criada no Authentication mas NENHUMA linha nasce em
-- public.agent_tc_app_users — e o admin não tem o que listar.
--
-- Este script cria/religa os perfis que estão faltando. É idempotente.

begin;

-- Colunas usadas abaixo (bases migradas podem não tê-las).
alter table public.agent_tc_app_users add column if not exists auth_user_id uuid;
alter table public.agent_tc_app_users add column if not exists email text;
alter table public.agent_tc_app_users add column if not exists first_name text;
alter table public.agent_tc_app_users add column if not exists last_name text;
alter table public.agent_tc_app_users add column if not exists updated_at timestamptz default now();

-- 1) Religa perfis existentes cujo username bate com a conta do Authentication.
update public.agent_tc_app_users profile
set auth_user_id = account.id,
    email = coalesce(profile.email, account.email),
    updated_at = now()
from auth.users account
where lower(profile.username) = lower(coalesce(
        nullif(account.raw_user_meta_data->>'username', ''),
        split_part(account.email, '@', 1)
      ))
  and profile.auth_user_id is distinct from account.id;

-- 2) Cria como "pending" todo usuário do Authentication que ainda não tem perfil.
insert into public.agent_tc_app_users (
  id, auth_user_id, username, first_name, last_name, email, status, role
)
select
  account.id,
  account.id,
  coalesce(
    nullif(trim(account.raw_user_meta_data->>'username'), ''),
    split_part(account.email, '@', 1),
    account.id::text
  ),
  account.raw_user_meta_data->>'first_name',
  account.raw_user_meta_data->>'last_name',
  account.email,
  'pending',
  'user'
from auth.users account
where not exists (
  select 1 from public.agent_tc_app_users p
  where p.auth_user_id = account.id
     or p.id = account.id
     or lower(p.username) = lower(coalesce(
          nullif(trim(account.raw_user_meta_data->>'username'), ''),
          split_part(account.email, '@', 1)
        ))
)
on conflict (id) do nothing;

commit;

notify pgrst, 'reload schema';

-- Conferência: toda conta do Authentication deve ter perfil vinculado.
select
  account.email,
  account.raw_user_meta_data->>'username' as username_meta,
  profile.username,
  profile.status,
  profile.role,
  case
    when profile.id is null then 'SEM PERFIL (rode o script novamente)'
    when profile.auth_user_id = account.id then 'OK'
    else 'VINCULO INCORRETO'
  end as diagnostico
from auth.users account
left join public.agent_tc_app_users profile
  on profile.auth_user_id = account.id or profile.id = account.id
order by account.created_at desc;
