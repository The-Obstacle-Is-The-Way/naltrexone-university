# Deployment Procedure

> **Parent:** [Deployment Environments](./deployment-environments.md)
> **Last Updated:** 2026-09-19 (production release gate; other procedures retain their existing scope)

---

## 1. Migration Contract: Build-Command Migration

[BUG-241](../_archive/bugs/bug-241-deploy-pipeline-has-no-migration-step.md) is fixed. The Vercel Build Command is set in `vercel.json` (`buildCommand`) to run:

```bash
pnpm exec tsx scripts/verify-migration-ledger.ts pre \
  && pnpm exec tsx scripts/internal/run-managed-db-migrate.ts \
  && pnpm exec tsx scripts/verify-migration-ledger.ts post \
  && pnpm build
```

The pre-check rejects applied-row content drift and ledger-only rows while
allowing expected pending journal entries. Vercel then applies checked-in
Drizzle migrations to the environment-scoped `DATABASE_URL`; the post-check
requires the ledger to match the checkout exactly before building. This is live
on Preview/Development builds immediately and on Production once the change is
on `main`. Any failed check or migration fails the build closed, so the
currently-serving deployment stays up.

Migration authors must also answer the N-1 compatibility question in
[Migration Authoring → Deployed-Code Compatibility](./migration-authoring.md#deployed-code-compatibility):
the currently serving code must remain compatible with the migrated schema
until promotion.

Vercel still does **not** automatically run:

- `pnpm db:seed` (content data) — seeds remain a manual operator step
- Any other SQL script

For seeds, and for any manual deploy-target migration fallback, use an explicit, host-verified `DATABASE_URL`.

---

## 2. Standard Deployment Flow

### Keyed-action output compatibility

Any incompatible output-schema change to an idempotent keyed action must ship
change-local replay parsers and pre-deploy cached fixtures for every writer
shape that can coexist during the 24-hour idempotency TTL, including every
shape a rollback target can resume. Multiple incompatible releases or a
rollback inside that interval add to the supported parser/fixture set; they do
not replace still-coexistable shapes.

Retain each shape's replay support until its last writer has been absent from
serving traffic for one full TTL. Unknown or corrupt shapes remain fail-loud,
with the completed row preserved and no re-execution. Do not delete/reclaim the
completed row, treat incompatibility as a cache miss, or return unvalidated
JSON. This is a per-change release obligation, not a permanent versioned
envelope or upcaster framework.

```text
1. Promotion PR (dev → main): CI (GitHub Actions)
   └─ pnpm typecheck
   └─ pnpm lint:ci
   └─ pnpm exec tsx scripts/internal/run-managed-db-migrate.ts # CI database only
   └─ SEED_INCLUDE_PLACEHOLDERS=true pnpm exec tsx scripts/internal/run-managed-db-seed.ts
   └─ pnpm test:coverage
   └─ pnpm test:integration:coverage
   └─ pnpm test:browser:coverage # every trigger; no provider secret required
   └─ pnpm build
   └─ pnpm test:e2e             # main pushes + non-Dependabot same-repo PRs
   └─ Must pass before merge

2. After merge to main (in parallel)
   └─ GitHub Actions runs test again on the main merge commit, including E2E
   └─ Vercel creates a production deployment of that same commit
   └─ buildCommand (vercel.json): pre-check → managed migrate → exact post-check → build
   └─ Deployment Check: GitHub test must pass before production domains move
   └─ Preview builds remain independent; the release check targets production only

3. Operator
   └─ Verify the Vercel build ran the migration before serving; manual migrate only as fallback
   └─ Obtain the exact DB_TARGET_ACK for DATABASE_URL, then run the manual seed # if content changed
```

**Important:** CI never migrates or seeds the actual Preview/Production database used by Vercel. It only validates migrations and seed logic against the CI database. Target-environment schema migration and ledger verification run via the Vercel Build Command; reseeding remains a manual operator step.

### Production Deployment Check

The owner chose Vercel's built-in [GitHub Deployment Checks](https://vercel.com/docs/deployment-checks#github-checks), not a custom deployment runner. The feature is [available to GitHub-connected projects](https://vercel.com/changelog/block-vercel-deployment-promotions-with-github-actions); the 2026-09-19 read-only check confirmed this project's Hobby plan, GitHub link, `main` production branch, and enabled automatic production aliasing. This setting is operator-managed in Vercel, not encoded by `ci.yml`.

Required configuration: project Settings → Deployment Checks → Add Checks → GitHub → **`test`**, targeting **Production** and blocking production-domain assignment. Keep automatic production aliasing enabled. The `test` job is unique across the current three workflows; changing its name or duplicating it requires revisiting this setting. There is no `repository_dispatch` workflow or additional status-reporting action: Vercel consumes the existing push check on the same commit. Preview deployments are not blocked by this production-only check.

**Configuration receipt (2026-09-19 21:28:31Z):** the project's Checks V2 API returned one GitHub-source check named `test`, with `externalCheckName=test`, `targets=[production]`, `requires=build-ready`, `blocks=deployment-alias`, and `timeout=3600`. Automatic production aliasing remained enabled. Configuration alone is not release evidence; the first enforcement receipt follows.

**Enforcement receipt (2026-09-20, promotion #925):** main commit `87c28aff7050954ea48da74a264174979f295aba` built Ready at `04:33:45.169Z`, but repeated API observations through `04:42:22Z` showed `READY/STAGED`, `aliasAssigned=false`, and the previous release still assigned to `addictionboards.com`. Main CI [35489402144](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35489402144) completed `test` successfully at `04:42:25Z`; Vercel's check succeeded at `04:42:27.096Z`, and the production alias moved at `04:42:27.273Z`. The resulting state was `READY/PROMOTED`, serving that main commit; `/` and `/api/health` returned `200`. Dev/main shared tree `5affbe4600d75c465f79d45efc7547ab4e77b3ec`. [The observation receipt](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/925#issuecomment-5747683444) records the hold; no Force Promote or CI rerun was used.

The deleted `deploy` job only echoed a message. Its success never proved that production waited for CI. Repository tests pin its removal; they do **not** prove the live Vercel setting. Read back the project's checks after configuration changes, and prove the first promoted commit end to end:

1. Record the main merge SHA and that commit's GitHub `test` run ID, conclusion, and completion timestamp.
2. Record the matching Vercel deployment's commit, build completion, required check outcome, and production-domain assignment timestamp. Observe it withheld from the production domains while `test` is pending; build Ready alone is not release evidence.
3. Confirm production-domain assignment happened only after `test` succeeded, then check `/` and `/api/health` and compare `origin/dev^{tree}` with `origin/main^{tree}`.

On a failed, cancelled, missing, or timed-out check, keep the previous release serving and investigate. Do not use **Force Promote**. A missing check requires checking the job name and workflow trigger; a failed E2E requires defect investigation, not retry-to-green.

**Database caveat:** the production migration runs during the Vercel build, **before** Deployment Checks permit promotion. The gate does not postpone or roll back that migration. The old application may therefore keep serving against the new schema throughout CI or indefinitely after a failed check. [DEBT-445 Part 3](../_archive/debt/debt-445-migration-deploy-pipeline-guardrails.md) already established the [deployed-code compatibility contract](./migration-authoring.md#deployed-code-compatibility): expand first, deploy compatible readers/writers, contract only after old code no longer needs the old shape. This gate preserves that obligation rather than replacing it.

For a manual Preview or Production reseed, export the verified target, run the
guard once without an acknowledgement, and confirm it refuses before opening
Postgres while printing the required credential-free JSON token. Copy that
token byte-for-byte into `DB_TARGET_ACK`, then repeat the seed:

```bash
export DATABASE_URL="<verified-target>"
pnpm db:seed # expected refusal; copy the exact required DB_TARGET_ACK JSON
export DB_TARGET_ACK='["host/database"]'
pnpm db:seed
```

Manual reseeds refuse in-place answer-key flips over existing graded history by
default. If `pnpm db:seed` reports
`Refusing to change answer key ... because graded history exists`, treat that as
a content-data decision point: fork/version the question, accept the blocked
import, or rerun only with an explicit operator override:
`SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY=true DATABASE_URL="<target>" DB_TARGET_ACK='["host/database"]' pnpm db:seed`.
The override logs the affected question slug, changed labels, and graded row
counts.

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

For authoring rules before a migration PR merges — pre-flight data proof, cleanup row-count notices, operation ordering, and lock-scope review — see [Migration Authoring](./migration-authoring.md).

---

## 4. Per-Environment Connection

| Environment | How to Connect | DATABASE_URL Source |
|-------------|---------------|---------------------|
| **Local app runtime** | Direct (already in `.env.local`) | `.env.local`, expected to match Vercel Development and the Neon `dev` branch |
| **Local authenticated E2E** | Resolver-scoped Docker Postgres via `pnpm test:e2e` | `scripts/resolve-local-test-target.ts` supplies the explicit local `DATABASE_URL`; an external `.env.local` target requires both explicit opt-ins |
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

**Optional helper:** `pnpm db:seed:all -- --plan` pulls Vercel Development, Preview, and Production env files into a temp directory, compares them with local `.env.local`, and shows the unique seed targets without writing data. `pnpm db:seed:all` then imports drafts as published and seeds each unique `DATABASE_URL` once. It does **not** run migrations; deploy-time schema changes are handled by the Vercel Build Command migration. Use `pnpm db:migrate` manually only for an out-of-band or fallback migration against an explicit `DATABASE_URL`.

Normal local authenticated E2E uses the resolver-scoped Docker database and runs migrations automatically through `pnpm test:e2e`. For an intentional deploy-target E2E check, confirm the host without printing credentials, migrate that target deliberately, then run the suite with both explicit opt-ins:

```bash
LOCAL_E2E_DATABASE_URL="$(node -e "require('dotenv').config({ path: '.env.local', quiet: true }); const url = process.env.DATABASE_URL; if (!url) throw new Error('Missing DATABASE_URL in .env.local'); process.stdout.write(url)")"
node -e "const u = new URL(process.argv[1]); console.log(u.hostname)" "$LOCAL_E2E_DATABASE_URL"
DATABASE_URL="$LOCAL_E2E_DATABASE_URL" pnpm db:migrate
E2E_USE_EXISTING_DATABASE=true ALLOW_NON_LOCAL_DATABASE_URL=true DATABASE_URL="$LOCAL_E2E_DATABASE_URL" pnpm test:e2e
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
- [ ] `pnpm test:e2e` passes when local auth/billing env is available (CI enforces this on main pushes and non-Dependabot same-repository PRs)
- [ ] The [reviewed-source promotion proof](../../AGENTS.md#reviewed-source-promotions) is in the PR body for the current base/head; every first-parent source PR had exact-head approval before merge, and source/promotion threads are resolved. No separate promotion CodeRabbit approval is required (owner decision, 2026-09-22).
- [ ] Vercel's production Deployment Check requires GitHub `test`; after merging, record main's test result and actual domain-assignment timing separately
- [ ] If a keyed action output changed incompatibly: coexistable writer and rollback shapes have additive replay parsers + pre-deploy fixtures, with removal no earlier than one full 24-hour TTL after the last writer is gone
- [ ] If schema changed: migration tested on local + preview DB first
- [ ] If schema changed: confirm the Vercel build ran the Build Command migration (`pnpm db:migrate`) before `pnpm build` — the deploy fails closed otherwise, so a READY deployment means the migration applied (see [Known Gotchas](./deployment-environments.md#missing-database-migration-causes-silent-write-failures))
- [ ] If content changed: seed tested on local + preview DB first

---

## 6. Branch Ancestry After Promotion

**Corrected 2026-09-20:** both `main` and `dev` require PRs without bypass actors. Do not directly push `dev` to synchronize it. A merge-commit promotion adds ancestry to `main`, but when the trees are identical it does not leave `dev` missing migration files or other content.

After every promotion, fetch and compare `origin/main^{tree}` with `origin/dev^{tree}`. For the next change, start the feature branch from the latest `origin/dev`, then merge `origin/main` **into that feature branch** before editing. When the only difference is the promotion merge, that merge is a fast-forward. If either branch has gained content, inspect and resolve the actual divergence on the feature branch rather than assuming tree identity. Include the result in the normal fully gated/reviewed PR to `dev`.

That next PR carries main's promotion ancestry into `dev`; the next `dev` → `main` promotion can satisfy strict up-to-date checks without direct protected-branch pushes or a repeating chain of empty synchronization PRs. If `main` advances while any PR is open, integrate its new ancestry/content before the final gate and review. A new feature head needs a new full gate and exact-head approval; a promotion needs refreshed CI and source-provenance proof.

### Enforced Merge Bar

Read back ruleset `17666822` (`main-and-dev-protection`) and each branch's rules when changing repository settings. On 2026-09-20 at `06:34:27Z`, both branch endpoints returned the same active requirements:

- PR required, with zero required approvals (BUG-248's solo-owner constraint), all review threads resolved, and no bypass actors.
- GitHub Actions `test` required (`integration_id=15368`), with `strict_required_status_checks_policy=true` and enforcement on branch creation.
- Deletion and non-fast-forward updates blocked.

The ruleset is one shared policy for explicit `refs/heads/main` and `refs/heads/dev`, avoiding two independently maintained copies. Before activation, PR #926 into `dev` reported `test=success` from `github-actions`; the workflow/script inventory contained no direct `dev` pusher. The old direct-push runbook above was the incompatible instruction, not an automation requirement. The read-only 11-property assertion failed for dev coverage, thread resolution and strict checks before activation, then passed all 11 after; both branch rule endpoints were checked independently.

Feature PRs require CodeRabbit exact-head **APPROVED** through the [checked-in merge command](../../AGENTS.md#how-to-check). As of the 2026-09-22 owner decision, promotions instead verify the source PRs through the [reviewed-source procedure](../../AGENTS.md#reviewed-source-promotions). These and merge-commit use are operator/process requirements. The ruleset does not require the `CodeRabbit` status, which can be successful with requested changes or a rate limit; inspect actual reviews. Existing unrelated settings were preserved, including the extra-approval rule for unattributed changes, no CODEOWNERS/last-push approval requirement, and the platform's allowed merge methods (`merge`, `squash`, `rebase`); repository policy still selects `merge`. No admin override or bypass is allowed. [GitHub's strict-check documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging) explains why an updated base may require refreshed verification.

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
