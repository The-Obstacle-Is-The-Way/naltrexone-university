# Naltrexone University

Subscription-based SaaS question bank for Addiction Psychiatry and Addiction Medicine board exam preparation.

The technical source of truth is `docs/specs/master_spec.md`.

## Stack (Baseline)

- Next.js 16 (App Router)
- Clerk authentication
- Stripe subscriptions ($29/mo, $199/yr)
- Drizzle ORM + Postgres (Neon)
- Tailwind CSS v4 + shadcn/ui
- Biome (lint + format)
- pnpm
- Vitest + Playwright

## Local Setup

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

## Quality Gates

```bash
pnpm lint
pnpm typecheck
pnpm test --run
pnpm test:integration --run
pnpm test:e2e
```
