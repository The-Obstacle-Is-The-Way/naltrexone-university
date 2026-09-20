# DEBT-483: No Complete Content Withdrawal or Release Rollback

**Status:** In Progress — initial prevalidation, withdrawal and clean-staging safeguards; release milestones remain open
**Priority:** P1
**Date:** 2026-09-20
**Confidence:** CONFIRMED implementation gap; production incident not established

## Evidence

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
Production promotion remains pending.

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
subsequent receipt below). Clean staging, immutable release identity,
all-or-nothing activation, and authorized rollback/revocation remain open. Preserving stored attempts also does not establish that archived
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
Production promotion remains pending.

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
entry alongside the new output. The existing-empty-directory positive case
already passed.

`scripts/import-draft-questions.ts` now requires an absent or empty output root
before the write loop, after full input/identity/path/symlink preflight. The same
check applies to dry-run. Its refusal names the output root and directs the
operator to a fresh staging directory; existing output is neither pruned nor
overwritten. Existing symlink-error precedence is retained.

The three focused importer/parser suites passed **86/86**:

```bash
pnpm test --run scripts/import-draft-questions.test.ts scripts/draft-question-import.test.ts scripts/seed.test.ts
```

The six rejection cases verify existing sentinel bytes survive and no new output
appears beside stale/unrelated files. An absent or existing-empty destination
still succeeds. A read-only check of the actual local corpus ran:

```bash
STAGING_CHECK_DIR="$(mktemp -d)"
pnpm content:import:drafts -- --out "$STAGING_CHECK_DIR" --dry-run
rmdir "$STAGING_CHECK_DIR"
```

Real output: `files=170 questions=948 written=0 (dry-run) uniqueQids=948`.
`rmdir` succeeded, confirming the freshly created destination remained empty.
No proprietary content was written or changed by that check. The full local gate
passed: typecheck, lint, **4,428 unit / 411 browser / 349 integration** tests
(6 existing skips), production build and **44 E2E** tests without retries.
Fast-forwarding to merged #953 (`8da15de2`) changed ancestry only; its tree matches
tested parent `0aeda526`. Exact-head review, merge and production promotion
remain pending for this staging safeguard.

[Content pipeline operations](../practice-engine/content-pipeline.md#import-drafts--mdx-generated)
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

## Related

- [DEBT-484](debt-484-question-rewrite-history-identity.md)
- [Parked DEBT-446](../_archive/debt/debt-446-local-db-script-target-guards.md):
  existing freshness-related scope remains subject to its owner ruling; this
  record does not silently activate unrelated parked work.
