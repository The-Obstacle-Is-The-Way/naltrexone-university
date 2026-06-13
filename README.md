# Naltrexone University

Subscription-based SaaS question bank for Addiction Psychiatry and Addiction Medicine board exam preparation.

The technical source of truth is `docs/specs/master_spec.md`.

Canonical agent/developer setup and quality-gate instructions live in `AGENTS.md`. Keep this README as a short project entry point, not a duplicated runbook.

## Stack (Baseline)

- Next.js 16 (App Router)
- Clerk authentication
- Stripe subscriptions ($29/mo, $199/yr)
- Drizzle ORM + Postgres (Neon)
- Tailwind CSS v4 + shadcn/ui
- Biome (lint + format)
- Node 24.x
- pnpm >=11.0.0
- Vitest + Playwright

## Local Setup

```bash
pnpm install
cp .env.example .env.local
# Fill .env.local first; db:migrate reads DATABASE_URL from it unless
# you intentionally prefix DATABASE_URL for a specific target.
pnpm db:migrate
pnpm dev
```

## Quality Gates

```bash
pnpm lint
pnpm typecheck
pnpm test --run
pnpm test:browser
pnpm test:integration
pnpm build
pnpm test:e2e
```

Before pushing, follow the full gate in `AGENTS.md` exactly, including the E2E credential check when the local authenticated billing environment is present.
