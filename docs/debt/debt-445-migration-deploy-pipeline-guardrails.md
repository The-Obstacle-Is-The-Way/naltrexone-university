# DEBT-445: Build-Time Migration Pipeline Guardrails -- Shared-Preview Ledger Blast Radius, No Deploy-Time Ledger Check, Missing Expand/Contract and Restore-Loss Documentation

**Status:** Open
**Priority:** P3
**Date:** 2026-07-09
**2026-07-18 staleness audit:** Stale but real against `ddad8eee`. The local journal census advanced from 29 to 31 entries (through `0030_nasty_forge`); the four guardrail gaps remain. Historical live-ledger measurements below remain dated evidence and were not rewritten as current production claims.

---

## Direction (2026-07-20 forest review)

| Part | Verdict | Chosen option | Rejected as disproportionate | One-line rationale |
| --- | --- | --- | --- | --- |
| 1a. Journal ordering | **FIX (Option 3, minimal form)** | Add one pure CI/unit test requiring `_journal.json` `when` values to be unique and strictly increasing by `idx`. | Option 2's shared-target feature-branch policy engine as the repo fallback. | (a) One invariant test adds no runtime state; (b) out-of-order merge timestamps are mechanically reachable and the current 31-entry journal is ordered only by discipline; (c) Blast radius: an older migration can be silently skipped below the ledger high-water mark. Fix cost: one deterministic JSON test; (d) pins the append-only journal law; (e) complements, rather than duplicates, the target-ledger verifier. |
| 1b. Preview isolation | **OWNER-GATED (Option 1)** | Owner manually enables Neon/Vercel Preview Branching: connect the existing Neon storage resource to Preview, enable **Advanced Options → Deployments Configuration → Required → Preview** plus **Resource must be active before deployment**, then verify a schema-bearing Preview receives its deployment-specific `DATABASE_URL`, changes only its generated Neon branch/ledger, and follows the provider's deployment-retention cleanup. | Option 2's fail-closed shared-target build policy and any repo script that mutates live Neon/Vercel configuration. | (a) Provider-native isolation deletes shared-ledger coupling without repo orchestration; (b) early 0027 proves a Preview can apply pre-merge content, while current dashboard state is not repo-verifiable; (c) Blast radius: one feature Preview can poison a shared ledger. Fix cost: an owner dashboard change and one safe Preview proof, not a new deploy authority; (d) uses the provider's existing lifecycle; (e) provider isolation does not replace the repo build-path verifier. |
| 2. Deploy-target ledger/content check | **FIX (Option 1, minimal form)** | Extract the existing DEBT-442 verifier and exact early-0027 allowlist into one thin shared module/CLI; the build path runs a pre-migrate content/ledger-only check, `db:migrate`, the exact post-migrate check, then `build`, while E2E consumes the same module. | Option 2's scheduled persistent-target job; Option 3's manual append-only acceptance; a second verifier or allowlist. | (a) Reuses and relocates proven code instead of adding another detector; (b) early 0027 demonstrated this exact content-blind deploy class; (c) Blast radius: migrate can exit successfully against a checkout-incompatible target and defer failure to runtime. Fix cost: one extraction, two CLI modes, and build-command tests; (d) one verifier/allowlist remains the source of truth; (e) deploy-time drift detection is owned by the repo build path, with E2E as a second consumer rather than a second owner. |
| 3. N-1 authoring contract | **FIX (Option 1, minimal form)** | Add the deployed-code compatibility question, expand/contract rule, and one-shot-backfill write-window caution to `migration-authoring.md`, with links from deployment and rollback docs. | A migration DSL, new runner, or PR-template attestation as a substitute for the durable checklist. | (a) Corrects the missing source of truth without machinery; (b) the migrate-before-build serving window is certain for schema-bearing deploys; (c) Blast radius: old code can reject or omit writes after the migration commits. Fix cost: a short checklist and cross-links; (d) consolidates the rule now stranded in BUG-241; (e) does not create another deploy gate. |
| 4a. Restore-loss runbook | **FIX (Options 1 + 2, minimal form)** | Document Neon overwrite/RPO/automatic-backup-branch semantics and one operation-specific post-point reconciliation checklist. | A generic disaster-recovery subsystem or automated provider replay/archive machinery. | (a) Adds decision-critical runbook facts, not state; (b) the provider explicitly overwrites rather than merges and preserves a pre-restore backup branch; (c) Blast radius: PITR can rewind user, billing, webhook, and idempotency state. Fix cost: one warning and bounded checklist; (d) correct documentation is the clean fix; (e) uses existing reconcilers/provider history without inventing a new owner. |
| 4b. Restore exercise | **OWNER-GATED (Option 3)** | Owner manually creates or selects a disposable non-production Neon root branch, records a harmless before-point write, uses **Restore → From history** with Time Travel Assist, confirms the automatic `{branch}_old_{timestamp}` backup and overwritten target state, then records the reconciliation evidence without touching Production. | Performing a live Production restore in a fix wave or scripting provider restore operations from this repo. | (a) The exercise validates an external control without permanent repo machinery; (b) DEBT-060's provider walkthrough remains unchecked; (c) Blast radius of an unpracticed Production restore is avoidable write loss. Exercise cost is bounded but provider-mutating, so only the owner may schedule it; (d) evidence closes the stale checklist; (e) the runbook remains the repo owner while execution remains provider/owner-gated. |

Deploy-time drift detection belongs to the repository build path: one DEBT-442 verifier and one allowlist serve both the deploy CLI and E2E, while the journal-order test prevents a separate checkout-only failure shape. Provider Preview isolation is the preferred topology but cannot be inferred, changed, or treated as a substitute from git. Restore documentation is fixable now; the provider-mutating Preview and restore exercises remain named owner steps.

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
last-row high-water mark. The current journal has 31 strictly increasing
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

1. **OWNER-GATED (Option 1):** the owner enables provider-native Preview
   Branching for the existing Neon/Vercel connection: select the Preview
   environment, enable **Advanced Options → Deployments Configuration →
   Required → Preview** and **Resource must be active before deployment**, then
   prove with one schema-bearing Preview that its deployment-specific
   `DATABASE_URL` changes only the generated Preview branch and ledger. Confirm
   the provider's deployment-retention cleanup policy for obsolete branches.
   The repository must not script this live provider mutation or assume it is
   complete.
2. **REJECTED BY DIRECTION REVIEW:** do not add a shared-target feature-branch
   migration-authority/fail-closed policy. There is no existing execution seam
   for that policy, and it would preserve the coupled database while adding
   bespoke deployment state that provider-native isolation removes.
3. **CHOSEN (Option 3, minimal form):** add one CI/unit test requiring
   `_journal.json` `entries[].when` to be unique and strictly increasing by
   `idx`. This blocks an out-of-order checked-in journal, but does not detect a
   ledger-only row left by an unmerged Preview; Part 2 remains required.

**Part 2 -- deploy-target ledger check:**

1. **CHOSEN (Option 1, minimal form):** extract the existing DEBT-442 helpers
   and exact allowlist from `tests/e2e` into one shared module with a thin CLI
   used by both E2E and deploys. Before migration, reject applied-row hash
   mismatches and ledger-only rows without treating expected pending journal
   entries as failure. Run `pnpm db:migrate`, then run the exact missing-row plus
   content check before `pnpm build`. This is one verifier with two consumers,
   not a second build-specific implementation.
2. **REJECTED BY DIRECTION REVIEW:** do not add a scheduled persistent-target
   job. It detects after the deployment window and adds credentials, scheduling,
   and another operational owner without closing a risk the build path can
   close synchronously.
3. **REJECTED BY DIRECTION REVIEW:** manual append-only discipline is not enough
   after the early-0027 incident demonstrated the verifier's failure class.

**Part 3 -- authoring checklist:**

1. **CHOSEN (Option 1, minimal form):** add a "Deployed-Code Compatibility" section to
   `docs/dev/migration-authoring.md`: every migration PR must answer whether the
   migrated schema remains compatible with the currently serving code until
   promotion; contracting changes require expand/contract; one-shot backfills
   must account for old-code writes that can arrive after the scan.
2. **CHOSEN (supporting documentation):** cross-link that rule from
   `docs/dev/deployment-procedure.md` and the rollback runbook.
3. **CHOSEN (supporting documentation):** prefer re-runnable, bounded
   post-cutover backfills or a deliberate follow-up sweep when a one-shot
   pre-build scan cannot close the write window. No new migration runner,
   compatibility DSL, or PR-template gate is authorized.

**Part 4 -- rollback runbook:**

1. **CHOSEN (Option 1, minimal form):** add an explicit Recovery Point Objective warning: Neon Instant Restore
   overwrites the target and excludes all changes after the chosen point. Require
   Time Travel Assist before restore and preserve/use the automatic backup branch
   to diff and reconcile post-point writes after restore.
2. **CHOSEN (Option 2, minimal form):** add a reconciliation checklist covering, at minimum, user/practice/attempt
   rows, Stripe subscription/customer state, webhook ledgers, pending
   cancellations, and idempotency keys. Run and review the Stripe reconciler,
   use provider event history/manual resend where retained and supported, audit
   Clerk users/deletions against the provider, and hold unsafe billing retries
   until local/provider idempotency state is understood.
3. **OWNER-GATED (Option 3):** the owner validates the procedure on a
   disposable non-production Neon **root** branch: create a harmless post-point
   write, use **Restore → From history** and Time Travel Assist, confirm the
   automatic `{branch}_old_{timestamp}` backup plus target overwrite, and record
   before/after and reconciliation evidence. This wave must not run the exercise
   against Production or script it against live provider infrastructure.

## Verification

- **Part 1a:** a unit test rejects duplicate or non-increasing journal `when`
  values and passes the current 31-entry journal.
- **Part 1b (owner-gated):** the owner records provider evidence that a
  schema-bearing Preview receives a deployment-specific Neon branch/URL, changes
  only that branch's ledger, and has an understood deployment-retention cleanup
  path. Repo verification must continue to describe this as unverified until
  that evidence exists.
- **Part 2:** E2E and deploy consume the same verifier module; a known applied
  hash mismatch and ledger-only row fail before migration; a pending migration
  applies; the exact post-migrate check passes; and messages contain tags/hash
  prefixes but no URLs, hosts, credentials, or provider identifiers.
- **Part 3:** the migration-authoring checklist contains the N-1 compatibility
  question, error-code examples, expand/contract rule, and one-shot-backfill
  caution; the next migration PR records its answer.
- **Part 4a:** the rollback runbook documents Neon's overwrite/automatic
  backup-branch semantics, RPO, and the operation-specific reconciliation
  checklist.
- **Part 4b (owner-gated):** the owner-run non-production restore exercise
  records the selected root branch/point, Time Travel Assist proof, automatic
  backup branch, overwritten target result, and reconciliation evidence.

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
