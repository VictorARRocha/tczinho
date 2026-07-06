-- =============================================================
-- Cria o primeiro admin do Agent TC
-- Usuário: marcelo_marlos
-- Nome:    Marcelo Marlos
-- Senha:   S#nta799
--
-- Rode este arquivo INTEIRO no SQL Editor do Supabase.
-- Pré-requisito: supabase_auth_setup.sql já executado
-- (tabelas user_profiles, user_permissions e o trigger on_auth_user_created).
-- Idempotente: pode rodar de novo sem duplicar.
-- =============================================================

create extension if not exists pgcrypto;

do $$
declare
  v_email  text := 'marcelo_marlos@agenttc.local';
  v_uname  text := 'marcelo_marlos';
  v_fname  text := 'Marcelo Marlos';
  v_pw     text := 'S#nta799';
  v_uid    uuid;
begin
  -- 1) Cria (ou reaproveita) o usuário em auth.users
  select id into v_uid from auth.users where email = v_email;

  if v_uid is null then
    v_uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_uid,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_pw, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('username', v_uname, 'full_name', v_fname),
      '', '', '', ''
    );

    -- Cria a identidade de email (necessária em versões recentes do Supabase Auth)
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      v_uid,
      v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email',
      now(), now(), now()
    )
    on conflict do nothing;
  else
    -- Já existe: garante senha e email confirmado
    update auth.users
       set encrypted_password = crypt(v_pw, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           raw_user_meta_data = jsonb_build_object('username', v_uname, 'full_name', v_fname),
           updated_at = now()
     where id = v_uid;
  end if;

  -- 2) Perfil (o trigger handle_new_user pode já ter criado; garante os valores)
  insert into public.user_profiles (id, username, full_name, role, status, approved_at, approved_by)
  values (v_uid, v_uname, v_fname, 'admin', 'approved', now(), v_uid)
  on conflict (id) do update
     set username    = excluded.username,
         full_name   = excluded.full_name,
         role        = 'admin',
         status      = 'approved',
         approved_at = coalesce(public.user_profiles.approved_at, now()),
         approved_by = coalesce(public.user_profiles.approved_by, v_uid),
         updated_at  = now();

  -- 3) Permissão total
  insert into public.user_permissions (user_id, permission, allowed)
  values (v_uid, 'admin_all', true)
  on conflict (user_id, permission) do update set allowed = true, updated_at = now();
end $$;

-- Confirme:
select p.username, p.full_name, p.role, p.status,
       (select array_agg(permission) from public.user_permissions where user_id = p.id and allowed) as perms
  from public.user_profiles p
 where p.username = 'marcelo_marlos';
