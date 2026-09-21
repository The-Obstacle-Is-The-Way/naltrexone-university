# DEBT-484: Substantive Rewrites Can Reinterpret Historical Attempts

**Status:** In Progress — initial guard merged in #951; immutable revision and review milestones remain open
**Priority:** P1
**Date:** 2026-09-20
**Confidence:** CONFIRMED behavior boundary; affected production attempts unknown

## Evidence

**2026-09-21 release readback.** #951's merge `269ffeec` is an ancestor of deployed main `76e65e9c`; formal review `5261726459` approved its exact head `d8bf8adc`, and CI `35536461282` succeeded. The guard is shipped, not pending release: `scripts/seed/question-syncer.ts:320-329` checks substantive content changes as well as answer-key changes before updates. The original key-only behavior below is a pre-fix receipt. This does not provide immutable revision identity for attempts/sessions, prevent the active-ungraded-session race, or restore archived-question review. Those remain Open. The separate content repository's authoring-policy line references were not reauthenticated in this app-tree audit and remain attributed historical evidence. [Audit ledger](./assets/active-audit-2026-09-21/verification.md).

The original inspection below predates the initial guard. The dated implementation
receipt records its narrower protection and the revision support still missing.

scripts/seed/question-syncer.ts:79 skips the graded-history policy when
answer-key changes are empty. At :257 the compared payload contains labels and
isCorrect, not learning objective or stem. At :278 the existing question's stem,
explanation, reference, and difficulty are overwritten.
db/schema.ts:870 defines attempts referencing questionId without content revision.
scripts/seed-helpers.ts:75 computes answer-key changes.

The content authoring policy retains QIDs for rewrites, including replacements
of the learning objective (.claude/skills/generate-questions/SKILL.md:422 and
docs/content-debt/CDEBT-02-question-quality-anti-patterns.md:352 in the separate
content repository). This policy is evidence of the reachable trigger, not a
request to copy proprietary question text into public documentation.

## Reproduction

Read-only from app root:

    sed -n '75,115p' scripts/seed-helpers.ts
    sed -n '73,100p' scripts/seed/question-syncer.ts
    sed -n '250,288p' scripts/seed/question-syncer.ts
    sed -n '870,896p' db/schema.ts

Observed: the key-change comparison uses labels/correctness, its empty result
returns before history checking, content updates target the same question ID,
and attempts carry no immutable content version. Changing a stem and all option
meanings while retaining labels/correctness does not change that comparison.

A future disposable-DB reproduction should record an attempt on synthetic item
A, rewrite its clinical task under the same slug with the same correct label,
seed, and inspect historical review. No production history was queried here.

## Failure scenario

A learner's old attempt displays a different question and explanation than the
one answered. Performance statistics mix old and new learning objectives even
when correctness flags are unchanged.

## Smallest fix

The initial rewrite-guard milestone has no SPEC-007 prerequisite.
Until immutable revisions exist, reject substantive same-identity rewrites over
graded history and require a new QID plus explicit archival/replacement.
Define permitted copy edits narrowly; unchanged correct label is not semantic
equivalence. Record that safeguard as partial, not full revision support.
The later SPEC-007 release interface must bind attempts and active
sessions to immutable content revisions. Reconcile the content rewrite policy
in a later authorized authoring-instruction change.

## Verification

Changing learning objective/stem/option meaning with unchanged labels must not
rewrite historical meaning. Minor permitted copy edits have explicit tests.
Old attempts remain reviewable and analytics separate revisions. Preserve the
existing answer-key-change protection rather than weakening it.

## Initial guard receipt — 2026-09-20

**CONFIRMED:** against `b0955d02`, before changing runtime code,
`pnpm test:integration tests/integration/seed-content-rewrite.integration.test.ts tests/integration/bug-regression-seed-choice-sync.integration.test.ts`
produced **18 failed / 12 passed** against this clone's isolated Docker Postgres.
The failures resolved with `{inserted: 0, updated: 1, skipped: 0}` instead of
refusing the rewrite. Eight mutations ran independently over an attempt and
normalized graded session state: stem, general explanation, reference, correct
option text, wrong option text, wrong-option feedback, an added option, and a
removed option. The correct label stayed unchanged in those cases. A separate
case combined a clinical rewrite with an explicitly overridden key flip; the
old code accepted that too. The existing text-only-history test was changed
red-first from permitting the overwrite to requiring refusal.

The seed sync now computes changed content fields from the canonical existing
and incoming representations while holding the question row lock. Its graded-
history policy checks both answer-key changes and those content changes before
any question, choice, or tag update. If an attempt or a graded session state
exists, a content rewrite fails with the slug, changed field names and history
counts, and directs the operator to use a new question ID plus explicit archival.
It does not print clinical text and has no content-rewrite override.

### Deliberate boundaries

- Protected fields: stem, general explanation, reference, option labels/membership,
  option text, and wrong-option feedback when that option's correctness is
  unchanged. Equality uses the existing Markdown canonicalization: CRLF/CR
  normalization, trailing line whitespace removal and outer trimming. It does
  **not** attempt semantic equivalence or permit arbitrary typo/copy edits.
- The existing explicit answer-key correction policy is retained. Flipping
  correctness necessarily adds/removes wrong-option feedback under the schema;
  those transitions belong to that policy. An authorized key correction still
  logs its history counts. Its environment flag does not authorize a simultaneous
  stem, general explanation, reference, option-text or option-membership rewrite.
- Publication status and classification metadata are not frozen. Explicit
  archival remains possible without deleting attempts or changing their text.
  This guard is not a promise of immutable historical classification/analytics.
  **CONFIRMED review boundary:** `get-previous-attempt.ts:169-178,206-213`
  requires `findPublishedById`; `drizzle-question-repository.ts:107-119`
  filters by `status=published` for ID/slug lookups. An archived question returns
  null through those paths even though its attempts remain stored. Historical
  review after archival is therefore still part of the revision milestone;
  row-preservation tests do not establish that user-facing outcome.
- With no graded history, the current same-ID update remains allowed. The later
  SPEC-007 design still needs immutable revisions for attempts and active sessions,
  including a learner viewing an ungraded item while a seed changes it. This
  initial safeguard does not solve that concurrent active-session boundary or
  whole-release atomicity (DEBT-483), and does not close this debt.

### Verification

After the guard, the same focused command passed **30/30**. Each rejected
rewrite compares full question, choice, attempt and normalized-session rows
before/after and requires no mutation. Positive cases retain canonical whitespace
normalization, explicit archival and ungraded updates. Existing key-flip default
refusal, explicit override and ungraded-key behavior still pass; fixtures were
initialized to valid canonical content before adding history so that those tests
continue to isolate key correction.

The existing real-lock race test first failed on its old deletion-specific error
expectation: the new guard refused sooner with `graded history exists`,
`attempts=1`, and `choice_labels`. Its assertion now requires that precise rewrite
refusal and verifies all original choice rows are unchanged. The separate
ungraded-draft-state deletion guard still passes unchanged. The new assertion
preserves the race's refusal/integrity property; it does not accept a SQL foreign-
key error or a successful destructive sync.

The full local gate on parent `b0955d02` passed: typecheck, lint, **4,407 unit /
411 browser / 313 integration** tests (6 existing skips), production build, and
**44 authenticated E2E** tests without retries. Clerk/Stripe were TEST-mode and
the database lanes used clone-isolated Docker. After rebasing onto PR #949's updated head `852c26d5` (including dev PR #948),
the full gate passed again: **4,421 unit / 411 browser / 313 integration**
tests (6 existing skips), build, and **44 E2E** tests with no retries; typecheck
and lint passed as well.
No real content or remote database was changed. **CONFIRMED:** [#951](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/951)
merged as `269ffeec` at 21:03:24 UTC after review `5261726459` approved exact
head `d8bf8adc`, zero unresolved threads, and green [CI 35536461282](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35536461282).
The [review adjudication](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/951#issuecomment-5752644555)
retains the mutation evidence for canonical whitespace coverage. The
[reconciliation snapshot](assets/content-integrity-2026-09-20/verification.md#reconciliation-snapshot)
separates that dev merge from the release readback. Immutable revision binding,
active-session behavior and archived-question review remain open regardless of
that deployment milestone.

## Related

- [DEBT-483](debt-483-content-withdrawal-and-release-rollback.md)
- Content SPEC-005 approval hashes and SPEC-007 release identity.
