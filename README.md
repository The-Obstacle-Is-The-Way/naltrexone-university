# Naltrexone University

A subscription question bank for addiction psychiatry and addiction medicine board preparation, sold as Addiction Boards: tutor and exam practice, review, bookmarks and progress, at $29 a month or $199 a year, with a free trial.

Next.js 16 (App Router), Clerk, Stripe, Postgres on Neon through Drizzle ORM, Tailwind CSS v4 with shadcn/ui, Biome, Vitest and Playwright, on Node 24 and pnpm 11.

## Start Here

- **Contributing, as a person or an agent:** [`AGENTS.md`](AGENTS.md) holds the rules, the quality gate and the pull-request process.
- **Documentation:** [ADR-023](docs/adr/adr-023-documentation-organisation.md) explains where each kind of document lives. Open work is in [`docs/records/`](docs/records/README.md), and decisions are in [`docs/adr/`](docs/adr/README.md).
- **Security issues:** report them as [`/.well-known/security.txt`](public/.well-known/security.txt) describes, not in a public issue.

## Local Setup

```bash
pnpm install
cp .env.example .env.local   # fill in the Clerk and Stripe test keys, and DATABASE_URL:
                             # `pnpm local:test:target` prints this clone's local one
pnpm db:test:up              # a local Postgres in Docker, on this clone's own port
DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)" pnpm db:migrate
DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)" pnpm db:seed
pnpm dev
```

Database commands need an explicit `DATABASE_URL`: they refuse to fall back to `.env.local`. A remote target also needs `DB_TARGET_ACK`, set to the value the refusal names.

Before every push, run the full gate in [`AGENTS.md`](AGENTS.md#non-negotiables).
