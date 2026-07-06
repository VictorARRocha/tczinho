
# Sistema de Autenticação e Permissões — Agent TC

Escopo grande. Vou implementar tudo em cima do Supabase já conectado no projeto (`src/lib/supabase.ts`), sem quebrar nenhuma tela existente.

## 1. Banco (SQL a rodar no Supabase do projeto)

Como o projeto usa um Supabase externo (não Lovable Cloud), vou entregar um arquivo `supabase_auth_setup.sql` para você executar no SQL Editor. Ele cria:

- `public.user_profiles` (id → auth.users, username único, full_name, role, status, timestamps, approved_by)
- `public.user_permissions` (user_id, permission, allowed, unique(user_id, permission))
- Enum informal via `text` com CHECK (`role in ('admin','user')`, `status in ('pending','approved','rejected')`)
- Índices em username / status / role
- Trigger `on_auth_user_created` → cria linha em `user_profiles` com status `pending`, role `user`, username/full_name do `raw_user_meta_data`
- Função `has_permission(_uid, _perm)` SECURITY DEFINER (retorna true se `admin_all` OU permissão explícita OU role=admin)
- Função `is_admin(_uid)` SECURITY DEFINER
- RLS:
  - `user_profiles`: SELECT próprio + SELECT tudo se admin; UPDATE só admin; INSERT via trigger
  - `user_permissions`: SELECT próprio + admin; INSERT/UPDATE/DELETE só admin
- GRANTs para `authenticated` e `service_role`
- Bloco final comentado para promover o primeiro admin manualmente por username

## 2. Frontend

### Novos arquivos
- `src/contexts/AuthContext.tsx` — provider com `user`, `profile`, `permissions`, `loading`, `signIn(username,pw)`, `signUp(...)`, `signOut()`, `hasPermission(perm)`. Usa `onAuthStateChange` + `getUser()`. Converte `username` → `${username}@agenttc.local`.
- `src/components/ProtectedRoute.tsx` — envolve rotas: redireciona `/login` se sem sessão; mostra tela "Aguardando aprovação" se `status=pending`; mostra "Acesso negado" se falta permissão informada via prop.
- `src/pages/Login.tsx`, `src/pages/Register.tsx`
- `src/pages/Pending.tsx` (tela de aguardando aprovação com botão Sair)
- `src/pages/AccessDenied.tsx`
- `src/pages/AdminUsers.tsx` — tabela de usuários com filtros (pendentes/aprovados/admins/todos), ações: aprovar, rejeitar, deletar, alternar admin, e um Sheet lateral com checklist de permissões.
- `src/lib/permissions.ts` — lista canônica das permissões e mapeamento rota→permissão.

### Arquivos alterados
- `src/main.tsx` — envolver `<App />` com `<AuthProvider>`.
- `src/App.tsx` — adicionar rotas `/login`, `/cadastro`, `/pendente`, `/acesso-negado`, `/admin/usuarios`; envolver o grupo `AppLayout` com `<ProtectedRoute>`; proteger `/admin/usuarios` com `manage_users`.
- `src/components/AppSidebar.tsx` — esconder itens conforme `hasPermission` (`view_dashboard`, `view_jenkins`, etc.); adicionar seção "Administração" só para admins; mostrar nome/role do usuário e botão Sair no `SidebarFooter`.
- `src/lib/supabase.ts` — manter URL/anon key, mas trocar `persistSession: false` para `true` (mais `autoRefreshToken: true`, `detectSessionInUrl: false`). Necessário para sessão persistente.

### Nenhuma tela existente muda de comportamento
Dashboards, Jenkins, Módulos, Falhas, Evidências, Monaco Diff etc. seguem iguais — só ganham o wrapper de rota. Botões sensíveis (download evidência, criar rodagem, ver diff) recebem checagem `hasPermission(...)` para esconder/desabilitar, sem alterar lógica de dados.

## 3. Mapa de permissões → rotas/UI

| Permissão | Onde aplica |
|---|---|
| `view_dashboard` | `/` |
| `view_jenkins` | `/jenkins`, menu Jenkins |
| `create_jenkins_run` | `/jenkins/rodagem-completa` |
| `create_rerun` | `/jenkins/reexecutar` |
| `view_falhas` | aba Falhas em `ModulePage` |
| `view_evidencias` | aba Evidências / detalhe de falha |
| `download_evidence` | botão de download em evidências |
| `view_diff` | botão Monaco Diff |
| `manage_users` / `manage_permissions` / `admin_all` | `/admin/usuarios` |

Admin (`role=admin` OU `admin_all`) passa em todas.

## 4. Primeiro admin
Via SQL manual (Opção A). O arquivo `supabase_auth_setup.sql` termina com:

```sql
-- Depois de se cadastrar pela tela /cadastro, rode:
-- update public.user_profiles set role='admin', status='approved', approved_at=now() where username='SEU_USERNAME';
-- insert into public.user_permissions(user_id, permission, allowed)
-- select id, 'admin_all', true from public.user_profiles where username='SEU_USERNAME'
-- on conflict (user_id, permission) do update set allowed=true;
```

## 5. Segurança
- Nunca usar service role no frontend.
- RLS impede usuário comum de mudar própria role/status/permissões.
- Proteção contra remover o último admin: checagem client-side no `AdminUsers` (conta admins ativos antes de rebaixar/remover `admin_all` do próprio usuário) + a policy só permite admin operar mesmo assim.
- Senhas só via Supabase Auth (bcrypt nativo). Nada em texto puro.

## 6. Passos para você após eu implementar
1. Abrir o Supabase SQL Editor do projeto `bxbqciqyxvcrlkheszdk`.
2. Rodar `supabase_auth_setup.sql`.
3. Acessar `/cadastro`, criar seu usuário.
4. Rodar o bloco final do SQL trocando `SEU_USERNAME` pelo seu username para virar admin.
5. Fazer login e aprovar os demais.

Confirma que posso seguir com essa abordagem (Supabase atual + SQL manual para o primeiro admin)?
