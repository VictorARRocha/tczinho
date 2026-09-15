-- =====================================================================
-- Agent TC — Diagnóstico somente leitura para usuários/permissões
-- Rode no SQL Editor do Supabase e copie o resultado se ainda houver erro.
-- =====================================================================

-- 1) Colunas esperadas
with expected(table_name, column_name) as (
  values
    ('agent_tc_app_users', 'id'),
    ('agent_tc_app_users', 'auth_user_id'),
    ('agent_tc_app_users', 'username'),
    ('agent_tc_app_users', 'role'),
    ('agent_tc_app_users', 'status'),
    ('agent_tc_permission_catalog', 'code'),
    ('agent_tc_permission_catalog', 'label'),
    ('agent_tc_permission_catalog', 'categoria'),
    ('agent_tc_user_permissions', 'id'),
    ('agent_tc_user_permissions', 'user_id'),
    ('agent_tc_user_permissions', 'permission_code'),
    ('agent_tc_user_permissions', 'granted_by'),
    ('agent_tc_user_permissions', 'granted_at'),
    ('agent_tc_user_module_permissions', 'id'),
    ('agent_tc_user_module_permissions', 'user_id'),
    ('agent_tc_user_module_permissions', 'modulo_slug'),
    ('agent_tc_user_module_permissions', 'granted_by'),
    ('agent_tc_user_module_permissions', 'granted_at'),
    ('agent_tc_admin_audit_log', 'actor_id'),
    ('agent_tc_admin_audit_log', 'target_id'),
    ('agent_tc_admin_audit_log', 'action'),
    ('agent_tc_admin_audit_log', 'details'),
    ('agent_tc_admin_audit_log', 'created_at')
)
select
  e.table_name,
  e.column_name,
  case when c.column_name is null then 'MISSING' else 'OK' end as status,
  c.data_type,
  c.is_nullable,
  c.column_default
from expected e
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = e.table_name
 and c.column_name = e.column_name
order by e.table_name, e.column_name;

-- 2) Constraints críticas para ON CONFLICT/FK
select
  conrelid::regclass::text as table_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.agent_tc_app_users'::regclass,
  'public.agent_tc_permission_catalog'::regclass,
  'public.agent_tc_user_permissions'::regclass,
  'public.agent_tc_user_module_permissions'::regclass,
  'public.agent_tc_admin_audit_log'::regclass
)
order by table_name, conname;

-- 3) Grants do Data API
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'agent_tc_app_users',
    'agent_tc_permission_catalog',
    'agent_tc_user_permissions',
    'agent_tc_user_module_permissions',
    'agent_tc_admin_audit_log'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;

-- 4) RLS/policies
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'agent_tc_app_users',
    'agent_tc_permission_catalog',
    'agent_tc_user_permissions',
    'agent_tc_user_module_permissions',
    'agent_tc_admin_audit_log'
  )
order by tablename, policyname;

-- 5) RPCs usadas pela tela de permissões
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'agent_tc_current_app_user_id',
    'agent_tc_is_admin',
    'agent_tc_set_user_permission',
    'agent_tc_set_user_module_permission'
  )
order by p.proname;

-- 6) Força reload do schema cache do PostgREST após rodar o setup.
select pg_notify('pgrst', 'reload schema');