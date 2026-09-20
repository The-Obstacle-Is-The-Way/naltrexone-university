# DEBT-483: No Complete Content Withdrawal or Release Rollback

**Status:** Open
**Priority:** P1
**Date:** 2026-09-20
**Confidence:** CONFIRMED implementation gap; production incident not established

## Evidence

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
First require explicit withdrawal IDs and reconcile them through an app-owned
operator path that preserves history; generate imports into clean staging and
prevalidate the entire bundle before mutations. This reduces current exposure
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

## Related

- [DEBT-484](debt-484-question-rewrite-history-identity.md)
- [Parked DEBT-446](../_archive/debt/debt-446-local-db-script-target-guards.md):
  existing freshness-related scope remains subject to its owner ruling; this
  record does not silently activate unrelated parked work.
