# Adstart W3

SaaS B2B de marketing analytics para e-commerces, com dashboard unico de vendas, midia paga e performance operacional.

## Stack local

- Next.js 15 App Router
- React 19
- TypeScript estrito
- Tailwind CSS v4 com tokens W3 em CSS variables
- Prisma 5 preparado para PostgreSQL/Supabase
- Vitest + Testing Library
- Playwright

## Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run dev
```

Abra `http://localhost:3000`.

## Scripts

```bash
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run e2e
```

## Ambientes externos

A Fase 1 deixa Supabase como contrato local, sem aplicar nada remotamente. Para concluir conexao real de Supabase e Vercel, configure:

- `DATABASE_URL` e `DIRECT_URL` de um PostgreSQL/Supabase.
- `NEXTAUTH_SECRET` ou `AUTH_SECRET` com `openssl rand -base64 32`.
- Variaveis Auth.js e OAuth.
- `RESEND_API_KEY` quando quiser envio real de reset de senha e convites.
- Variaveis de providers Meta, Google Ads e Shopify nas fases correspondentes.
- Projeto Vercel apontando para este repositorio.

Enquanto Supabase nao existir, as telas publicas (`/login`, `/sign-up`, `/forgot-password`) renderizam normalmente. A criacao real de conta e o dashboard autenticado precisam do banco configurado.

## Auth e tenancy

- Email/senha usa sessao persistida na tabela `Session`, compativel com o cookie `authjs.session-token`.
- Google OAuth fica configurado via Auth.js + Prisma Adapter quando `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` existirem.
- Signup cria `User`, `Workspace`, `Membership(OWNER)` e dashboard padrao em transacao.
- Convites de workspace ficam em `WorkspaceInvite`; envio por email e no-op local enquanto `RESEND_API_KEY` nao estiver definida.
- RLS Supabase esta versionado em `prisma/migrations/20260516221000_auth_multi_tenant/migration.sql` como placeholder para um futuro JWT compativel com `auth.uid()`.

## Conector Meta Ads

A Fase 2 ja tem a base local do OAuth da Meta sem exigir Supabase real:

- `/api/connectors/meta/connect` gera `state` CSRF em cookie httpOnly e redireciona para o Facebook.
- `/api/connectors/meta/callback` valida `state`, protege modo demo e, com auth/banco ativos, salva `ConnectorAccount` com token AES-256-GCM.
- `src/lib/connectors/retry.ts` aplica retry exponencial com jitter e respeita `Retry-After`.
- `src/lib/connectors/meta/client.ts` troca `code` por token, troca para long-lived token e lista ad accounts.

Para testar conexao real depois de criar Supabase/Auth, configure:

```bash
AUTH_DISABLED="false"
TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)"
META_API_VERSION="v25.0"
META_APP_ID="..."
META_APP_SECRET="..."
META_REDIRECT_URI="http://localhost:3000/api/connectors/meta/callback"
```

Com `AUTH_DISABLED="true"`, a tela `/connectors` continua funcionando para demo e mostra quando as variaveis da Meta ainda estao pendentes.

## Conectores Google Ads e Shopify

As bases das Fases 3 e 4 tambem estao preparadas sem chamar providers em ambiente sem credenciais:

- Google Ads usa OAuth offline, `customers:listAccessibleCustomers`, GAQL via REST e job Inngest `connector.google_ads.backfill`.
- Shopify usa OAuth com validacao HMAC, GraphQL Orders, webhook assinado em `/api/webhooks/shopify` e job `connector.shopify.backfill`.
- Tokens de acesso ficam criptografados com `TOKEN_ENCRYPTION_KEY`; refresh token do Google fica salvo como envelope criptografado.

Variaveis adicionais:

```bash
GOOGLE_ADS_API_VERSION="v24"
GOOGLE_ADS_CLIENT_ID="..."
GOOGLE_ADS_CLIENT_SECRET="..."
GOOGLE_ADS_DEVELOPER_TOKEN="..."
GOOGLE_ADS_LOGIN_CUSTOMER_ID="" # opcional para MCC
GOOGLE_ADS_REDIRECT_URI="http://localhost:3000/api/connectors/google-ads/callback"

SHOPIFY_API_VERSION="2026-04"
SHOPIFY_APP_API_KEY="..."
SHOPIFY_APP_API_SECRET="..."
SHOPIFY_REDIRECT_URI="http://localhost:3000/api/connectors/shopify/callback"
SHOPIFY_SCOPES="read_orders,read_products,read_customers,read_analytics"
```

## Dashboard core

A rota `/dashboard` usa `src/lib/metrics/aggregator.ts` para calcular:

- Faturamento por `EcommerceOrder.orderTotal`
- Investimento por `DailyMetric.spend`
- ROAS blended
- Pedidos
- Serie diaria de faturamento x investimento
- Top 10 campanhas por ROAS
- Funil de impressoes, cliques, sessoes e pedidos

Com `AUTH_DISABLED="true"`, o dashboard usa dados demo deterministas para permitir QA visual sem Supabase. Com auth/banco ativos, os mesmos componentes passam a ler `EcommerceOrder` e `DailyMetric`.

## Dashboards customizaveis

A rota `/dashboards` lista paineis do workspace e `/dashboards/new` cria dashboards com widgets selecionados do catalogo MVP em `src/lib/metrics/kpi-catalog.ts`.

- 12 widgets disponiveis: KPIs, grafico receita x investimento, tabela de campanhas, funil e distribuicao de fonte.
- `/dashboards/[id]` permite adicionar, remover e ordenar widgets por botoes de subir/descer.
- OWNER e ADMIN editam; VIEWER apenas consulta.
- Com `AUTH_DISABLED="true"`, dashboards criados sao persistidos em cookie local para QA sem banco.
- Com auth/banco ativos, a persistencia usa `Dashboard.layout` e `Dashboard.widgets` no Prisma.

## Design system W3

Os tokens centrais ficam em `src/app/globals.css`. Componentes React devem consumir CSS variables, evitando hexadecimais hardcoded fora de assets como `public/logo-w3.svg`.
