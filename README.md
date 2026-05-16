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

A Fase 0 deixa as variaveis documentadas, mas nao cria recursos remotos. Para concluir conexao real de Supabase e Vercel, configure:

- `DATABASE_URL` e `DIRECT_URL` de um PostgreSQL/Supabase.
- Variaveis Auth.js e OAuth.
- Variaveis de providers Meta, Google Ads e Shopify nas fases correspondentes.
- Projeto Vercel apontando para este repositorio.

## Design system W3

Os tokens centrais ficam em `src/app/globals.css`. Componentes React devem consumir CSS variables, evitando hexadecimais hardcoded fora de assets como `public/logo-w3.svg`.
