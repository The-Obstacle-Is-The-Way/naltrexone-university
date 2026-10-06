# DEBT-483: No Complete Content Withdrawal or Release Rollback

**Status:** Resolved — 2026-10-02; ADR-021 phase 4 (4a–4d) promoted and release-verified, with DEBT-489's fix and BUG-314–317; every Verification item re-run against `main`'s code before archival; the production bootstrap and three follow-on steps stay Deferred on their triggers
**Priority:** P1
**Date:** 2026-09-20
**Resolved:** 2026-10-02
**Verification receipts:** [Verified closeout](#verified-closeout--2026-10-02-utc)
**Confidence:** CONFIRMED implementation gap; production incident not established

## Evidence

**2026-09-21 release readback.** #952/#953/#954's merge commits (`31d3a718`, `8da15de2`, `65bd70c0`) are ancestors of deployed main `76e65e9c`, not merely dev-only safeguards. Their source heads have formal exact-head CodeRabbit approvals and successful CI; the release passed main CI `35562531386`. This supersedes pending-release qualifications in the dated receipts below, but does not close this debt. `scripts/seed-environment-runtime.ts:108-123` still dry-runs, deletes the managed imported tree, then regenerates it; question sync still commits per question. Immutable release/freshness/atomic activation/rollback and the archived-question review seam remain open. The static invalid-file case and explicit QID withdrawal are already implemented and must not be repeated as new work. [Shared audit ledger](../../debt/assets/active-audit-2026-09-21/verification.md).

The original snapshot and reproduction plan below predate the initial safeguard.
The dated receipt records the synthetic database tests subsequently executed.

docs/practice-engine/content-pipeline.md:523 says import does not prune stale
files. scripts/import-draft-questions.ts:99 writes current outputs without
reconciling an old tree. scripts/seed/question-syncer.ts:146 iterates supplied
files; :167 and :214 use per-question transactions.
scripts/seed/placeholder-archiver.ts:14 archives only placeholder-prefixed rows.
scripts/seed/file-reader.ts:4 reads all imported MDX inputs, and scripts/seed.ts:23
invokes placeholder archival. Snapshot: 6199084a1a4407d4d9d800bd798b37c422662b66.

## Reproduction

Read-only inspection, run from app root:

    sed -n '84,113p' scripts/import-draft-questions.ts
    sed -n '140,175p' scripts/seed/question-syncer.ts
    sed -n '210,224p' scripts/seed/question-syncer.ts
    cat scripts/seed/placeholder-archiver.ts

Observed: only per-block writes, a per-file sync loop with per-question
transactions, and a placeholder-only archival predicate. No full-release
reconciliation or activation transaction occurs in these paths.

Future behavioral reproduction must use a disposable database and directory:
publish synthetic A/B, remove B from drafts, re-import, and observe B's stale MDX;
clear the output tree and seed A, then inspect whether B remains published.
Inject an invalid late file after a valid changed file and inspect partial state.
Those mutating experiments were NOT run against any database in this review.

## Failure scenario

Withdrawal by deleting a draft leaves stale output and a published database row.
Even a clean regenerated directory does not explicitly archive absent rows.
A late failure can leave an earlier question update committed. An older corpus
can overwrite newer same-slug content without an explicit rollback decision.

## Smallest fix

The initial safeguards milestone has no release-interface prerequisite.
Static bundle prevalidation is the first implemented safeguard, described below.
The next safeguard adds explicit withdrawal QIDs and an app-owned operator path
that preserves stored history, with seed refusing archived-to-active transitions.
Clean import staging is the third independent safeguard, described below.
Each mechanism remains a separate PR. This reduces current exposure
but is not atomic release activation. This milestone must not close the debt.
Full closure follows SPEC-007 and also requires a verified
release boundary with all-or-nothing visibility and explicit rollback.

The new immutable manifest/activation interface belongs to private content
SPEC-007. This debt owns defects in today's app behavior; do not call that
future spec implemented merely by adding a manifest file.

## Verification

Disposable tests demonstrate withdrawal, preserved attempts, no resurrection
from stale output, rejection of stale releases, rollback with revocation checks,
and no visible partial release after injected failure. No production credentials
belong in the content repository.

## Static bundle prevalidation receipt — 2026-09-20

**CONFIRMED:** against `d8bf8adc`, before changing runtime code,
`pnpm test:integration tests/integration/seed-bundle-preflight.integration.test.ts`
produced **16 failed / 1 passed** in clone-isolated Docker Postgres. Six invalid
later-file mutations ran after both an earlier insert and an earlier update:
empty stem, empty general explanation, missing/empty reference, invalid answer
key, and noncanonical taxonomy. The existing seed rejected the later file, but
the earlier question/choices/tag associations had already committed. Two
same-slug files (identical or different bodies) were accepted and synced twice.
Two conflicting tag-definition cases (name/kind) also left an earlier question
committed before the later database error. The valid shared-tag bundle and its
unchanged replay already passed.

`prepareSeedQuestions` in `scripts/seed/question-syncer.ts` now parses and
validates every supplied file, computes its canonical hash, and verifies global
slug uniqueness and consistent tag names/kinds before entering the database
sync loop. Duplicate and conflicting-definition errors identify both source
paths. Parse errors retain the current file/slug context and original cause.
The static plan is local to one call, so an unchanged replay remains valid.

This is the seed-input boundary. DEBT-482 guards the current **draft import
batch**; it cannot detect stale generated MDX files left under another source
path, nor direct MDX inputs. Seed therefore needs its own complete-bundle identity
check. This extends the already-filed stale-output/partial-sync failure rather
than claiming another duplicate-QID debt.

### Verification and limits

The focused command below passed **47/47** after implementation, retaining
DEBT-484's graded-history guard and the existing choice-sync/key-override cases:

```bash
pnpm test:integration tests/integration/seed-bundle-preflight.integration.test.ts tests/integration/seed-content-rewrite.integration.test.ts tests/integration/bug-regression-seed-choice-sync.integration.test.ts
```

Rejected input leaves the earlier question, its choices and tag associations
unchanged (or absent for a planned insert). Duplicate/conflicting-definition
cases require both source paths in the error. Typecheck and focused Biome checks
passed. The full local gate also passed: typecheck, lint, **4,421 unit /
411 browser / 330 integration** tests (6 existing skips), production build, and
**44 authenticated E2E** tests without retries. Database lanes used isolated
Docker and Clerk/Stripe used TEST mode. Fast-forwarding to the merged PR #951
base `269ffeec` changed ancestry only: its tree matches tested parent `d8bf8adc`.
PR #952 merged as `31d3a718` after exact-head CodeRabbit approval
`5261750605` on `936de53e`, zero unresolved threads, and CI run `35537614430`
(4,421 unit / 411 browser / 330 integration +6 skips / 44 E2E, no retries).
The [reconciliation snapshot](../../debt/assets/content-integrity-2026-09-20/verification.md#reconciliation-snapshot) separates this dev merge from the later release readback.

**CONFIRMED local corpus compatibility:** a read-only census using
`readSeedQuestionFiles(true)` and `parseSeedQuestionFile(raw, absolutePath)`
returned:

```json
{"files":958,"uniqueSlugs":958,"duplicateSlugs":0,"tagConflicts":0,"uniqueTags":45}
```

The census compared each slug globally and each tag's exact `[name, kind]`
definition across all parsed files. It made no database calls and changed no
content. The actual local corpus exhibited neither conflict class.

**Remaining boundary:** this is static prevalidation, not an atomic release.
Database-dependent failures (including graded-history refusal and disagreement
with an already-stored tag definition), concurrency and infrastructure errors
can still happen after an earlier per-question transaction commits. The
transaction boundaries and publication semantics are unchanged. Explicit
withdrawal and stale-file resurrection were pending at that milestone (see the
subsequent receipt below). Clean staging was also pending at that milestone;
its later receipt follows. Immutable release identity, all-or-nothing activation
and authorized rollback/revocation remain open. Preserving stored attempts also does not establish that archived
questions remain accessible through every current review path; see DEBT-484's
published-only lookup receipt. No real content or remote database was changed.

## Explicit withdrawal safeguard — 2026-09-20

**CONFIRMED:** on parent `936de53e`, the first command below produced **14 failed /
1 passed** against isolated Docker Postgres. Four failures directly reproduced
stale MDX moving an archived question back to `draft` or `published`, with and
without graded attempts (`updated: 1` instead of refusal). Ten failures specified
the new operator interface, which did not yet exist; they are red-first feature
tests, not ten additional defects. Unchanged archived seed replay already passed.

```bash
pnpm test:integration tests/integration/content-withdrawal.integration.test.ts
```

`scripts/seed/withdraw-questions.ts` accepts one or more explicit `--qid` values
(the canonical content slug, not a database UUID). It rejects absent, malformed,
duplicate or unknown QIDs and unknown arguments. It defaults to a dry run.
`--apply` archives only the named rows, preserving question text, choices, tags
and stored attempts. The whole requested set is validated under ordered question
row locks in one transaction before any update; an unknown QID leaves the known
rows untouched. Repeating withdrawal does not update already-archived rows.

The command reuses `runHumanDatabaseCommand`: an explicit `DATABASE_URL` is
mandatory, implicit `.env.local` fallback is refused, and a remote target requires
the existing exact `DB_TARGET_ACK`. It logs the credential-free target and QIDs,
not question text or learner data. No production withdrawal was performed.

**Local TEST-mode operator example** (replace the synthetic QID deliberately):

```bash
WITHDRAWAL_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)"
DATABASE_URL="$WITHDRAWAL_DATABASE_URL" pnpm exec tsx scripts/seed/withdraw-questions.ts --qid "example-qid"
# Inspect the dry-run QID/count and target before explicitly applying:
DATABASE_URL="$WITHDRAWAL_DATABASE_URL" pnpm exec tsx scripts/seed/withdraw-questions.ts --qid "example-qid" --apply
```

*2026-10-01:* the command now also requires `--reason` and `--authority` and records each withdrawal ([phase 4a](#withdrawal-overlay-phase-4a--2026-10-01)). [Withdrawing a Question](../../practice-engine/content-pipeline.md#withdrawing-a-question) has the current usage.

The seed sync now refuses `archived` → `draft` or `published` while holding the
question lock. This also protects content archived through the existing seed
status path. There is no seed reactivation override; a corrected replacement uses
a new QID. The existing synthetic-placeholder lifecycle is the sole exception:
`isSyntheticPlaceholderSource` requires both a `placeholder-` QID and a file
directly in `content/questions/placeholder`. That is the same predicate already
used for the synthetic citation exception, now shared rather than duplicated.
Normal seed excludes and archives those fixtures; explicit inclusion must still
restore them. Neither a placeholder-looking QID under an authored path nor an
authored QID under the placeholder directory receives the exception. An explicitly
withdrawn synthetic placeholder can therefore return when fixtures are included
again; authored content cannot. Unchanged archived input remains idempotent. The answer-key override does not
bypass this status check. This guards seed and the new withdrawal operator, not
arbitrary direct database writes or a future restore/release interface.

**CONFIRMED lock-race proof:** a second connection archived a synthetic question
and held its transaction while seed read the old committed row and then blocked
on its lock. The test observed that blocking through `pg_blocking_pids`. Changing
the guard from `lockedQuestion.status` to the stale pre-lock
`existingQuestion.status` made
`pnpm test:integration tests/integration/content-withdrawal.integration.test.ts -t 'observes archival committed'`
fail (**1 failed / 15 skipped**): seed republished the row. Restoring the locked
comparison passed. The focused withdrawal/preflight/rewrite/choice-sync suites
then passed **63/63**. A subsequent compatibility test exposed the blanket
guard's regression in placeholder inclusion: **1 failed / 2 passed / 16 skipped**
using `-t 'reserves synthetic placeholder'`. Sharing the existing two-part
synthetic-source predicate restored that lifecycle while the two spoofed-source
cases stayed refused. All four focused suites then passed **66/66**; typecheck
and Biome passed. The final full gate on merged base `31d3a718` passed:
typecheck, lint, **4,421 unit / 411 browser / 349 integration** tests (6 existing
skips), production build and **44 authenticated E2E** tests with no retries.
PR #953 merged as `8da15de2` after exact-head CodeRabbit approval
`5261806134` on `0aeda526`, zero unresolved threads and CI run `35538749320`
(4,421 unit / 411 browser / 349 integration +6 skips / 44 E2E, no retries).
The [reconciliation snapshot](../../debt/assets/content-integrity-2026-09-20/verification.md#reconciliation-snapshot) separates this dev merge from the later release readback.

**Remaining limits:** withdrawal preserves stored history but does not make all
archived questions reviewable through today's published-only application queries
(DEBT-484). It is not immutable revision support, an undo path, an atomic corpus
release, or revocation-aware rollback. Old MDX must still be removed or marked
archived to let a later seed proceed; the guard rejects stale input rather than
silently filtering it. The next receipt covers the separate clean-staging
safeguard. Full release identity/activation/rollback still belongs to private
SPEC-007, and this debt remains open.

## Clean import staging safeguard — 2026-09-20

**CONFIRMED:** before changing runtime code, against parent `0aeda526`,
`pnpm test --run scripts/import-draft-questions.test.ts` produced **6 failed /
25 passed**. Normal import and dry-run both accepted three populated destinations:
an existing current-QID file, a stale QID under another source, and an unrelated
hidden file. The normal runs reported `written=1`; the old writer used ordinary
`writeFile`, overwriting the current destination or retaining the unrelated/stale
entry alongside the new output. Those three normal-write cases demonstrate the
defect; the three initial dry-run-refusal expectations were superseded by the
caller compatibility correction below. The existing-empty-directory positive
case already passed.

`scripts/import-draft-questions.ts` now requires an absent or empty output root
before the write loop, after full input/identity/path/symlink preflight.
Dry-run preserves read-only input/body/identity and path/symlink validation;
it may inspect populated output and does not promise that directory is writable
as a new bundle. A normal-write refusal names the output root and directs the
operator to a fresh staging directory; existing output is neither pruned nor
overwritten. Existing symlink-error precedence is retained.

The three focused importer/parser suites passed **86/86**:

```bash
pnpm test --run scripts/import-draft-questions.test.ts scripts/draft-question-import.test.ts scripts/seed.test.ts
```

The three write-refusal cases verify existing sentinel bytes survive and no new
output appears beside stale/unrelated files. The three dry-run cases verify
read-only success without modifying those same existing files. An absent or existing-empty destination
still succeeds. A read-only check of the actual local corpus ran:

```bash
STAGING_CHECK_DIR="$(mktemp -d)"
pnpm content:import:drafts -- --out "$STAGING_CHECK_DIR" --dry-run
rmdir "$STAGING_CHECK_DIR"
```

Real output: `files=170 questions=948 written=0 (dry-run) uniqueQids=948`.
`rmdir` succeeded, confirming the freshly created destination remained empty.
No proprietary content was written or changed by that check. The initial full local gate
passed: typecheck, lint, **4,428 unit / 411 browser / 349 integration** tests
(6 existing skips), production build and **44 E2E** tests without retries.
Fast-forwarding to merged #953 (`8da15de2`) changed ancestry only; its tree matches
tested parent `0aeda526`.

**CONFIRMED caller compatibility correction:** read-only inspection of
`scripts/seed-environment-runtime.ts:108-123` found `prepareCorpus` first invokes
`content:import:drafts -- --status published --dry-run` against existing output.
Requiring an empty directory in that non-writing mode would block that existing
caller before its normal regeneration. Three real-CLI compatibility cases failed
against the initial staging guard (**3 failed / 28 passed**); limiting the empty
check to actual writes restored **86/86** focused cases. Separately removing
`await assertEmptyOutputRoot(outRoot)` made the three write-refusal cases fail
(**3 failed / 28 passed**), proving the final guard still detects its forbidden
state. The final full local gate on base `8da15de2` also passed: typecheck,
lint, **4,428 unit / 411 browser / 349 integration** tests (6 existing skips),
production build and **44 E2E** tests without retries. **CONFIRMED:** [#954](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/954)
merged as `65bd70c0` at 22:09:06 UTC after review `5261882451` approved exact
head `844cc5cb`, zero unresolved threads and green [CI 35540192530](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35540192530).
The [closeout](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/954#issuecomment-5753029651)
separates the superseded cancelled CI run from the successful final run. The
[reconciliation snapshot](../../debt/assets/content-integrity-2026-09-20/verification.md#reconciliation-snapshot)
records the release-evidence boundary; the implementation limits below remain open.

The managed caller still removes the imported tree between validation and
regeneration. It does **not** use the new safe staging procedure yet; adapting
that caller is a remaining DEBT-483 task in the other clone's assigned runtime
file. This PR preserves its existing non-writing preflight rather than changing
that owned file. A passing manual staging test does not prove managed seeding is
transactional or that its delete-before-regenerate window is closed.

[Content pipeline operations](../../practice-engine/content-pipeline.md#import-drafts--mdx-generated)
now prescribe a fresh temporary directory **outside** the seed glob, followed by
artifact review and a separate deliberate placement of approved MDX. The previous
procedure deleted the current imported tree before regeneration; the new procedure
preserves it while generating and validating its replacement. Only the import
workflow was updated; the guide's other architectural/format sections retain their
earlier verification scope.

**Remaining boundary:** the CLI enforces an empty destination, not automatic
activation, a signed/fresh release, filesystem transactionality or database
atomicity. A late filesystem error may leave incomplete files in the new staging
directory; that directory must not be treated as an approved artifact. Concurrent
hostile filesystem replacement remains outside the existing DEBT-485 boundary.
The seed glob itself is unchanged, so operators must keep staging outside
`content/questions/` until the separate review/placement step. Missing draft IDs
still do not implicitly withdraw database rows. Use the explicit withdrawal
command, and keep release identity, all-or-nothing activation and revocation-aware
rollback open under private SPEC-007. No production content/database mutation was
performed.

## Managed-caller staging — 2026-09-27

**CONFIRMED:** the managed environment seed no longer deletes the imported tree
before regenerating it. `prepareCorpus` in `scripts/seed-environment-runtime.ts`
used to dry-run, remove `content/questions/imported`, then import into it. A
failed import therefore left no tree or a partial one for the next seed. That
sequence now lives in `scripts/prepare-seed-corpus.ts`, which imports into a fresh
`content/.import-staging-*` directory. The directory sits beside
`content/questions/`, so it is outside the seed glob and on the same filesystem.
The module swaps the result into place with two renames only after the whole
import succeeds. The separate dry-run is gone, because the staged import runs the
same full preflight before it writes anything.

Test-first, `scripts/prepare-seed-corpus.test.ts` runs against a real temporary
filesystem. The same interface was first given the old algorithm, extracted as-is,
and the cases went **3 failed / 1 passed**:

- staging outside the seed glob;
- the current tree surviving an import that fails after a partial write;
- the current tree restored when the final rename fails.

The first-import case passed on both algorithms. With the new module the result is
**4/4**. Two more cases pin the remaining paths. A tree that cannot be moved aside,
because of a read-only parent (`EACCES`), stays in place. A first import that cannot
be placed leaves neither a tree nor a temporary directory. The module is covered at
100% of its statements, branches and functions. The runtime's `prepareCorpus`
wiring, the `content:import:drafts -- --status published --out <staging>` command,
is tested through an injected spawner and content root. A real importer run into a throwaway staging directory at the managed
location wrote 948 files byte-identical to the current imported tree (0 differing
files), and the directory was then removed. No database or remote target was
touched.

If the swap-in fails and restoring the parked tree also fails, the parked tree is the last copy of the current corpus. It is kept, and the error names its path (#1153 review). An injected rename forces this double failure: before the fix, the cleanup deleted the only copy.

**Remaining boundary:** a crash between the two renames leaves
`content/questions/imported` absent and the previous tree parked in
`content/.import-previous-*` for manual recovery. The window is two syscalls, not a
whole import. Seeding still commits per question. Immutable release identity,
all-or-nothing activation and revocation-aware rollback stay open under SPEC-007,
as does archived-question review under DEBT-484.

## Decision — 2026-09-27

[ADR-021](../../adr/adr-021-question-revisions-and-content-releases.md) decides the app's side of SPEC-007. Content becomes visible only through a verified release, recorded with its manifest hash and parent, staged invisibly and activated in one transaction that compares the active-release pointer; any failure leaves the previous release active. Withdrawals and holds are a current overlay keyed by question and revision, so a rollback to an older release never resurrects a revoked item, and today's explicit-QID withdrawal command becomes a writer to that overlay. Selection reads the active release, and `questions.status` is retired in a contract step.

This record closes after ADR-021's phase 4 (releases, overlay and rollback), with the Verification above demonstrated on disposable databases. Release zero, the inventory of what is live, uses the `stored-fields-json-v1` hash form decided in the ADR on 2026-09-28, and waits for the content repository to compute that form too.

## Phase 4 design — 2026-10-01

ADR-021 decisions 4–6 leave the mechanism to this record. Each step below is its own reviewed PR with an N-1 answer.

**Activation materializes.** Every reader already selects by `questions.status = 'published'` and reads `current_revision_id`. Phase 4 makes both derived: once a release is active, only an activation writes them, in one transaction, from the active release minus the overlay. The one exception is the withdrawal command. It archives a question directly and records its withdrawal in the same transaction, under the question's row lock, and that preserves the rule. An activation never publishes a withdrawn revision, so the command writes exactly the status the next activation would derive. And because the record lives in the overlay, no later activation, including a rollback, can publish that question again (#1290 review). Readers do not change. A reader sees the state before an activation's commit or the state after it, never a part of one. A rollback is an activation of an earlier release under the same rule, so it cannot resurrect a withdrawn revision. This is the ADR's "the legacy `status` stays in step until the release pointer is authoritative", done as a parallel change. A later contract step, outside this record, moves selection onto release items and retires `status`.

**The overlay (decision 5).**
- `question_withdrawals` is permanent. Withdrawal is per question, keeping #953's policy: every revision of a withdrawn question has a row, and a corrected replacement takes a new QID.
- `question_holds` has the same key, with `placed_at` and a nullable `lifted_at`. An unlifted hold excludes its revision.

**Releases (decision 4).**
- `content_releases`: id, the manifest, its sha256 `manifest_hash`, `parent_release_id`, and `created_at`, `verified_at`, `activated_at` receipts. A release is its manifest on its base: the pair is unique (migration 0048). A release is never changed once written.
- `content_release_items`: `(release_id, question_id)` primary key and the item's `question_revision_id`, with a composite key to `question_revisions(id, question_id)`.
- `content_release_pointer`: one row naming the active release. The migration creates it with no active release, so the seed and activation can lock it before any release exists.

**Activation**, in one transaction:
1. Lock the pointer row and compare the active release with the release's parent; a mismatch rejects the release as stale.
2. Verify the stored manifest against its hash, and each item's revision hash against the manifest.
3. Lock the affected question rows in id order, the order the seed and the withdrawal command use.
4. Publish each item that is neither withdrawn nor held, at the item's revision. Archive every other published question. Drafts that no release names are untouched.
5. Move the pointer and record the receipts.

Any failure rolls the whole transaction back, and the previous release stays active. The first activation adopts what is live: every published question at its current revision, with no parent. That is not the ADR's release zero, which waits for the content repository to compute the hash form, and it is not called that.

**The seed as release builder (decision 6).** In production, the seed stages: a new question is inserted as a draft, changed content is appended without moving the pointer, and the release records an item for each published file. A separate, explicit step activates a staged release by id. The local and test seed keeps today's direct path. Tags are not versioned (decision 1), so a tag change stays immediately visible; that residual is accepted.

**Steps.**
- **4a, the withdrawal overlay:** this design; `question_withdrawals`; the withdrawal command and the seed record withdrawals, and the seed refuses a withdrawn question.
- **4b, releases and activation:** the release tables, holds, the activation transaction and the first activation, with a real-Postgres case for each rule above, including an injected failure. The direct seed, including its placeholder archival, refuses a database that has an active release. Each seed transaction reads the pointer under a share lock, which activation's update lock excludes, so a seed write and an activation cannot interleave. Before the first activation the seed and the withdrawal command write `status`; after it, only activations and the withdrawal command do (#1290 review). No release is activated in production in this step.
- **4c, the operator commands and the release builder**, as two PRs:
  - **4c-i:** commands to bootstrap, activate (rollback included) and place and lift holds.
  - **4c-ii:** staging for the production seed path, the release builder.

  The first production activation follows 4c-ii. Until then no production release is active and the direct seed runs, so content updates are never blocked (#1290 review).
- **4d, verification and closure:** the Verification suite above on disposable databases, docs and closeout. Rollback needs no command of its own: `activate-release.ts` naming an earlier release is the rollback (4c-i).

**Decided here, under the owner's delegation.**
- Withdrawal is recorded per revision but ordered per question.
- A question no release names keeps its status if it is a draft, and is archived if it was published.
- The manifest format is app-defined until SPEC-007 settles, and is not called SPEC-007.
- The owner's deferred decision on scoring an item withdrawn mid-session is untouched: an active session keeps the items it bound.

## Withdrawal overlay (phase 4a) — 2026-10-01

**CONFIRMED red first.** With migration 0045 applied to the clone's test database, the new tests ran twice before the code changed:

```bash
pnpm test:integration tests/integration/content-withdrawal.integration.test.ts tests/integration/question-withdrawals.integration.test.ts
```

- With the command and the seed both unchanged: **18 failed / 16 passed**. Twelve cases specify the command's new interface, which the old parser rejects as unknown arguments; as in the 2026-09-20 receipt, these are red-first feature tests, not defects. The other six fail because the seed records nothing.
- With the new command and the old seed: **8 failed / 26 passed**, each on the seed. The old seed records no archive. It also restored a synthetic placeholder that the command had withdrawn (`updated: 1`), which is the gap the new refusal closes.
- With both changed: **34/34**.

Four of the 34 cases test the migrations themselves and pass once they are applied. The backfill and its repair, run in migration order and then again, record each archived question's revisions exactly once. A withdrawal naming another question's revision is refused, and so is a blank reason or authority.

Migration 0045 adds `question_withdrawals`:
- `(question_id, question_revision_id)` primary key, with a composite key to `question_revisions(id, question_id)`, so a withdrawal cannot name another question's revision;
- `reason` and `authority`, each required to contain a non-space character, and `effective_at`.

Its backfill records every revision of each archived question: until now an archive was the only record of a withdrawal, and an operator's withdrawal cannot be told from an archive in MDX. Only the synthetic placeholder fixtures, which the seed archives and restores by design, are left out.

**The backfill's repair, migration 0046.** 0045 left out every archived `placeholder-` question. The prefix alone is not enough to make a question synthetic: the seed treats a file as synthetic only if it also lives in `content/questions/placeholder/`, and the database records no path. An authored `placeholder-` question archived before 0045 would therefore have no record (#1290 review). By then this PR's first Preview deployment had applied 0045 to the Preview database, and the migration ledger refuses an amended migration. So 0045 keeps its applied text, and 0046 runs the backfill again, leaving out only the ten fixtures committed in that directory, named by exact slug. Rows 0045 recorded keep their record. With the repair made a no-op, the backfill case failed (2 rows instead of 4) because the authored `placeholder-` question was skipped; with 0046, it passes. Both counts are reported. On the clone's test database, which holds no archived authored question, each was 0. Production applies both in one Vercel build, whose log will give the counts, and the release record will repeat them.

**The clone's test database.** It had the first version of this change applied, so it was backed up and reversed twice (`question_withdrawals` dropped, the ledger row deleted by id and the journal's `when`), and it now holds 0045 as applied on Preview plus 0046.

The withdrawal command now takes a required `--reason` and `--authority`. Under the ordered row locks it already takes, it archives each named question and records every revision not yet recorded; a recorded revision keeps its first record. The dry run reports how many revisions it would record.

The seed records a withdrawal, with authority `content seed`, whenever authored input is archived. That covers a new question first seeded as archived, a revision appended to an archived question, and an unchanged replay of an archive that older code made without a record. It refuses to restore a withdrawn question, even a synthetic placeholder.

**N-1:** the serving deployment neither reads nor writes the table. An archive made by the previous commit's command or seed during the deploy is recorded when it is replayed with this commit's.

**Remaining:** nothing reads the overlay yet; activation (4b) is its first reader.

## Releases and activation (phase 4b) — 2026-10-01

Migration 0047 adds the release tables, holds and the pointer. `scripts/content-release/` holds the activation engine. No command calls it yet, so nothing can activate a release in production in this step.

**The tables.**
- `content_releases`: the manifest, its `manifest_hash` (unique, lowercase SHA-256 hex) and `parent_release_id`. *(2026-10-01: 0048 replaced the unique hash with a unique (hash, parent) pair; see 4c.)*
- `content_release_items`: one revision per question, with a composite key to `question_revisions(id, question_id)`.
- Triggers reject every update to a release, its items or a withdrawal, and let a hold change only by being lifted, once. Each row records a decision. A changed release is a new release.
- `content_release_pointer`: its one row is created with no active release, so it can be locked before any release exists.
- `question_holds`: at most one unlifted hold per revision.
- **A change from the design:** the verification and activation receipts are rows in `content_release_activations` (release, previous release, time), not columns on the release. A release can be activated more than once, by a rollback, and verification commits with each activation.

**Locks.** 0047's header names the new tables and the foreign keys to `question_revisions`. It omits the update trigger it adds to `question_withdrawals`, a live table: `CREATE TRIGGER` takes SHARE ROW EXCLUSIVE on it until commit, which blocks only the withdrawal command and the seed (#1293 review). The note lives here because 0047 was already applied on Preview, and the migration ledger hashes the whole file, comments included.

**The manifest** (`app-release-manifest-v1`) lists each item's slug and the `stored-fields-json-v1` hash of its revision, ordered by slug. *(Since DEBT-489, `app-release-manifest-v2` also names every live question the release removes; see [DEBT-489](./debt-489-release-removes-omitted-questions.md#fix--2026-10-02).)* Its hash is SHA-256 over sorted-key JSON, byte-identical to Python's `json.dumps(m, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`. A unit test pins a digest computed independently with Python.

**Activation** runs in one transaction, in this order:
1. It locks the pointer for update and rejects a stale release. The active release must be the one the caller expects. A release that has never been active must also be built on it, or it would drop whatever was activated since its base. A rollback re-activates a release that has an earlier receipt, so it is exempt from the parent check. *(The parent check was added after promotion #1293's review: the first version compared the pointer only with the caller's expectation. A case where a release built on an earlier base is rejected now covers it, and removing the rollback exemption fails the rollback case.)*
2. It recomputes the manifest's hash from the stored manifest, and rebuilds the manifest from the items' slugs and revision hashes; both must match.
3. It locks every question it changes, in id order.
4. It publishes each item at its revision unless the item's question has any withdrawal, or its revision has an unlifted hold. Excluding on any withdrawal of the question fails closed and keeps #953's per-question policy.
5. It archives every other published question, and leaves alone drafts that no release names.
6. It moves the pointer and writes the receipt.

The first activation, the bootstrap, holds the pointer before it reads what is live. So no seed transaction can publish in between.

**The seed.** Each seed transaction, and placeholder archival, now begins by reading the pointer under a share lock. It refuses when a release is active, or when the pointer row is missing.

**Decided here, under the owner's delegation.**
- **A hold takes effect by re-applying the active release.** The hold command comes with the operator commands in 4c, and before any release is active it refuses, pointing to withdrawal. Today nothing derives `status` from the overlay, so a hold recorded then would silently do nothing.
- **What learners see.** The app tells learners a question is withdrawn when its status is not `published` (`get-attempted-questions.ts`, `get-user-stats.ts`, `get-question-for-view.ts`). Held questions, and questions a release leaves out, therefore read as withdrawn too. The flag means the item is outside new selection; it does not distinguish a temporary hold from permanent withdrawal or release omission. Whether it left for good is recorded in the overlay, not shown. **2026-10-02 audit correction (BUG-317):** this is not a guarantee that an existing exam draft is never graded. `finalize-exam-answers.ts` still grades saved drafts against their bound revisions; the owner-deferred mid-session scoring decision remains open. Clinical approval of the single label has not been established.
- **Identical releases.** `manifest_hash` is unique, so 4c's staging must reuse an existing release with an identical manifest rather than write a second one. *(2026-10-01, superseded: promotion #1295's review showed this was a dead end. A set staged on one base could never be staged on a newer one, because reusing the old release fails the parent check. 0048 keys a release by its manifest and its parent, and staging reuses only a release with the same manifest on the same parent.)*

**Verification** (`tests/integration/content-release-activation.integration.test.ts`, 20 cases, real Postgres):
- **Activation cases** run inside a transaction that is always rolled back, because activation archives every published question a release leaves out, and the shared test database holds the seeded corpus. They cover:
  - publishing at an older revision; restoring an archived item; archiving an omitted question; leaving drafts alone;
  - excluding withdrawn and held items, but not one whose hold was lifted;
  - a rollback that does not resurrect a question withdrawn since that release;
  - a stale release, a new release built on an earlier one, manifest-hash and item mismatches, and a missing release;
  - a failure injected at the receipt, activation's last write, which leaves every question and the pointer as they were;
  - the bootstrap changing nothing, and running only once;
  - the immutability triggers, and a hold that can be lifted once and changed in no other way.
- **Seed cases** commit the pointer, because another connection must see it. They point it at a release of one test question and never activate that release. They always put the pointer back and delete the release, and restore anything a regression would have written. They cover:
  - the seed refusing a sync, an insert and placeholder archival, and still archiving placeholders while no release is active (in a rolled-back transaction);
  - a seed that waits on an activation holding the pointer, then refuses;
  - a missing pointer row.

**Red first.** The suite was written before the engine and the guard.
- With the engine in place and no seed guard, the four committed seed cases failed: **4 failed / 12 passed**, of the 16 cases the suite then had. The two trigger cases for withdrawals and holds came after, and so did the placeholder-archival success case, which #1292's patch coverage found missing. That run also archived the ten placeholder fixtures and inserted a test question in the shared database. Both were repaired at once, and those two cases now restore what a regression writes.
- **Mutation check:** each rule was removed in turn, and every removal failed at least one case. The rules: the withdrawal exclusion, the hold exclusion, the stale check, the manifest-hash check, the items check, the bootstrap's active check, archiving omitted questions, and the guard in each of the seed's sync, insert and placeholder paths.

## Operator commands (phase 4c-i) — 2026-10-01

Three commands in `scripts/content-release/`, each a dry run unless `--apply`. Each needs an explicit `DATABASE_URL`, and a remote target also needs the exact `DB_TARGET_ACK`. A dry run is the real transaction, rolled back: it verifies, locks and counts exactly as the applied run would.
- **`bootstrap-release.ts`** adopts what is live as the first release.
- **`activate-release.ts --release <id> --expect-active <id|none>`** activates a staged release. It is also the rollback: name an earlier release and the one you expect to be active.
- **`hold-questions.ts --qid … --reason … --authority … [--lift]`** places a hold on each question's live revision, or lifts the hold on that live revision. Both act only on the revision the active release publishes (#1296 review): a lift never records itself on a hold it did not target.
  - It re-applies the active release in the same transaction, so the question leaves the bank, or returns to it, at once.
  - It refuses while no release is active, a question the active release does not name, and an unknown QID.
  - A lift records its own reason and authority.

The withdrawal command shares the QID argument parser (`scripts/seed/qid-command-args.ts`).

**Do not bootstrap production before 4c-ii ships.** Afterwards the direct seed refuses that database, and until the release builder exists no content could change there.

**Migration 0048.**
- **The lift record.** `lift_reason` and `lift_authority` are required exactly when `lifted_at` is set.
- **The release identity.** A release is now its manifest on its base: (`manifest_hash`, `parent_release_id`) is unique, as two partial indexes. 0047's unique hash alone was a dead end (promotion #1295's review): a set staged on one base and never activated could never be staged on a newer one. 4c-ii's staging reuses only a release with the same manifest on the same parent.

**Verification.**
- **The commands** run in-process against a disposable database: a fresh database in the clone's own Postgres, with every migration applied, dropped afterwards (`tests/integration/disposable-database-test-helpers.ts`). The shared database cannot take a committed activation, which would archive the seeded corpus. 12 cases:
  - the bootstrap's dry run and apply, and its refusal once a release is active;
  - an activation's dry run and apply, and a rollback;
  - a stale expectation;
  - a hold's dry run, apply, repeat and lift, and a lift that leaves a hold on another revision in place;
  - the hold's three refusals;
  - each script's exit code on a bad argument.
- **The activation suite** gains two cases: one for the release identity, and one for a lift without its record.
- **Unit cases:** 16 for the shared QID parser and 14 for the bootstrap and activate parsers.

**How the tests were proven.** In this step the commands were written before their tests, against the test-first rule, so the red proof is a mutation check instead. Six behaviours were removed in turn, and each removal failed at least one case:
- re-applying the release after a hold;
- the three refusals;
- the lift record;
- the dry run's rollback.

The lift-record case also caught a real defect before any push. The first check, `lift_reason ~ '…'`, evaluates to NULL when the reason is NULL, and a CHECK passes on NULL, so a lift without a record was accepted. The check now tests `IS NOT NULL` explicitly. 0048 had not been pushed, so it was corrected in place, and the clone's database was reversed and re-migrated.

## The release builder (phase 4c-ii) — 2026-10-01

`scripts/content-release/stage-release.ts` stages the MDX bundle as a release on the active release. Its drafts, non-current revisions and release items are not visible to learners until activation. The exception is tags, which are not versioned (ADR-021 decision 1), so a tag change takes effect when it is staged (#1298 review). `release-builder.ts` holds the logic.

**What staging writes.**
- It checks the whole bundle first, with the seed's own preparation: every file parses, slugs are unique and tag definitions agree.
- In one transaction it then:
  - takes the pointer for share and locks the bundle's existing questions in id order;
  - inserts each new question as a draft;
  - for changed content, appends a revision that does not become current, or reuses an existing revision with the same content;
  - replaces tags in place where they changed (they are not versioned, ADR-021 decision 1);
  - records an authored `archived` file as a withdrawal, as the seed does;
  - names every `published` file as an item at the revision matching it.
- A release with the same manifest on the same parent is reused rather than written again.
- Activation stays a separate, explicit step. The command prints it.

**What it refuses.**
- **No active release.** Bootstrap first; until then the direct seed writes content.
- **A withdrawn question in any file not archived.** #953: a correction takes a new QID.
- **A bundle with no published file.** Activating it would take every question out of the bank.
- A refusal writes nothing at all, because the stage is one transaction.

**How production changes content once bootstrapped.** Stage, preview the activation with the printed command, then activate it with `--apply`. `pnpm db:seed`, and the managed seed that wraps it, refuse a database with an active release. **When to bootstrap production is an owner decision**, because it changes how content is published: until then the direct seed keeps working.

**Verification.** 9 real-Postgres cases against a disposable database:
- staging new and changed content invisibly, then activation publishing it, archiving a question whose file became a draft, and moving the changed question to its new revision;
- reusing a matching revision and the identical release on a restage;
- an `archived` file recorded as a withdrawal and left out;
- a withdrawn question refused, with nothing written, not even another file's new question;
- an empty release refused;
- an invalid file stopping the stage before any write;
- the command's dry run, apply and printed activation, and an unknown argument.

**Red first.** The suite was written first and failed on the missing module. A mutation check then removed six rules in turn, and each removal failed a case:
- the revision staying non-current;
- the draft status;
- the withdrawn refusal;
- the empty-release refusal;
- reusing a matching revision;
- reusing an identical release.

## Verification suite (phase 4d) — 2026-10-02

The Verification this record asks for is demonstrated end to end in `tests/integration/content-release-verification.integration.test.ts`, against a disposable database. Each case drives the operator commands and the release engine as an operator would.

| Verification | Case |
|---|---|
| Withdrawal | A withdrawal archives the question at once. Re-applying the release that still names it, and activating a newer release, both keep it out. |
| Preserved attempts | A learner answered the question before it was withdrawn. Their attempt rows are unchanged, and the real history read (`GetAttemptedQuestionsUseCase` over the Drizzle repositories) still lists it, marked withdrawn, as the revision they answered. |
| No resurrection from stale output | A stale MDX file for a withdrawn question is refused by the direct seed before releases, and by staging after the bootstrap. |
| Rejection of stale releases | A release staged on a base that is no longer active is rejected, even with the active release named, and nothing changes. |
| Rollback with revocation checks | A rollback to the bootstrap release keeps out a question withdrawn since and a revision held since, and reports both exclusions. |
| No visible partial release after injected failure | A trigger pauses activation at its last write, after every question has changed, until the test releases an advisory lock. A reader on another connection sees the old state throughout. When the activation fails, the reader still sees the old state and pointer; when it commits instead, the reader sees the whole new release at once. |

**Results.** 7 cases, which passed three consecutive runs locally. The withdrawal command now takes the same injectable `env` and `log` as the release commands, so it runs in-process here.

**What this suite adds.** Earlier steps proved each rule red first: 4a, 4b, 4c-i by a mutation check, and 4c-ii. This suite proves them together on one fresh, fully migrated database. Its new evidence is the cross-connection visibility case and the preserved-attempts read.

**Closeout.** This record closes in a docs-only follow-up once this step is released, with release receipts. *(2026-10-02: a review of the release workflow found that a release silently removes every live question its bundle omits. That is [DEBT-489](./debt-489-release-removes-omitted-questions.md), filed with a reproduction, and it gates the production bootstrap.)* The remaining tails go to the register's Deferred table:
- the production bootstrap, which is the owner's decision;
- the managed seed's switch to staging after that bootstrap;
- the contract step that moves selection onto release items and retires `questions.status`;
- ADR-021's release zero, which waits for the content repository to compute `stored-fields-json-v1`.

## Related

- [DEBT-484](./debt-484-question-rewrite-history-identity.md)
- [Parked DEBT-446](./debt-446-local-db-script-target-guards.md):
  existing freshness-related scope remains subject to its owner ruling; this
  record does not silently activate unrelated parked work.

## Independent audit follow-up — 2026-10-02

[BUG-314](../bugs/bug-314-content-hold-withdrawal-deadlock.md) records real
operator/learner deadlocks and concurrent staging failure. Its fix serializes
content writers on the pointer, uses ordered NO KEY UPDATE question locks,
and orders session binding SHARE locks. This supersedes the earlier share-lock
writer description; the direct seed still commits per question.
[BUG-315](../bugs/bug-315-placeholder-prefix-archives-authored-content.md)
limits runtime placeholder archival to the ten exact fixture slugs.
[BUG-316](../bugs/bug-316-content-release-test-resource-cleanup.md) repairs
migration-failure cleanup and the visibility test's failure cleanup and wait
identity. [BUG-317](../bugs/bug-317-content-release-documentation-overclaims.md)
corrects operational prose without deciding a new scoring policy.

Activation commits all materialized changes atomically. At READ COMMITTED,
each reader statement sees a committed state; separate reader statements can
straddle that commit and are not promised one transaction-wide snapshot.
Supported content/overlay writers participate in the pointer/row-lock protocol;
arbitrary administrator SQL is outside that proof. The immutable-row triggers
reject UPDATE, not DELETE; no scoped runtime writer deletes release/withdrawal
rows. This is not an authorization boundary against database-owner SQL.

Staging's tag exception remains accepted, but is not its only persistent side
effect: an authored archive records a permanent withdrawal before activation.
DEBT-489's design review records that reproduced behaviour; its implementation
belongs to the parallel session. *(Implemented 2026-10-02: staging records no
withdrawal, and activation withdraws an `archived` removal; see
[DEBT-489](./debt-489-release-removes-omitted-questions.md#fix--2026-10-02).)* Neither this audit nor its fixes activate a
release on production or Preview, and no remote ledger is claimed verified.

## Verified closeout — 2026-10-02 UTC

*Corrected 2026-10-06: ADR-021's [2026-10-03 amendment](../../adr/adr-021-question-revisions-and-content-releases.md#amendment--2026-10-03-the-contract-step-is-not-pursued) declined the fourth tail's direct-release-item read model, and ADR-022 with DEBT-493 settled the scoring tail; the production bootstrap, managed-seed staging and content-repository release zero remain deferred.*

ADR-021 phase 4 is implemented, reviewed, promoted to `main` and release-verified: the withdrawal overlay (4a), releases and activation (4b), the operator commands (4c-i), the release builder (4c-ii) and the verification suite (4d). [DEBT-489](./debt-489-release-removes-omitted-questions.md)'s explicit removals and plan-bound apply, and the independent audit's fixes ([BUG-314](../bugs/bug-314-content-hold-withdrawal-deadlock.md)–[BUG-317](../bugs/bug-317-content-release-documentation-overclaims.md)), shipped with it. Each dated section above carries its step's receipts; their "Next" and "Closeout" lines are historical execution notes, superseded by this section. Every Verification item was re-run against `main`'s code before archival: the archiving branch differs from `7dcb9331` only in documentation. The 15 release, withdrawal, seed and cleanup integration files (163 cases) and the 12 script unit files (120 cases) passed.

| Verification | Holds | Receipt on `main`'s code |
| --- | --- | --- |
| Withdrawal | Yes | `content-release-verification`: *a withdrawal takes the question out at once and keeps it out of every later activation*. The withdrawal command's own cases are in `content-withdrawal`. |
| Preserved attempts | Yes | `content-release-verification`: *preserves a learner's attempt on a withdrawn question, and their review of it*, through the real history read. |
| No resurrection from stale output | Yes | `content-release-verification`: *never resurrects a withdrawn question from stale output*, by the direct seed before releases and by staging after the bootstrap. |
| Rejection of stale releases | Yes | `content-release-verification`: *rejects a release staged on a base that is no longer active*; `content-release-activation`: *rejects a new release built on an earlier release, even when the active release is named*. Since DEBT-489, an apply is also refused when its reviewed plan has changed (`content-release-plan`). |
| Rollback with revocation checks | Yes | `content-release-verification`: *rolls back with the overlay applied: a withdrawn question and a held revision stay out*. A rollback has its own plan, which must match (`content-release-plan`). |
| No visible partial release after injected failure | Yes | `content-release-verification`: *shows a reader no part of an activation that fails*, *…that commits* and *…that observation fails* (BUG-316 repaired its cleanup and wait identity). |
| No production credentials in the content repository | Yes, by design | The release and withdrawal commands take their target from the operator's `DATABASE_URL`, and a remote target also needs `DB_TARGET_ACK` (`scripts/database-command.ts`). The content repository connects to no database; release zero, its first release, is Deferred below. |

**Release.** Released through promotion #1312 (`7dcb9331`, merged **09:41:39Z** after a passing `verify-promotion` receipt): main CI **36991253547** `test` passed **09:55:00Z**, production assigned **09:55:02.296Z**, trees `d1e952d0`, and `/api/health` reported `ok` with the database reachable. Promotions #1304, #1306, #1308 and #1310 were closed unmerged to take their reviews' findings first, through #1305, #1307, #1309 and #1311.

**Deferred, not resolved.** Four tails move to the register's Deferred table, with revive triggers:
1. **The production bootstrap.** Adopting what is live as production's first release is the owner's decision. The recommendation is to do it after [DEBT-490](./debt-490-release-decisions-record-no-reason-or-authority.md), so the first production activation records who decided it and why.
2. **The managed seed's switch to staging.** Once a release is active, the managed seed refuses that database; it must then stage a release instead.
3. **The contract step.** Selection still reads the materialized `questions.status` and `current_revision_id`. Reading release items directly, and retiring `questions.status`, is ADR-021's contract step.
4. **ADR-021's release zero.** The content repository builds the first release once it computes `stored-fields-json-v1` (SPEC-007).

The owner's decision on withdrawn-item scoring stays Deferred under [DEBT-484](./debt-484-question-rewrite-history-identity.md#verified-closeout--2026-09-30-utc).

