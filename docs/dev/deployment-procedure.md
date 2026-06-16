# Deployment Procedure

> **Parent:** [Deployment Environments](./deployment-environments.md)
> **Last Updated:** 2026-06-16

---

## 1. Migration Contract: Manual Today; BUG-241 Target Is Build-Command Migration

Current live state while [BUG-241](../bugs/bug-241-deploy-pipeline-has-no-migration-step.md) is open: Vercel deploys **code only**. Redacted Vercel metadata checked on 2026-06-16 shows no Build Command override, no Install Command override, and no Ignored Build Step, so Vercel falls back to the package `build` script. Vercel does not currently run:

- `pnpm db:migrate` (schema changes)
- `pnpm db:seed` (content data)
- Any other SQL script

Until BUG-241 is implemented, deployed-database migrations and seeds remain manual operator steps, run with an explicit, host-verified `DATABASE_URL`.

Accepted target after BUG-241 closes: configure the Vercel Project Build Command for git-triggered Preview and Production builds to run:

```bash
pnpm db:migrate && pnpm build
```

That will make Vercel apply checked-in Drizzle migrations to the environment-scoped `DATABASE_URL` before the deployment can serve. Seeds remain manual unless a separate content-deploy mechanism is created.

---

## 2. Standard Deployment Flow

```text
1. CI (GitHub Actions)
   └─ pnpm typecheck
   └─ pnpm lint:ci
   └─ pnpm db:migrate            # CI database only
   └─ SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed
   └─ pnpm test:coverage
   └─ pnpm test:integration:coverage
   └─ pnpm test:browser:coverage # pushes + same-repo PRs
   └─ pnpm build
   └─ pnpm test:e2e             # pushes + same-repo PRs
   └─ Must pass before merge

2. Vercel (automatic on push/merge)
   └─ Current while BUG-241 is open: builds and deploys application code only
   └─ Target after BUG-241 closes: pnpm db:migrate && pnpm build
   └─ Preview: any non-main branch
   └─ Production: main branch

3. Operator
   └─ Current while BUG-241 is open: DATABASE_URL="<target>" pnpm db:migrate   # if schema changed
   └─ Target after BUG-241 closes: verify Vercel migration/ledger; use manual migrate only as fallback
   └─ DATABASE_URL="<target>" pnpm db:seed                                    # if content changed
```

**Important:** CI never migrates or seeds the actual Preview/Production database used by Vercel. It only validates migrations and seed logic against the CI database. Until BUG-241 is implemented, target-environment migrations and reseeds are manual operator steps. After BUG-241 is implemented, target-environment schema migration moves to the Vercel Build Command; reseeding remains manual.

---

## 3. Data-Affecting Migration Pattern

When a migration changes enums, renames columns, or otherwise affects data that the seed script populates (e.g., tag taxonomy changes), the migration SQL itself should include the necessary data cleanup. This keeps the procedure to two commands:

```bash
# 1. Apply schema migration (includes any required data cleanup)
DATABASE_URL="<target>" pnpm db:migrate

# 2. Rebuild data from canonical source (MDX files)
DATABASE_URL="<target>" pnpm db:seed

# 3. Verify (optional — recommended for production)
#    SELECT kind, COUNT(*) FROM tags GROUP BY kind;
```

**Design principle:** Migrations that affect seed-managed tables (like `tags`, `question_tags`) should delete the derived rows as part of the migration SQL, so no manual cleanup is needed. The seed script rebuilds them from the canonical MDX source files. See SPEC-033 §14 for a concrete example.

**For additive-only migrations** (new columns, new tables, new enum values), `pnpm db:migrate` alone is sufficient — no reseed needed unless the seed populates the new columns.

---

## 4. Per-Environment Connection

| Environment | How to Connect | DATABASE_URL Source |
|-------------|---------------|---------------------|
| **Local app runtime** | Direct (already in `.env.local`) | `.env.local`, expected to match Vercel Development and the Neon `dev` branch |
| **Local authenticated E2E** | Resolver-scoped Docker Postgres via `pnpm test:e2e` | `scripts/resolve-local-test-target.ts` supplies the explicit local `DATABASE_URL`; use `.env.local` only with `E2E_USE_EXISTING_DATABASE=true` |
| **Preview / shared non-production** | Use your provider CLI/dashboard to fetch the non-production connection string | Vercel Preview/Development env vars, currently the Neon `dev` branch |
| **Production** | Use your provider CLI/dashboard to fetch the production connection string | Vercel Production env vars, currently the Neon `main` branch |
| **Local integration tests** | Resolver-scoped Docker Postgres | `scripts/resolve-local-test-target.ts` supplies the explicit local `DATABASE_URL` |

Example for preview/production:

```bash
DATABASE_URL="<non-production connection string>" pnpm db:migrate
DATABASE_URL="<non-production connection string>" pnpm db:seed
```

If you are using Neon, fetch the connection string for the intended branch first and then pass it explicitly as `DATABASE_URL`.

**Caution:** Always double-check which database/branch you're targeting. Running migrations or seeds against the wrong environment can corrupt data. Production operations should be done deliberately and verified immediately.

**Optional helper:** `pnpm db:seed:all -- --plan` pulls Vercel Development, Preview, and Production env files into a temp directory, compares them with local `.env.local`, and shows the unique seed targets without writing data. `pnpm db:seed:all` then imports drafts as published and seeds each unique `DATABASE_URL` once. It does **not** run migrations; while BUG-241 is open, keep using `pnpm db:migrate` separately when schema changes are involved. After BUG-241 closes, Vercel Build Command migration is responsible for deploy-time schema changes.

Normal local authenticated E2E uses the resolver-scoped Docker database and runs migrations automatically through `pnpm test:e2e`. For an intentional deploy-target E2E check, confirm the host without printing credentials, migrate that target deliberately, then run the suite with `E2E_USE_EXISTING_DATABASE=true`:

```bash
LOCAL_E2E_DATABASE_URL="$(node -e "require('dotenv').config({ path: '.env.local', quiet: true }); const url = process.env.DATABASE_URL; if (!url) throw new Error('Missing DATABASE_URL in .env.local'); process.stdout.write(url)")"
node -e "const u = new URL(process.argv[1]); console.log(u.hostname)" "$LOCAL_E2E_DATABASE_URL"
DATABASE_URL="$LOCAL_E2E_DATABASE_URL" pnpm db:migrate
E2E_USE_EXISTING_DATABASE=true DATABASE_URL="$LOCAL_E2E_DATABASE_URL" pnpm test:e2e
```

Do not rely on implicit `.env.local` resolution for migration commands. Verify the host, then prefix `pnpm db:migrate` with the exact `DATABASE_URL` you intend to mutate.

This is separate from `pnpm test:integration`, which uses the Docker Postgres database and has its own migration/seed setup.

---

## 5. Pre-Deployment Checklist

Before merging to `main` (production deploy):

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint:ci` or `pnpm lint` passes
- [ ] `pnpm test --run` passes
- [ ] `pnpm test:browser` passes
- [ ] `pnpm test:integration` passes
- [ ] `pnpm build` passes
- [ ] `pnpm test:e2e` passes when local auth/billing env is available (CI enforces this on pushes and same-repo PRs)
- [ ] CodeRabbit review completed and feedback addressed
- [ ] If schema changed: migration tested on local + preview DB first
- [ ] While BUG-241 is open: if schema changed, `pnpm db:migrate` run against the target deployed database **immediately after deploy** (forgetting this causes silent write failures — see [Known Gotchas](./deployment-environments.md#missing-database-migration-causes-silent-write-failures))
- [ ] After BUG-241 closes: if schema changed, the Vercel build shows the Build Command migration completed before `pnpm build`, or the DEBT-391-style drift gate/manual fallback failed closed before the deployment served.
- [ ] If content changed: seed tested on local + preview DB first

---

## 6. Branch Sync After Merging to Main

After merging a PR to `main`, the `dev` branch falls behind. To keep them in sync:

```bash
git fetch origin
git switch dev
git merge --ff-only origin/main
git push origin dev
```

This is especially important when the PR included **migrations** — without syncing, any clone on `dev` will have an incomplete migration journal, which can cause confusion (the DB has the tables, but the local journal doesn't know about them).

**Rule of thumb:** Keep `dev` fast-forwarded to `main` after every merge. If `git merge --ff-only origin/main` fails, stop and resolve the divergence explicitly rather than creating an accidental merge commit.

---

## 7. Seeding from Multiple Clones

The seed script is fully idempotent. See [Content Pipeline §16: Seed Idempotency and Multi-Clone Safety](../practice-engine/content-pipeline.md#16-seed-idempotency-and-multi-clone-safety) for the full explanation.

**Key points:**
- The `slug` field is the stable identity key — same slug = same question across any clone or DB
- SHA256 hashing skips unchanged questions entirely (zero writes)
- Seeding the same content from different clones is a no-op
- The only risk is seeding from a clone with *older* imported MDX, which would downgrade content

---

## Related

- [Deployment Environments](./deployment-environments.md) — Env var scoping, Clerk/Stripe/Neon config
- [License Baseline](./license-baseline.md) — Production dependency license distribution and review-worthy exceptions
- [Content Pipeline](../practice-engine/content-pipeline.md) — MDX → seed → DB flow
- [SPEC-033 §14](../_archive/specs/spec-033-tag-taxonomy-migration.md) — Tag taxonomy DB sync procedure
