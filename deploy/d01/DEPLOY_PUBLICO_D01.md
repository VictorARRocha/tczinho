# Publicacao HTTP temporaria do Agent TC na D01

Este deploy deixa dashboard e API no mesmo endereco HTTP. O DuckDNS fornece
somente um nome para o IP publico; ele nao hospeda o sistema e seu token nao e
usado pelo projeto. O Caddy roda localmente em um container, sem conta, mensalidade
ou dependencia de um servico Caddy externo.

> Esta e uma solucao temporaria. Em HTTP, senha e token de sessao trafegam sem
> criptografia. Use apenas pelo periodo aprovado pela empresa e migre para HTTPS
> assim que a infraestrutura puder fornecer certificado ou proxy seguro.

## Arquitetura

```text
http://SEU_SUBDOMINIO.duckdns.org:10443
                         |
                         | NAT existente: 10443 -> D01:8000
                         v
                agent-tc-web (Caddy local)
                   |                 |
                   | /               | /api/* e rotas tecnicas
                   v                 v
               dashboard          D01:8001
                                      |
                                      v
                             PostgreSQL no Docker
```

- Porta `8000` da D01: dashboard e gateway HTTP.
- Porta `8001` da D01: API por tras do gateway.
- Porta `5432`: PostgreSQL somente na rede Docker, nunca publicada na Internet.
- Clientes internos antigos podem continuar chamando `http://192.168.9.201:8000`;
  o gateway tambem encaminha as rotas da API sem o prefixo `/api`.

## 1. Preparar o DuckDNS

1. Crie o subdominio recomendado pelo Fabiano no DuckDNS.
2. Aponte-o para o mesmo IP publico usado pelo endereco externo da empresa.
3. Confirme que ele resolve para esse IP:

```powershell
Resolve-DnsName SEU_SUBDOMINIO.duckdns.org
```

O token do DuckDNS fica apenas com quem administra o registro. Nao o coloque em
`docker.env`, `web.env` ou no Git. Se o IP publico mudar, o registro precisara
ser atualizado no DuckDNS.

## 2. Mover a API para a porta 8001

Na D01, atualize o repositorio `agent-tc-api`. Edite
`C:\TC\Util Compartilhado\AgenteTC\API\deploy\d01\docker.env`:

```env
AGENT_TC_API_PORT=8001
AGENT_TC_PUBLIC_BASE_URL=http://SEU_SUBDOMINIO.duckdns.org:10443/api/files
AGENT_TC_BRIDGE_TOKEN=TOKEN_INTERNO_FORTE
```

Descubra o projeto Compose atual para preservar os mesmos volumes:

```powershell
$agentTcProject = docker inspect agent-tc-api --format '{{ index .Config.Labels "com.docker.compose.project" }}'
$agentTcProject
```

Recrie API e PostgreSQL com o mesmo projeto:

```powershell
cd "C:\TC\Util Compartilhado\AgenteTC\API\deploy\d01"
docker compose -p $agentTcProject --env-file docker.env -f docker-compose.d01.yml up -d --build
```

Isso nao apaga os volumes. Nao use `down -v`. Valide a API diretamente:

```powershell
irm http://127.0.0.1:8001/health
try { irm http://127.0.0.1:8001/runs } catch { $_.Exception.Response.StatusCode.value__ }
```

O primeiro comando deve responder `ok=True`; o segundo deve retornar `401`.
Entre a mudanca da porta e a subida do gateway, o acesso externo ficara
temporariamente indisponivel.

## 3. Subir dashboard e gateway na porta 8000

Atualize o repositorio `tczinho` na D01. Dentro de `deploy\d01`:

```powershell
copy web.env.example web.env
notepad web.env
```

O arquivo precisa apenas disto:

```env
AGENT_TC_PUBLIC_HTTP_PORT=8000
```

Nao ha dominio, token DuckDNS nem certificado nesse arquivo. Suba o container:

```powershell
.\run_agent_tc_public_up.bat
```

No primeiro build, o Docker baixa imagens publicas do Node e Caddy e compila o
dashboard. Depois de construida, a aplicacao roda localmente na D01.

Valide na propria D01:

```powershell
docker ps --filter "name=agent-tc"
irm http://127.0.0.1:8000/health
```

Depois abra:

```text
http://SEU_SUBDOMINIO.duckdns.org:10443
```

Nao use `https://` nesta fase. Teste por uma conexao externa:

- login e logout;
- lista e detalhes das rodagens;
- imagens e arquivos de evidencia;
- agrupamento por IA;
- agendamento e cancelamento;
- envio de uma rodagem pelo Python de rodagem;
- processamento pelo JenkinsBridge.

## NAT e portas

A regra ja criada permanece sem alteracao:

```text
TCP externa 10443 -> 192.168.9.201:8000
```

Nao publicar diretamente `8001`, `5432`, Jenkins, Docker ou volumes. O unico
ponto publico deve continuar sendo a porta externa `10443` que chega ao gateway.

## Atualizacoes futuras

API:

```powershell
cd "C:\TC\Util Compartilhado\AgenteTC\API\deploy\d01"
$agentTcProject = docker inspect agent-tc-api --format '{{ index .Config.Labels "com.docker.compose.project" }}'
docker compose -p $agentTcProject --env-file docker.env -f docker-compose.d01.yml up -d --build
```

Dashboard:

```powershell
cd "CAMINHO_DO_TCZINHO\deploy\d01"
.\run_agent_tc_public_up.bat
```

O Caddy e parte do container local. Se o DuckDNS ficar indisponivel, os
containers continuam rodando; apenas o nome pode parar de resolver. O endereco
publico por IP e porta ainda pode funcionar enquanto a NAT estiver ativa.

## Hospedagem definitiva

Quando o time Web assumir, o dashboard continuara usando `/api`. O host
definitivo devera encaminhar `/api/*` para a API, preservar o cabecalho
`Authorization` e habilitar HTTPS. PostgreSQL e evidencias podem continuar na
D01 ou ser migrados em uma etapa separada.
