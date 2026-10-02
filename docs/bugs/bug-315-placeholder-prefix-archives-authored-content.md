# BUG-315: Placeholder Archival Removes Authored Prefix Matches

**Status:** Open
**Priority:** P2
**Date:** 2026-10-02

## Evidence and reproduction

On disposable local Postgres at `3ecc1283`, seed one published authored source
`/tmp/placeholder-authored-clinical-question.mdx`, then call
`archivePlaceholderQuestions`. Result: **1 archived, 0 withdrawals recorded**.
The source is outside the synthetic fixture directory. The archive predicate
in `scripts/seed/placeholder-archiver.ts` is `LIKE 'placeholder-%'`.
Migration 0046 already recognizes that a prefix is not proof of a fixture,
but the runtime archiver still uses it.

## Failure scenario

An authored question has a valid placeholder-prefixed QID. A normal seed that
excludes synthetic fixtures silently archives that authored question without a
clinical withdrawal record. A subsequent authored seed can then refuse it as
archived. This is not evidence of an actual production incident.

## Options and decision

- Keep the prefix convention: rejected; authored slugs may use it.
- Add source provenance to the schema: unnecessary for the ten known fixtures.
- **Chosen:** archive only the ten committed synthetic fixture slugs, using an
  explicit shared list checked against the committed MDX files. Do not edit
  applied migration 0046. Test both the fixture and the authored prefix match.

## Verification required

Real-Postgres red/green and mutation proof; full gate and exact-head approval.
No runtime fix has been made at filing time. Keep open pending promotion.

## Local implementation receipt — 2026-10-02

The recorded fix is implemented locally, with red/green and mutation evidence in
the [audit ledger](./assets/content-release-audit-2026-10-02.md). Focused
integration: 15 passed. Full exact-head gate, review and merge receipts are
recorded in the PR when complete. No production promotion is claimed; this
record remains open.

The first full integration gate found an older activation test expecting all
11 prefix matches to archive. The corrected implementation archived only the
ten fixtures. Updated that test to the exact fixture identity and to require
the extra authored prefix match to stay published; the activation suite then
passed 21 cases. This was a stale test expectation, not a reason to restore
the reproduced archival defect.
