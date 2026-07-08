## Objetivo
Remover completamente o sistema de permissões granulares (funcionais + módulos + catálogo). Manter apenas: usuários (`agent_tc_app_users`), roles (`admin`/`user`) e o audit log.

## Banco (novo `supabase_drop_permissions.sql`)
```sql
drop function if exists public.agent_tc_set_user_permission(uuid,text,boolean) cascade;
drop function if exists public.agent_tc_set_user_module_permission(uuid,text,boolean) cascade;
drop table if exists public.agent_tc_user_permissions cascade;
drop table if exists public.agent_tc_user_module_permissions cascade;
drop table if exists public.agent_tc_permission_catalog cascade;
notify pgrst, 'reload schema';
```
Também limpar do `supabase_auth_setup.sql` tudo relacionado a essas 3 tabelas, RPCs, policies e grants — deixando só users, roles, `agent_tc_is_admin`, `agent_tc_current_app_user_id` e audit.

## Frontend
- **AuthContext**: remover `permissions`, `hasPermission`, `modules`, `canAccessModule`, as queries em `agent_tc_user_permissions` / `agent_tc_user_module_permissions` e os canais realtime dessas tabelas.
- **ProtectedRoute**: remover props `requirePermission`, `requirePermissions`, `requireModuleFromParam`. Manter só `requireAdmin` + sessão.
- **App.tsx**: trocar `requirePermission(s)` por acesso liberado a usuários logados (rotas Jenkins ficam autenticadas).
- **AppSidebar**: remover gates `hasPermission(...)`, mostrar itens para qualquer usuário logado; Admin continua gated por `isAdmin`.
- **AdminUsuarios**: remover diálogo de permissões (`openPerm`, `persistPermission`, `persistModulePermission`, catálogo, `FALLBACK_PERMISSION_CATALOG`, botão "Permissões"). Manter aprovar/rejeitar, alterar role, listar.
- **Dashboard / JenkinsHome**: remover uso de `permissions` / `hasPermission`.

## Depois
Rode `supabase_drop_permissions.sql` no SQL Editor. Eu ajusto o código em seguida.

## Confirma?
Isso é destrutivo no banco (drop das 3 tabelas com dados). OK prosseguir?
