-- Descobre o ERRO REAL que o trigger de cadastro está engolindo.
--
-- O trigger agent_tc_handle_new_user() termina com
-- "exception when others -> raise warning", então a conta nasce no
-- Authentication mas o perfil não é criado e o erro some.
-- Este script repete a mesma inserção para cada conta sem perfil e IMPRIME
-- o erro exato (sqlstate + mensagem). Não altera nada (faz rollback interno).

do $$
declare
  account record;
  v_username text;
begin
  for account in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    where not exists (
      select 1 from public.agent_tc_app_users p
      where p.auth_user_id = u.id or p.id = u.id
    )
    order by u.created_at desc
  loop
    v_username := nullif(trim(coalesce(
      account.raw_user_meta_data->>'username',
      split_part(account.email, '@', 1)
    )), '');

    begin
      insert into public.agent_tc_app_users (
        id, auth_user_id, username, first_name, last_name, email, status, role
      ) values (
        account.id, account.id, v_username,
        account.raw_user_meta_data->>'first_name',
        account.raw_user_meta_data->>'last_name',
        account.email, 'pending', 'user'
      );
      raise notice 'OK -> % (%) seria criado sem erro', account.email, v_username;
      raise exception using errcode = 'ZZ000', message = 'rollback proposital';
    exception
      when sqlstate 'ZZ000' then
        null; -- rollback do teste, tudo certo
      when others then
        raise notice 'FALHA -> % (%) | sqlstate=% | %',
          account.email, v_username, sqlstate, sqlerrm;
    end;
  end loop;
end $$;

-- Estrutura da tabela (colunas NOT NULL sem default são as suspeitas nº 1)
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'agent_tc_app_users'
order by ordinal_position;

-- Constraints/checks que podem estar barrando (ex.: status/role inválidos)
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.agent_tc_app_users'::regclass
order by conname;
