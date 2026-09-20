# DEBT-483: No Complete Content Withdrawal or Release Rollback

**Status:** In Progress — static bundle prevalidation verified locally; withdrawal and release milestones remain open
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
Still require explicit withdrawal IDs and reconcile them through an app-owned
operator path that preserves stored history; generate imports into clean staging.
Each mechanism should remain a separate PR. This reduces current exposure
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
Exact-head review, merge and production promotion remain pending.

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
withdrawal, prevention of stale-file resurrection, clean staging, immutable
release identity, all-or-nothing activation, and authorized rollback/revocation
remain open. Preserving stored attempts also does not establish that archived
questions remain accessible through every current review path; see DEBT-484's
published-only lookup receipt. No real content or remote database was changed.

## Related

- [DEBT-484](debt-484-question-rewrite-history-identity.md)
- [Parked DEBT-446](../_archive/debt/debt-446-local-db-script-target-guards.md):
  existing freshness-related scope remains subject to its owner ruling; this
  record does not silently activate unrelated parked work.
