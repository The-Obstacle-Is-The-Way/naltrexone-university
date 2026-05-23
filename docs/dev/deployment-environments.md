# Deployment Environments: Source of Truth

**Last Reviewed (code/docs):** 2026-05-23

This document is the repo-backed source of truth for environment scoping and the operator checklist around Clerk, Stripe, Postgres/Neon, and Vercel.

It intentionally avoids hard-coding private dashboard values that the repo cannot self-verify, such as exact account IDs, branch hostnames, webhook secrets, or live price IDs. Those belong in the providers themselves. This document records the contract the codebase expects.

---

## Environment Model

| Environment | URL shape | Branch / deploy source | Auth + billing mode | Database target | Notes |
|-------------|-----------|------------------------|---------------------|-----------------|-------|
| Production | `https://addictionboards.com` | `main` | Clerk live + Stripe live | Isolated production database | Vercel Production deployment |
| Preview | `https://*.vercel.app` on non-`main` branches | Any non-`main` branch | Clerk test/dev + Stripe test | Isolated non-production database | Public URL required for webhook testing |
| Local app runtime | `http://localhost:3000` or `http://127.0.0.1:3000` | Local checkout | Clerk test/dev + Stripe test | Whatever `DATABASE_URL` in `.env.local` points to | Should mirror Preview semantics, not Production |
| Local integration tests | n/a | Local checkout | Clerk skipped (`NEXT_PUBLIC_SKIP_CLERK=true`) | Docker Postgres on `localhost:5434` via `.env.test` | Uses `pnpm db:test:*` scripts |

### Core isolation rule

Production, Preview, and local development must never share the same live database or live billing/auth keys.

### Current Vercel/Neon Branch Contract

The current Vercel + Neon setup uses one Neon project with isolated database branches:

- Vercel **Production** targets the Neon `main` branch.
- Vercel **Preview** and **Development** target the Neon `dev` branch.
- Local `.env.local` should be pulled from or kept equivalent to the Vercel Development environment, so local app runtime and authenticated local E2E also target the Neon `dev` branch.

Do not hard-code branch hostnames, account ids, passwords, or connection strings in the repo. Verify those values through the Vercel Storage dashboard, Vercel environment variables, or a local redacted host check before running migrations.

---

## Code-Enforced Contract

These rules are enforced by the repo today:

- `lib/env.ts` requires `DATABASE_URL`, Stripe keys, Stripe price IDs, and `NEXT_PUBLIC_APP_URL` in every runtime.
- `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` and `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL` must start with `price_`.
- Clerk keys are required unless `NEXT_PUBLIC_SKIP_CLERK=true`.
- `NEXT_PUBLIC_SKIP_CLERK=true` is allowed for local/CI non-production flows, but it is rejected when `VERCEL_ENV=production`.
- `CLERK_WEBHOOK_SIGNING_SECRET` is required at Vercel production runtime when Clerk is enabled.
- `CRON_SECRET` is intentionally not startup-validated. The cron route validates it at request time and returns `401` when it is missing or invalid.
- Sentry DSNs are optional. `instrumentation.ts` logs `[SENTRY_DISABLED] ...` on Vercel production when server telemetry is unset.
- `playwright.config.ts` loads `.env.local` first, then `.env`, and uses `NEXT_PUBLIC_APP_URL` for `baseURL`.
- `NEXT_PUBLIC_*` values are build-time values. Changing them requires a fresh build.

---

## Intended Operator Scoping

| Variable family | Production | Preview | Development / local |
|-----------------|------------|---------|----------------------|
| `DATABASE_URL` | Production database only | Isolated non-production database | Non-production database only |
| Clerk keys | Live production Clerk instance | Test/development Clerk instance | Test/development Clerk instance |
| Clerk webhook secret | Production Clerk webhook | Preview/dev Clerk webhook if used | Local/dev webhook secret if used |
| Stripe secret + publishable keys | Live mode | Test mode | Test mode |
| Stripe price IDs | Live price IDs | Test price IDs | Test price IDs |
| `NEXT_PUBLIC_APP_URL` | Canonical production domain | Actual preview deployment URL | Local origin you are serving (`127.0.0.1` or `localhost`) |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Optional, set intentionally | Optional | Optional |
| `CRON_SECRET` | Required anywhere cron route is exercised | Required if you hit cron route | Required if you hit cron route |

### Stripe account rule

Stripe live mode and test mode should remain on the same Stripe account. This avoids cross-account price/customer drift and matches the historical fix documented in [BUG-079](../_archive/bugs/bug-079-preview-dev-environment-verification-failures.md).

### Clerk key pairing rule

`CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` must come from the same Clerk instance and the same environment type (`test` vs `live`). `lib/env.ts` validates both conditions.

---

## Known Gotchas

### Vercel Deployment Protection Blocks Webhooks

If Vercel Standard Protection is enabled for Preview deployments, Clerk and Stripe webhooks will be intercepted by Vercel auth before they reach your route handlers.

Preview webhook targets must therefore be publicly reachable without Vercel login gates, or webhook testing must use another public endpoint.

See [BUG-080](../_archive/bugs/bug-080-vercel-env-var-deployment-issues.md).

### Trailing `\n` in Vercel Dashboard Env Vars

When pasting secrets into the Vercel dashboard, invisible trailing newline characters can be stored. This silently breaks authorization headers and signature checks.

**Prevention**

- Use `printf '%s'` when piping values to `vercel env add`.
- Do not use `echo`, which appends a newline.
- After setting a secret, pull it back and inspect it if behavior looks suspicious.

### `NEXT_PUBLIC_*` Vars Require Fresh Builds

`NEXT_PUBLIC_*` values are inlined at build time. Updating the environment variable alone is not enough.

If you change `NEXT_PUBLIC_APP_URL`, Clerk publishable keys, Stripe publishable keys, or any other `NEXT_PUBLIC_*` value, trigger a fresh build rather than relying on a cached redeploy.

### Missing Database Migration Causes Silent Write Failures

When code references a newly added column but the target database has not had `pnpm db:migrate` run yet, reads can still work while writes fail with generic `Internal error` responses.

**Typical symptoms**

- Pages load normally.
- Auth works.
- Server actions that write start failing.
- Logs show Postgres errors such as `column "X" does not exist`.

**Diagnosis**

- Inspect Vercel function logs or local server logs.
- Look for the real Postgres error behind the generic controller error handling.

**Fix**

Run migrations against the exact database backing the failing environment:

```bash
# Preview / shared non-production DB
DATABASE_URL="<preview-or-dev-connection-string>" pnpm db:migrate

# Production DB
DATABASE_URL="<production-connection-string>" pnpm db:migrate
```

For local authenticated E2E, the target database is the `DATABASE_URL` in `.env.local`. Confirm that it is a non-production Neon branch first, then run migrations against that file's target:

```bash
# Prints only the host, not the password.
node -e "require('dotenv').config({ path: '.env.local' }); const u = new URL(process.env.DATABASE_URL); console.log(u.hostname)"

# Use .env.local deliberately by clearing any shell-level DATABASE_URL override.
env -u DATABASE_URL pnpm db:migrate
```

Historical example: PR #169 added `claimed_at` to `idempotency_keys`; the code deployed before the non-production database was migrated, which broke write paths until `pnpm db:migrate` was run.

Historical example: SPEC-040 added `attempts.is_omitted` plus two CHECK constraints in migrations `0017` and `0018`; local E2E answer-submission flows failed with "Failed to insert attempt" until the Neon `dev` branch was migrated.

### Clerk Development Mode Can Re-Authenticate After Stripe Checkout

In Clerk development mode, non-production sessions may rely on development-mode transport that behaves differently from production cookies. A redirect back from Stripe can therefore land on a sign-in screen in dev/preview even though the equivalent production flow would stay signed in.

Treat this as an environment-mode behavior difference first, not automatically as a production auth bug.

---

## Operator Verification Checklist

When changing environment configuration, verify all of the following:

1. Production uses production/live auth and billing keys only.
2. Preview/local use non-production auth and billing keys only.
3. Production and non-production databases are isolated.
4. `NEXT_PUBLIC_APP_URL` matches the environment actually serving the app.
5. Preview webhook targets are publicly reachable.
6. Any schema change is followed by `pnpm db:migrate` on the target database.
7. Any content change that affects seeded data is followed by `pnpm db:seed` on the target database.
8. Auth and payment flows have been smoke-tested on the target environment after changes.

---

## Related

- [deployment-procedure.md](./deployment-procedure.md)
- [database-rollbacks.md](./database-rollbacks.md)
- [BUG-079](../_archive/bugs/bug-079-preview-dev-environment-verification-failures.md)
- [BUG-080](../_archive/bugs/bug-080-vercel-env-var-deployment-issues.md)
- [proxy.ts](../../proxy.ts)
- [lib/env.ts](../../lib/env.ts)
- [app/api/webhooks/clerk/route.ts](../../app/api/webhooks/clerk/route.ts)
- [app/api/stripe/webhook/route.ts](../../app/api/stripe/webhook/route.ts)
