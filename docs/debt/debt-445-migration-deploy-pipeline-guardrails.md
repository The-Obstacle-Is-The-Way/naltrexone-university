# DEBT-445: Build-Time Migration Pipeline Guardrails -- Shared-Preview Ledger Blast Radius, No Deploy-Time Ledger Check, Missing Expand/Contract and Restore-Loss Documentation

**Status:** Open
**Priority:** P3
**Date:** 2026-07-09

---

## Description

The repository-defined deploy seam is [`vercel.json`](../../vercel.json#L3)'s
`buildCommand: "pnpm db:migrate && pnpm build"`. Every Vercel deployment that
uses this configuration runs the checked-in Drizzle migrator before building
the application. Four related gaps cluster around that seam: a shared Preview
database can accept an unmerged migration and create a ledger high-water mark;
the repository deploy path never runs the DEBT-442 content-hash guard; the
old-code/new-schema serving window is absent from the durable migration-authoring
checklist; and the rollback runbook's PITR step omits write-loss and
externally-fed-state reconciliation.

**Verification boundary (2026-07-10):** the repository proves the Build Command
and the intended environment contract. It does not encode the current Vercel
`DATABASE_URL` values, branch-specific Preview overrides, Ignored Build Step,
Deployment Checks, or Rolling Releases settings. Archived
[BUG-241](../_archive/bugs/bug-241-deploy-pipeline-has-no-migration-step.md#L78)
records a redacted 2026-06-16 provider audit in which the default Preview and
Development values shared one non-production host and no branch override was
observed. That is the last recorded provider proof, not a live setting re-check
in this read-only audit. Vercel supports branch-specific Preview variables, so
the live target of a particular Preview deployment remains
**unverifiable from the repository** ([Vercel environment-variable
scoping](https://vercel.com/docs/environment-variables#preview-environment-variables)).

### 1. A shared Preview database plus Drizzle's last-row high-water mark can silently skip out-of-order migrations

Under the last measured provider topology, a feature-branch Preview without a
branch-specific override uses the shared Neon `dev` database documented in
[deployment-environments.md](../dev/deployment-environments.md#L25). The
installed Drizzle PostgreSQL migrator — version-scoped to the locked
`drizzle-orm@0.45.2` (`node_modules/drizzle-orm/pg-core/dialect.cjs:58-72`,
verified directly against that build) — reads only the ledger row with the
greatest `created_at`, then applies a local migration only when
`Number(lastDbMigration.created_at) < migration.folderMillis`. It does not
compare every journal entry with every ledger row. A drizzle-orm upgrade must
re-verify this behavior, or the journal-order regression below makes the
assumption test-enforced either way.

If a feature Preview applies an unmerged migration at `when=T2`, a later
checkout whose legitimate migration has `when <= T2` is skipped on that shared
target. The ledger row persists until explicit repair; the migrator returns
success without adding the skipped row. The same timestamp/merge-order hazard
can reach Production even without Preview pollution: a migration generated at
`T1` but merged after a migration generated at `T2` is also below Production's
last-row high-water mark. The current journal has 29 strictly increasing
`entries[].when` values, but no test enforces that property.

The recorded early-0027 incident is adjacent evidence, not proof that this exact
out-of-order scenario has occurred. Development applied an early version of
`0027_early_wallow.sql` through a Preview deploy; the file was then amended at
the same journal timestamp, Drizzle did not revisit it, and `0028` repaired the
schema ([DEBT-442 incident](../_archive/debt/debt-442-applied-migration-ledger-content-blind.md#L12)).
That incident proves that Preview can apply pre-merge migration content and that
the migrator does not revalidate an applied timestamp. No known incident in the
register proves that an orphaned later timestamp has yet skipped a distinct
earlier migration.

No repository-defined deploy check detects either ledger shape directly.
`verifyMigrationLedger` runs from E2E global setup
([global.setup.ts](../../tests/e2e/global.setup.ts#L3) to
[credential-health-check.ts](../../tests/e2e/helpers/credential-health-check.ts#L654));
normal local E2E uses freshly migrated Docker, CI E2E uses CI's throwaway
Postgres, and no workflow sets `E2E_USE_EXISTING_DATABASE`. A target can
therefore remain drifted until an intentional persistent-target E2E preflight or
runtime failure exposes it (the failure pattern documented at
[deployment-environments.md](../dev/deployment-environments.md#L131)).

### 2. The repository deploy path does not run the DEBT-442 content-hash guard

DEBT-442 extended [`verifyMigrationLedger`](../../tests/e2e/helpers/credential-health-check.ts#L362)
to compare ledger hashes with full-file SHA-256 values through
[`computeMigrationContentDrift`](../../tests/e2e/helpers/credential-health-check.ts#L325),
including one exact allowlist entry for Development's repaired early-0027
content. That guard is wired only into the E2E credential preflight. The
repository Build Command runs `db:migrate` and `build`, not the guard; whether a
dashboard-only deployment check provides any equivalent protection is
unverifiable from the repository.

The build-path migrator does not re-compare hashes for applied rows. An
amended-after-apply file, a ledger-only migration from another branch, or a
backported migration below the last `created_at` can therefore leave the schema
different from the checkout while `db:migrate` exits successfully. The build
may still fail if it exercises the missing schema, but it can also pass and
defer discovery to runtime or a later dependent migration. DEBT-442 explicitly
left a deploy-target health check as the high-value unshipped path
([lines 77-80](../_archive/debt/debt-442-applied-migration-ledger-content-blind.md#L77)).

The last recorded read-only proof, on 2026-07-08, found Production matching all
29 local migration hashes and Development carrying only the known allowlisted
0027 mismatch, with no missing or ledger-only rows
([measurement table](../_archive/debt/debt-442-applied-migration-ledger-content-blind.md#L82)).
This audit did not query either live database. The gap is therefore latent
detection/operability debt, not evidence of current unexplained drift.

### 3. The old-code/new-schema deploy window is absent from the durable migration-authoring checklist

Drizzle commits all pending PostgreSQL migrations before `pnpm build` starts.
For Production, and for any existing Preview alias that a new deployment will
replace, the previous deployment can continue serving against the newly changed
schema until Vercel promotes the successful replacement. Dashboard-configured
Rolling Releases could extend mixed-version serving beyond the build, but that
setting is unverifiable from the repository. Vercel documents that production
traffic is switched by promotion/rollback at the routing layer rather than by
rebuilding the old deployment ([rollback behavior](https://vercel.com/docs/deployments/rollback-production-deployment#2-roll-back-immediately)).

The expand/contract N-1 compatibility rule exists as constraint 3 in archived
[BUG-241](../_archive/bugs/bug-241-deploy-pipeline-has-no-migration-step.md#L76),
but it was not carried into [migration-authoring.md](../dev/migration-authoring.md#L5),
the durable review checklist. [deployment-procedure.md](../dev/deployment-procedure.md#L16)
states that the old deployment remains up when migration/build fails, but does
not ask authors to prove old-code compatibility after a successful migration
and before promotion.

Concrete failure shapes are:

- a contracting CHECK, NOT NULL, or foreign-key change on a table still written
  by old code can reject writes during the window (`23514`, `23502`, and `23503`
  respectively);
- a one-shot backfill such as [0018's `NOT EXISTS`
  scan](../../db/migrations/0018_backfill-omitted-exam-attempts.sql#L37) cannot
  see rows old code creates after the migration commits;
- in the 0021-0025 Track A batch, the relevant exposure was not 0023/0024's
  constraints (old code never wrote the new state table), but old code starting
  or updating sessions only in `params_json` after
  [0021's backfill](../../db/migrations/0021_flaky_domino.sql#L27), leaving the
  relational source of truth absent or stale for the new deployment.

[`vercel.test.ts`](../../vercel.test.ts#L10) pins only the command string. The
rollback side has a dedicated runbook, but the authoring-side compatibility
question is absent. Preconditions are narrow -- a contracting migration or
one-shot backfill plus old-code writes in the serving window -- so this remains
pattern debt rather than a demonstrated current data defect.

### 4. The rollback runbook omits restore write-loss and external-state reconciliation

[database-rollbacks.md](../dev/database-rollbacks.md#L10) is the dedicated
database rollback runbook. Its last-resort step says to use PITR or snapshot
restore when old code is incompatible with the migrated schema, but does not
state the recovery-point loss or reconciliation work that follows. This path is
reachable for a schema-bearing deployment whose migration committed and whose
application build or runtime then requires an incompatible code rollback; it is
not a consequence of every bad deploy.

Neon's current Instant Restore documentation says restore is a complete
overwrite, not a merge: all schema and data changes after the selected point are
excluded. Neon preserves the pre-restore head in an automatic backup branch,
but the target connection is cut over as part of restore; it is not a separate
pre-cutover validation branch
([Neon Instant Restore](https://neon.com/docs/introduction/branch-restore#overwrite-not-a-merge)).
The runbook mentions none of this.

A restore can therefore rewind application rows and local processing ledgers.
For this repository:

- Stripe and Clerk automatically retry failed webhook deliveries, not database
  state that was later rewound after a successful response. Stripe supports
  manual resend only within documented windows, and Clerk documents replay for
  failed/missing messages
  ([Stripe delivery behavior](https://docs.stripe.com/webhooks#event-delivery-behaviors),
  [Clerk retry/replay](https://clerk.com/docs/guides/development/webhooks/overview#how-clerk-handles-delivery-issues)).
- the daily Stripe reconciliation route
  ([vercel.json](../../vercel.json#L4)) can reconstruct current customer and
  subscription mappings for rows it can scan, but it is not a general replay of
  every lost Stripe event;
- Clerk has no bulk reconciler. Active users are lazily upserted on authenticated
  requests ([clerk-auth-gateway.ts](../../src/adapters/gateways/clerk-auth-gateway.ts#L48)),
  but post-restore `user.deleted` and other lost event effects still require an
  explicit provider-to-database audit;
- rewinding [`idempotency_keys`](../../db/schema.ts#L291),
  [`stripe_events`](../../db/schema.ts#L208), or
  [`clerk_events`](../../db/schema.ts#L226) removes local replay evidence.
  Retried operations can re-enter execution, although deterministic Stripe
  idempotency keys collapse some provider calls; duplicate-effect risk is
  operation- and provider-retention-dependent, not automatic.

Archived [DEBT-060](../_archive/debt/debt-060-no-rollback-migrations.md#L14)
settled fix-forward plus PITR as last resort, but its Neon procedure validation
remains unchecked ([line 23](../_archive/debt/debt-060-no-rollback-migrations.md#L23)).

## Impact

The last recorded operational proof found no unexplained migration drift; this
read-only audit did not re-query live databases. Part 1 is a latent silent-skip
path that can break a shared Preview target and, under out-of-order merge
timestamps, Production. Part 2 is the exact detection class exposed by the
0027 incident: deploy-time migration can report success without proving applied
content matches the checkout. Part 3 can reject or omit writes during a
schema-bearing build window. Part 4 leaves an incident responder without the
recovery-point-loss and reconciliation steps needed to use PITR safely. Each
part remains P3: the blast radius can be serious, but each requires a migration
or incident precondition and no current unexplained live drift is recorded.

## Proposed Resolution

**Part 1 -- shared Preview migration authority:**

1. **Recommended:** give schema-bearing Preview deployments isolated database
   branches and let each Preview migrate its own branch. Neon's Vercel
   integration supports a branch per Preview deployment
   ([Neon preview-branch integration](https://neon.com/blog/neon-vercel-native-integration)).
   This preserves BUG-241's migrate-before-build contract and keeps feature
   previews functional without polluting a shared ledger.
2. If the shared Preview database is retained, designate an explicit migration
   authority (for example, `dev`) and fail a feature Preview that introduces a
   migration unless it has a branch-specific database. Do not merely skip
   migration and serve schema-dependent code against the old shared schema.
3. Add a CI test requiring `_journal.json` `entries[].when` to be unique and
   strictly increasing by `idx`. This blocks an out-of-order checked-in journal,
   but does not by itself detect a ledger-only row left by an unmerged Preview;
   the exact target-ledger check in part 2 is still required.

**Part 2 -- deploy-target ledger check:**

1. **Recommended:** extract the DEBT-442 helpers and allowlist from `tests/e2e`
   into one shared, thin CLI used by both E2E and deploys. Before migration,
   reject applied-row hash mismatches and ledger-only rows without treating
   expected pending journal entries as failure. Run `pnpm db:migrate`, then run
   the exact missing-row plus content check before `pnpm build`. This prevents a
   known-drift target from being mutated further and proves the post-migrate
   ledger exactly matches the checkout.
2. A scheduled read-only job against persistent dev and prod targets is useful
   defense in depth, but it detects drift after a deployment window and is not a
   substitute for the build-path check.
3. Accept-and-document remains an owner option only if append-only migration
   discipline and manual target checks are explicitly judged sufficient.

**Part 3 -- authoring checklist:**

1. Add a "Deployed-Code Compatibility" section to
   `docs/dev/migration-authoring.md`: every migration PR must answer whether the
   migrated schema remains compatible with the currently serving code until
   promotion; contracting changes require expand/contract; one-shot backfills
   must account for old-code writes that can arrive after the scan.
2. Cross-link that rule from `docs/dev/deployment-procedure.md` and the rollback
   runbook.
3. Prefer re-runnable, bounded post-cutover backfills or a deliberate follow-up
   sweep when a one-shot pre-build scan cannot close the write window.

**Part 4 -- rollback runbook:**

1. Add an explicit Recovery Point Objective warning: Neon Instant Restore
   overwrites the target and excludes all changes after the chosen point. Require
   Time Travel Assist before restore and preserve/use the automatic backup branch
   to diff and reconcile post-point writes after restore.
2. Add a reconciliation checklist covering, at minimum, user/practice/attempt
   rows, Stripe subscription/customer state, webhook ledgers, pending
   cancellations, and idempotency keys. Run and review the Stripe reconciler,
   use provider event history/manual resend where retained and supported, audit
   Clerk users/deletions against the provider, and hold unsafe billing retries
   until local/provider idempotency state is understood.
3. Validate this procedure on a non-production Neon branch and close DEBT-060's
   unchecked provider-validation item with an evidence-backed walkthrough.

## Verification

- **Part 1:** a Preview with a new migration gets an isolated target and applies
  it without changing the shared dev ledger; or, under the shared-target option,
  the same Preview fails closed before build. A unit test pins the branch policy,
  and a journal test rejects duplicate/non-increasing `when` values.
- **Part 2:** E2E and deploy consume the same verifier module; a known applied
  hash mismatch and ledger-only row fail before migration; a pending migration
  applies; the exact post-migrate check passes; and messages contain tags/hash
  prefixes but no URLs, hosts, credentials, or provider identifiers.
- **Part 3:** the migration-authoring checklist contains the N-1 compatibility
  question, error-code examples, expand/contract rule, and one-shot-backfill
  caution; the next migration PR records its answer.
- **Part 4:** the rollback runbook documents Neon's overwrite/backup-branch
  semantics, RPO, and the operation-specific reconciliation checklist; a
  non-production restore exercise records the before/after branch and
  reconciliation evidence.

## Related

- [DEBT-442](../_archive/debt/debt-442-applied-migration-ledger-content-blind.md)
  (resolved 2026-07-09) -- shipped content-hash/ledger-drift detection and
  recorded the 0027/0028 incident.
- [BUG-241](../_archive/bugs/bug-241-deploy-pipeline-has-no-migration-step.md)
  -- created the Build Command migration and the expand/contract constraint.
- [DEBT-060](../_archive/debt/debt-060-no-rollback-migrations.md) -- settled
  fix-forward plus PITR; provider-procedure validation remains unchecked.
- Found during the 2026-07-09 DDIA-lens adversarial database-seam sweep (12
  finder lenses, per-candidate adversarial verification, dedup against the full
  archived register).
