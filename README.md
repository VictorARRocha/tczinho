# Agent TC — Dashboard

Interface web do Agent TC: mostra as rodagens do TestComplete por módulo
(falhas, evidências, comparação de arquivos, agrupamento por IA e performance)
e envia pedidos de execução ao Jenkins. Todos os dados vêm da API Agent TC
(repositório `agent-tc-api`); o dashboard não acessa banco nem storage.

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `src/pages/` | Telas. `ModulePage.tsx` orquestra a tela do módulo; as abas ficam em `src/pages/module/`. |
| `src/services/data/` | Cliente REST da API (`apiSource.ts`) e contrato (`types.ts`). |
| `src/services/queries.ts` | Consultas com cache (React Query): módulos, resumo por módulo, hierarquia, histórico do Jenkins. |
| `src/services/authApi.ts` | Login/sessão. Um `401` em qualquer chamada leva de volta ao login. |
| `src/lib/` | Regras puras: pareamento base/atual, classificação de ocorrências, slugs de rodagem, Monaco local. |
| `src/components/ui/` | Componentes shadcn/ui usados pelo app. |
| `deploy/d01/` | Imagem Docker (build + Caddy), Compose e guia do deploy na D01. |

## Desenvolvimento

```bash
npm ci
npm run dev
```

Crie `.env.local` apontando para uma API acessível, por exemplo:

```env
VITE_DATA_PROVIDER=api
VITE_AGENT_TC_API_URL=http://192.168.9.201:8000
```

Variáveis `VITE_` entram no JavaScript do navegador: nunca coloque tokens ou senhas nelas.

## Verificações

```bash
npm test
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run build
```

O TypeScript roda em modo `strict`.

## Atualização automática

- Visão geral e aviso de rodagem nova: `GET /modules/latest-runs` a cada minuto.
- Histórico do Jenkins: a cada 10 s enquanto houver pedido ativo, senão a cada minuto.
- Os intervalos pausam com a aba do navegador em segundo plano.

## Comparador de arquivos

O editor Monaco é servido pelo próprio dashboard em `/monaco/vs` (copiado de
`node_modules/monaco-editor/min/vs` pelo plugin `monaco-static` do
`vite.config.ts`), sem depender de CDN e sem passar pelo bundle.

## Deploy

Na D01 o dashboard roda no container `agent-tc-web` (porta `8000`), que também
encaminha `/api/*` para a API. Veja [deploy/d01/DEPLOY_PUBLICO_D01.md](deploy/d01/DEPLOY_PUBLICO_D01.md).
