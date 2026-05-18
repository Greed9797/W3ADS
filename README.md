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
- `/api/connectors/meta/callback` valida `state` assinado e amarrado ao usuario/workspace, protege modo demo e cria uma sessao temporaria de selecao para salvar apenas as contas de anuncio escolhidas.
- `src/lib/connectors/retry.ts` aplica retry exponencial com jitter e respeita `Retry-After`.
- `src/lib/connectors/meta/client.ts` troca `code` por token via POST, troca para long-lived token, lista ad accounts com `Authorization` header e pausa quando o header de uso da Meta passa do limite definido.
- Quando `INNGEST_EVENT_KEY` estiver configurada, cada conta conectada dispara backfill automatico de 90 dias.

Para testar conexao real depois de criar Supabase/Auth:

1. Aplique as migrations no Supabase/Postgres.
2. Ative a extensao Supabase Vault/KMS no projeto.
3. Acesse `/platform/bootstrap` para promover o primeiro usuario a `W3_ADMIN`.
4. Acesse `/connectors/settings` e cadastre as credenciais dos provedores no app.

Com `AUTH_DISABLED="true"`, a tela `/connectors` continua funcionando para demo e mostra os atalhos de configuracao no app. Em producao, deixe `AUTH_DISABLED` vazio ou `false`; o app nao desliga auth por padrao quando `NODE_ENV=production`.

## Conectores Google Ads e Shopify

As bases das Fases 3 e 4 tambem estao preparadas sem chamar providers em ambiente sem credenciais:

- Google Ads usa OAuth offline, `customers:listAccessibleCustomers`, expansao de hierarquia via `customer_client`, selecao apenas de contas anunciante, GAQL via REST, refresh automatico do access token e job Inngest `connector.google_ads.backfill`.
- Shopify usa OAuth com validacao HMAC, GraphQL Orders, registro dos webhooks `orders/create`, `orders/updated`, `orders/paid` e `app/uninstalled`, webhook assinado em `/api/webhooks/shopify` e job `connector.shopify.backfill`.
- Nuvemshop usa OAuth oficial, token sem expiracao e `user_id` como loja; pedidos entram no job generico `connector.ecommerce.backfill`.
- iSet, Tray, WBuy e Magazord usam conexao manual REST: URL da API, caminho de pedidos e credenciais sao validados antes de salvar.
- Tokens OAuth, API keys, usuarios/senhas, developer tokens e webhook secrets ficam no Supabase Vault/KMS.
- `ConnectorProviderConfig` guarda apenas campos publicos do app/API por workspace.
- `ConnectorAccount` usa `credentialSecretId` e `refreshCredentialSecretId` para novas conexoes; os campos AES antigos continuam como fallback legado.
- O state de todos os conectores e assinado com `AUTH_SECRET` ou `NEXTAUTH_SECRET`; em producao configure pelo menos um segredo forte.
- Nao existem mais envs obrigatorias `META_*`, `GOOGLE_ADS_*`, `SHOPIFY_*` ou `NUVEMSHOP_*`.

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

## LGPD e beta polish

- `/profile` centraliza conta, privacidade, exportacao e exclusao.
- `/profile/data-export` gera JSON baixavel e registra solicitacao em audit log quando o banco esta ativo.
- `/profile/delete-account` exige confirmacao exata por email; em banco real marca `User.deletedAt` e encerra sessoes.
- Cookie banner e onboarding de 3 passos rodam no client sem dependencia externa.
- `/api/health` retorna status basico do app.
- `/feedback` coleta problemas, duvidas e sugestoes do beta; em demo salva apenas cookie,
  com banco ativo persiste em `BetaFeedback` e grava audit log.
- `NEXT_PUBLIC_POSTHOG_KEY` habilita envio opcional para a Capture API do PostHog.
- Erros capturados no client sao enviados para `/api/observability/client-error`; em demo a rota
  responde sem tocar no banco, com Supabase ativo grava `AuditLog`.
- `NEXT_PUBLIC_POSTHOG_KEY` habilita dispatch local de eventos seguros, sem PII.

## Design system W3

Os tokens centrais ficam em `src/app/globals.css`. Componentes React devem consumir CSS variables, evitando hexadecimais hardcoded fora de assets como `public/logo-w3.svg`.
