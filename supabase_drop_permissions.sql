-- =============================================================
-- Agent TC — Remoção do sistema de permissões
-- Roda no SQL Editor do Supabase. Mantém usuários, roles e audit.
-- =============================================================

-- RPCs
drop function if exists public.agent_tc_set_user_permission(uuid, text, boolean) cascade;
drop function if exists public.agent_tc_set_user_module_permission(uuid, text, boolean) cascade;

-- Tabelas de permissões
drop table if exists public.agent_tc_user_permissions        cascade;
drop table if exists public.agent_tc_user_module_permissions cascade;
drop table if exists public.agent_tc_permission_catalog      cascade;

-- Força PostgREST a recarregar o cache do schema
notify pgrst, 'reload schema';
