-- Corrige o erro "Database error saving new user" no cadastro.
--
-- Causa raiz: o trigger em auth.users insere o perfil tratando conflito de
-- apenas UMA chave. Se o username já existir (perfil migrado ou tentativa
-- anterior) com id diferente, a inserção estoura unique_violation e o Supabase
-- aborta o signUp inteiro com "Database error saving new user".
--
-- Solução: trigger resiliente que (1) religa perfil existente pelo username,
-- (2) faz upsert por id, e (3) nunca derruba o signUp em caso de erro.

create or replace function public.agent_tc_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_existing_id uuid;
begin
  v_username := nullif(trim(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))), '');
  if v_username is null then
    v_username := new.id::text;
  end if;

  select id into v_existing_id
  from public.agent_tc_app_users
  where lower(username) = lower(v_username)
  limit 1;

  if v_existing_id is not null then
    -- Perfil já existe (migração ou tentativa anterior): apenas religa a conta.
    update public.agent_tc_app_users
       set auth_user_id = new.id,
           email = coalesce(email, new.email),
           first_name = coalesce(first_name, new.raw_user_meta_data->>'first_name'),
           last_name = coalesce(last_name, new.raw_user_meta_data->>'last_name'),
           updated_at = now()
     where id = v_existing_id;
    return new;
  end if;

  insert into public.agent_tc_app_users (
    id, auth_user_id, username, first_name, last_name, email, status, role
  )
  values (
    new.id,
    new.id,
    v_username,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.email,
    'pending',
    'user'
  )
  on conflict (id) do update
    set auth_user_id = excluded.auth_user_id,
        email = coalesce(public.agent_tc_app_users.email, excluded.email),
        updated_at = now();

  return new;
exception when others then
  -- Nunca bloquear o signUp por falha no perfil; o app cria/religa depois.
  raise warning 'agent_tc_handle_new_user falhou para %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists agent_tc_on_auth_user_created on auth.users;
create trigger agent_tc_on_auth_user_created
  after insert on auth.users
  for each row execute function public.agent_tc_handle_new_user();

notify pgrst, 'reload schema';

-- Diagnóstico opcional: perfis sem conta no Authentication
-- select username, status, role, auth_user_id from public.agent_tc_app_users order by username;
