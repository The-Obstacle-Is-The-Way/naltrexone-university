# BUG-317: Content Release Guidance Overstates Isolation and Clinical Behaviour

**Status:** Open
**Priority:** P3
**Date:** 2026-10-02

## Evidence and reproduction

The independent disposable-Postgres probe recorded in DEBT-489 staged an
archived file, abandoned that release, then re-applied the original release.
One still-published question was archived by the staged withdrawal. Thus the
pipeline's claim that tags are the only staging effect omits a permanent global
overlay decision. A rollback cannot undo it.

Other source-verified documentation mismatches:

- DEBT-483's learner section says a held item should not be graded while under
  review. `finalize-exam-answers.ts` reads saved drafts through
  `fetchSessionOwnedQuestionsById` and grades their bound revisions without a
  publication-status predicate. Mid-session scoring is already an owner-deferred
  policy; the statement is not an implemented guarantee.
- The pipeline says a hold lift returns the question, without the condition
  that a question-wide withdrawal still wins. `activateRelease` excludes any
  withdrawal before evaluating holds; the disposable withdrawal/rollback tests
  exercise that priority.
- The active DEBT-483 register row says its verification suite remains open,
  but #1300 merged it at `312e4415`; its source-head approval and CI run
  `36948237522` were read in this audit.
- The storage paragraph says releases will come later although the next
  paragraph already documents their implementation.

## Failure scenario

An operator mistakes staging for wholly private preparation, expects rollback
or a hold lift to reverse a permanent clinical withdrawal, or assumes existing
exam drafts cannot be graded. Stale completion prose also obscures which work
remains. No production incident is established.

## Options and decision

Do not silently change scoring or withdrawal policy to fit the prose. Correct
current operational guidance, date the superseding explanation in DEBT-483,
and retain the existing owner decision for scoring. Distinguish per-statement
atomic visibility from a snapshot across multiple READ COMMITTED statements.
Historical deployment receipts stay attributed to their original dates;
this audit does not claim to have queried production or Preview.

## Verification

The stage/abandon/reapply probe, source paths above, existing real-Postgres
exclusion tests, #1300 git/CI receipts and the documentation guard establish
these corrections. No runtime policy change is part of this record. The
clinical suitability of a single withdrawn label remains unverified and is
an owner review question, not a new clinical policy decided by this audit.

The ADR now explicitly separates the target release interface from the current
materialized-status path, per-question withdrawals, staging effects, missing
plan binding and update-only immutability.

*(2026-10-02, after this record's fix: [DEBT-489's fix](../debt/debt-489-release-removes-omitted-questions.md#fix--2026-10-02)
implemented the plan binding, and staging no longer records a withdrawal; an
`archived` file is withdrawn when its release activates. The ADR and the
pipeline guide now describe that behaviour. The probe above describes the code
before that fix.)*

## Local implementation receipt — 2026-10-02

The recorded fix is implemented locally, with red/green and mutation evidence in
the [audit ledger](./assets/content-release-audit-2026-10-02.md). Focused
integration: 15 passed. Full exact-head gate, review and merge receipts are
recorded in the PR when complete. No production promotion is claimed; this
record remains open.
