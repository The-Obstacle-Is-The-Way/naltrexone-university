# Deployment Environments: Source of Truth

**Last Reviewed (code/docs):** 2026-06-16

This document is the repo-backed source of truth for environment scoping and the operator checklist around Clerk, Stripe, Postgres/Neon, and Vercel.

It intentionally avoids hard-coding private dashboard values that the repo cannot self-verify, such as exact account IDs, branch hostnames, webhook secrets, or live price IDs. Those belong in the providers themselves. This document records the contract the codebase expects.

---

## Environment Model

| Environment | URL shape | Branch / deploy source | Auth + billing mode | Database target | Notes |
|-------------|-----------|------------------------|---------------------|-----------------|-------|
| Production | `https://addictionboards.com` | `main` | Clerk live + Stripe live | Isolated production database | Vercel Production deployment |
| Preview | `https://*.vercel.app` on non-`main` branches | Any non-`main` branch | Clerk test/dev + Stripe test | Isolated non-production database | Public URL required for webhook testing |
| Local app runtime | `http://localhost:3000` or `http://127.0.0.1:3000` | Local checkout | Clerk test/dev + Stripe test | Whatever `DATABASE_URL` in `.env.local` points to | Should mirror Preview semantics, not Production |
| Local E2E | Resolver-scoped `http://127.0.0.1:<port>` | Local checkout | Clerk test/dev + Stripe test from `.env.local` | Resolver-scoped Docker Postgres via `scripts/resolve-local-test-target.ts` | `pnpm test:e2e` migrates/seeds Docker; `.env.local` database is used only with `E2E_USE_EXISTING_DATABASE=true` |
| Local integration tests | n/a | Local checkout | Clerk skipped (`NEXT_PUBLIC_SKIP_CLERK=true`) | Resolver-scoped Docker Postgres via `scripts/resolve-local-test-target.ts` | Uses `pnpm db:test:*` scripts |

### Core isolation rule

Production, Preview, and local development must never share the same live database or live billing/auth keys.

### Current Vercel/Neon Branch Contract

The current Vercel + Neon setup uses one Neon project with isolated database branches:

- Vercel **Production** targets the Neon `main` branch.
- Vercel **Preview** and **Development** target the Neon `dev` branch.
- Local `.env.local` should be pulled from or kept equivalent to the Vercel Development environment for local app runtime. Normal authenticated local E2E uses the resolver-scoped Docker database; use `E2E_USE_EXISTING_DATABASE=true` only for deliberate deploy-target E2E checks.

Redacted Vercel metadata checked on 2026-06-16 confirms a `DATABASE_URL` entry exists in Production, Preview, and Development scopes, with no git-branch-specific override observed. A value-free host comparison on 2026-06-16 (each scope's `DATABASE_URL` pulled to a temp directory outside the repo, compared by host, booleans only — no connection strings or hostnames recorded) confirmed that the **Production** host is distinct from both **Preview** and **Development**, and that **Preview** and **Development** resolve to the **same** non-production host. This matches the contract above: production is isolated from the shared non-production database. The literal Neon branch *names* behind each value are confirmable in the Neon/Vercel dashboards; the safety-critical isolation is verified in-repo here without recording any secret.

Do not hard-code branch hostnames, account ids, passwords, or connection strings in the repo. Verify those values through the Vercel Storage dashboard, Vercel environment variables, or a local redacted host check before running migrations.

### Deploy Migration Contract

Current live state while [BUG-241](../bugs/bug-241-deploy-pipeline-has-no-migration-step.md) is open: Vercel has no Build Command override and does not run `pnpm db:migrate` during deploy. Schema migrations against Vercel Preview/Development and Production databases remain manual operator actions.

Accepted target after BUG-241 closes: the Vercel Project Build Command runs `pnpm db:migrate && pnpm build`, so checked-in Drizzle migrations apply to the environment-scoped `DATABASE_URL` before the deployment can serve. The minimum fallback is a required drift gate that compares `db/migrations/meta/_journal.json` `entries[].when` to `drizzle.__drizzle_migrations.created_at` and fails closed if the target DB is behind.

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

### Header-Safe `CRON_SECRET` Across Vercel Scopes

`CRON_SECRET` is used as an HTTP `Authorization: Bearer ...` value for the Vercel cron route. Once a `crons` block exists in `vercel.json`, Vercel validates that raw env value as an HTTP header during deployment. A value with leading/trailing whitespace or control characters fails before `next build` runs, so application code cannot fix it with `.trim()`.

Vercel stores environment variables per scope. Production, Preview, Development, and git-branch-specific Preview overrides can each carry different bytes for the same name. Keep `CRON_SECRET` non-empty, identical, and header-safe in every scope where cron or manual cron calls are expected.

**Prevention**

- Use `printf '%s'` when piping values to `vercel env add`.
- Do not use `echo`, which appends a newline.
- Do not silently trim secrets in application code; reject or reset the bad value at the provider.
- After setting a secret, verify only safe metadata: present, length, trim delta, leading/trailing/internal whitespace booleans, and header-unsafe booleans. Never print the value.
- In GitHub Actions, `scripts/validate-header-safe-secret.ts` checks any observable `CRON_SECRET` secret without logging the value. This does not validate Vercel env stores; Vercel Production/Preview/Development still need provider-side verification after changes.

**Safe Vercel reset procedure**

The owner supplies the actual secret value. Do not paste it into tickets, docs, shell history, or chat.

```bash
# Generate a candidate without a trailing newline if rotating the value.
openssl rand -hex 32

# Set each scope from stdin using printf, not echo.
printf '%s' "$CRON_SECRET_VALUE" | vercel env add CRON_SECRET production --force
printf '%s' "$CRON_SECRET_VALUE" | vercel env add CRON_SECRET preview --force
printf '%s' "$CRON_SECRET_VALUE" | vercel env add CRON_SECRET development --force

# Remove stale branch-specific overrides unless a branch truly needs different bytes.
vercel env rm CRON_SECRET preview <branch-name> --yes
```

After resetting, redeploy the affected Preview and Production targets. Env changes do not repair an already-created deployment.

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
- Compare the repo migration journal to the target DB ledger. Reuse the DEBT-391 primitive: `db/migrations/meta/_journal.json` `entries[].when` must be present in `drizzle.__drizzle_migrations.created_at`.

**Fix while BUG-241 is open / manual fallback after BUG-241 closes**

Run migrations against the exact database backing the failing environment:

```bash
# Preview / shared non-production DB
DATABASE_URL="<preview-or-dev-connection-string>" pnpm db:migrate

# Production DB
DATABASE_URL="<production-connection-string>" pnpm db:migrate
```

For normal local authenticated E2E, do not migrate the `.env.local` database. `pnpm test:e2e` resolves an isolated Docker Postgres target through `scripts/resolve-local-test-target.ts`, then runs migrations and seed against that Docker URL before Playwright starts.

Only use `.env.local`'s `DATABASE_URL` for an intentional deploy-target E2E check with `E2E_USE_EXISTING_DATABASE=true`. Confirm that it is a non-production Neon branch first, then run migrations against that explicit target:

```bash
# Prints only the host, not the password.
LOCAL_E2E_DATABASE_URL="$(node -e "require('dotenv').config({ path: '.env.local', quiet: true }); const url = process.env.DATABASE_URL; if (!url) throw new Error('Missing DATABASE_URL in .env.local'); process.stdout.write(url)")"
node -e "const u = new URL(process.argv[1]); console.log(u.hostname)" "$LOCAL_E2E_DATABASE_URL"

# Migrate only the deploy target you just verified.
DATABASE_URL="$LOCAL_E2E_DATABASE_URL" pnpm db:migrate

# Then opt into using that existing database for E2E.
E2E_USE_EXISTING_DATABASE=true DATABASE_URL="$LOCAL_E2E_DATABASE_URL" pnpm test:e2e
```

Do not run migrations by relying on implicit `.env.local` resolution. Every database mutation should pass an explicit `DATABASE_URL` for the intended target.

**Prevention after BUG-241 closes**

The Vercel Build Command must run `pnpm db:migrate && pnpm build` for git-triggered Preview and Production builds. If that cannot be enabled immediately, a required drift gate must fail closed before a deployment can serve when the target DB ledger is behind the repo journal. Keep migrations forward-only and additive where possible; use expand/contract for destructive changes.

Historical example: PR #169 added `claimed_at` to `idempotency_keys`; the code deployed before the non-production database was migrated, which broke write paths until `pnpm db:migrate` was run.

Historical example: SPEC-040 added `attempts.is_omitted` plus two CHECK constraints in migrations `0017` and `0018`; deploy-target E2E answer-submission flows failed with "Failed to insert attempt" until the Neon `dev` branch was migrated.

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
6. While BUG-241 is open, any schema change is followed by `pnpm db:migrate` on the target database. After BUG-241 closes, the Vercel Build Command migration or required drift gate is verified for the target deployment before serving.
7. Any content change that affects seeded data is followed by `pnpm db:seed` on the target database.
8. Auth and payment flows have been smoke-tested on the target environment after changes.

---

## Related

- [deployment-procedure.md](./deployment-procedure.md)
- [database-rollbacks.md](./database-rollbacks.md)
- [license-baseline.md](./license-baseline.md)
- [BUG-079](../_archive/bugs/bug-079-preview-dev-environment-verification-failures.md)
- [BUG-080](../_archive/bugs/bug-080-vercel-env-var-deployment-issues.md)
- [proxy.ts](../../proxy.ts)
- [lib/env.ts](../../lib/env.ts)
- [app/api/webhooks/clerk/route.ts](../../app/api/webhooks/clerk/route.ts)
- [app/api/stripe/webhook/route.ts](../../app/api/stripe/webhook/route.ts)
