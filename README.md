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

## Design system W3

Os tokens centrais ficam em `src/app/globals.css`. Componentes React devem consumir CSS variables, evitando hexadecimais hardcoded fora de assets como `public/logo-w3.svg`.
