# GarranchoGEN

Plataforma web de paleografia e genealogia: restaura, transcreve (HTR) e estrutura
documentos históricos manuscritos — batismos, casamentos, censos, passaportes — por
meio de um pipeline assíncrono de quatro estágios com revisão humana.

> **Estado atual:** Fases 0–3 concluídas (scaffold, Compose, auth LDAP + sessão,
> tipos/Mongoose/storage). Passagem de integração pré-Fase 4 fechou o caminho
> local-dev (overlay `docker-compose.dev.yml`, seed LDAP, healthcheck).
> **Próximo:** Fase 4 (upload). Roadmap em [`tasks/plan.md`](tasks/plan.md) e
> [`tasks/todo.md`](tasks/todo.md).

## Documentação

As especificações são a fonte de verdade e devem ser lidas antes de codificar
qualquer área:

- [`docs/specs/README.md`](docs/specs/README.md) — índice das specs
- [`docs/specs/00-overview.md`](docs/specs/00-overview.md) — objetivo, stack, estrutura, limites
- [`docs/specs/adrs/`](docs/specs/adrs/README.md) — decisões arquiteturais 0001–0008
- [`tasks/prompts/`](tasks/prompts/) — briefing executável de cada fase

## Requisitos

- Node.js 22 ou superior
- Yarn (Classic v1) — ative via `corepack enable`; a versão fica pinada em
  `package.json#packageManager`. Este repositório é **Yarn-only**: `npm`/`npx`/`pnpm` são
  bloqueados por um guard de `preinstall`.

## Comandos

```bash
yarn
yarn dev        # servidor de desenvolvimento
yarn build      # build de produção
yarn start      # serve o build
yarn lint       # ESLint
yarn typecheck  # tsc --noEmit
yarn test       # Vitest (unit/integration)
yarn test:e2e   # Playwright (e2e)
```

Os browsers do Playwright não são baixados pelo `yarn`. Antes do primeiro
`yarn test:e2e`, rode `yarn playwright install`.

## Configuração

Copie [`.env.example`](.env.example) para `.env` e preencha os valores locais.
O arquivo versionado contém apenas **nomes** de variáveis, sem valores.
Nunca faça commit de um `.env` preenchido, de chaves de API reais ou de segredos.

## Deploy

Stack única via Docker Compose em uma VPS (`app`, `database`, `auth-ldap`,
`ldap-ui`, `reverse-proxy`) — sem Kubernetes, sem múltiplas réplicas.

```bash
docker compose config            # valida a stack de produção
docker compose -f docker-compose.yml -f docker-compose.dev.yml config
docker build -t garranchogen-app:local .
# Infra local (Mongo/LDAP em loopback) + seed:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d database auth-ldap ldap-ui
yarn seed:ldap
```

Fluxo completo de deploy (build → push → pull → up), topologia, URIs host vs
Compose, seed LDAP e questões em aberto para ops: [`docs/deploy.md`](docs/deploy.md).

## Idiomas

Textos de interface, documentação funcional e comentários de código (incluindo
JSDoc) em **pt-BR**. Variáveis, funções, métodos, classes, tipos, rotas, chaves
de banco e mensagens de commit em **en-US**.

## Licença

GNU General Public License v3.0 — veja [`LICENSE`](LICENSE).
