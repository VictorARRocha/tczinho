# Agent TC — Dashboard

Interface web do Agent TC, usada pelo setor de Testes automatizados da SCI para acompanhar as
rodagens do TestComplete (Único, Suprema e Practice) e agir sobre elas.

O dashboard só conversa com a **API Agent TC**: não acessa banco, storage nem Jenkins diretamente.

## O que dá para fazer

| Área | Tela | O que faz |
| --- | --- | --- |
| Visão geral | `/` | Última rodagem de cada módulo, saúde e aviso de rodagem nova. |
| Módulo | `/modulo/:slug` | Resumo, falhas com evidências, comparador de arquivos, agrupamento das falhas por IA, performance (tempo dos casos), histórico e casos da rodagem. Dá para trocar de rodagem e importar uma rodagem pela pasta do log compactado. |
| Casos de teste | `/casos-de-teste` | Árvore de casos por módulo, com tempos e casos desmarcados. |
| Jenkins | `/jenkins` | Pedir rodagem completa ou reexecução de casos, com pré-definições e histórico dos pedidos. |
| Regravar | `/regravar` | Regravar no SVN os arquivos base de diferenças esperadas e os tempos base dos casos. |
| Merge | `/merge` | Merge entre branches do TC. |
| Usuários | `/admin/usuarios` | Aprovar cadastros, liberar ações e módulos, e atender pedidos de "Esqueci a senha" (só admin). |

## Acesso e permissões

- **Cadastro** (`/cadastro`): a conta fica pendente até um admin aprovar. O primeiro usuário cadastrado vira admin.
- **Ver rodagens** é livre para quem está logado. As **ações** são liberadas pelo admin, por usuário:
  solicitar rodagem, fazer merge e regravar arquivos. Também por usuário, o admin escolhe em quais
  **módulos** a pessoa pode agir. O admin pode tudo.
- **Esqueci a senha** (`/esqueci-senha`): a pessoa pede pelo login; um admin aprova na aba
  "Redefinir senha" e manda o link gerado (`/redefinir-senha?token=…`). O link é de uso único e vale 24 h.
  O sistema não envia e-mail.
- A sessão expira (24 h por padrão). Um `401` em qualquer chamada leva de volta ao login.

## Onde fica cada parte

| Parte | Onde | Versionamento |
| --- | --- | --- |
| Dashboard (este repositório) | Git; na D01 em `C:\TC\AgentTC-Dashboard` | Git |
| API, pipeline Python e migrações do banco | `Util Compartilhado\AgenteTC\PythonRodagem` (`agent_tc_core/`, `database/postgres/`, `tests/`) | SVN |
| Bridges (Jenkins etc.) e scripts das VMs | `Util Compartilhado\AgenteTC` | SVN |

Uma funcionalidade que mexe nos dois lados precisa da API publicada **antes** do dashboard.

## Estrutura do código

| Caminho | Conteúdo |
| --- | --- |
| `src/pages/` | Telas. `ModulePage.tsx` orquestra a tela do módulo; as abas ficam em `src/pages/module/`. |
| `src/components/` | Componentes do app (layout, rotas protegidas, histórico do Jenkins, importação de rodagem...). `ui/` são os componentes shadcn/ui. |
| `src/services/data/` | Cliente REST da API (`apiSource.ts`), contrato (`types.ts`) e configuração (`config.ts`). |
| `src/services/queries.ts` | Consultas com cache (React Query). |
| `src/services/authApi.ts` | Login, cadastro, sessão, usuários e redefinição de senha. |
| `src/contexts/AuthContext.tsx` | Usuário logado e permissões no app. |
| `src/lib/` | Regras puras: permissões, slugs e textos de rodagem, comparação de rodagens, regravação, merge, status dos pedidos. |
| `src/test/` | Testes (Vitest + Testing Library). |
| `deploy/d01/` | Imagem Docker (build + Caddy), Compose e guia do deploy na D01. |

## Desenvolvimento

```bash
npm ci
npm run dev
```

Crie `.env.local` apontando para uma API acessível:

```env
VITE_DATA_PROVIDER=api
VITE_AGENT_TC_API_URL=http://192.168.9.201:8000
```

Sem `VITE_AGENT_TC_API_URL`, o dashboard chama `/api` no mesmo endereço (é o que acontece em produção).
Variáveis `VITE_` entram no JavaScript do navegador: nunca coloque tokens ou senhas nelas.

Para testar uma mudança que também altera a API, suba a API do SVN contra um Postgres local
descartável e aponte `VITE_AGENT_TC_API_URL` para ela, em vez de testar contra a D01.

## Verificações

```bash
npm test
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run build
```

O TypeScript roda em modo `strict`. Onde o `npx` estiver bloqueado, rode direto pelo Node
(`node node_modules/typescript/bin/tsc ...`, `node node_modules/vitest/vitest.mjs run`).

## Comportamentos que valem saber

- **Atualização automática:** visão geral e aviso de rodagem nova a cada minuto (`GET /modules/latest-runs`);
  histórico do Jenkins a cada 10 s enquanto houver pedido ativo, senão a cada minuto. Os intervalos
  pausam com a aba em segundo plano.
- **Depois de uma publicação:** uma aba aberta antes do deploy pode pedir arquivos da versão anterior,
  que não existem mais. O dashboard recarrega a página sozinho uma vez (`src/lib/recarregarAposPublicacao.ts`).
- **Comparador de arquivos:** o editor Monaco é servido pelo próprio dashboard em `/monaco/vs`
  (copiado de `node_modules/monaco-editor/min/vs` pelo plugin `monaco-static` do `vite.config.ts`),
  sem CDN e fora do bundle.

## Deploy

Na D01 o dashboard roda no container `agent-tc-web` (Caddy, porta `8000`). Ele serve o site e
encaminha `/api/*` e as rotas técnicas para a API na porta `8001`. O build da imagem usa
`VITE_AGENT_TC_API_URL=/api`, e o `.env` não entra na imagem (`.dockerignore`).

```powershell
cd C:\TC\AgentTC-Dashboard\deploy\d01
.\run_agent_tc_public_up.bat
```

Detalhes em [deploy/d01/DEPLOY_PUBLICO_D01.md](deploy/d01/DEPLOY_PUBLICO_D01.md).
