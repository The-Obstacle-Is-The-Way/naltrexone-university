# Spec Alignment Audit (2026-02-06)

**Scope:** Active bugs/debt for practice/review/dashboard flows, validated against current implementation and `master_spec.md`.

---

## Method

1. Read active bug/debt docs (`BUG-072`..`BUG-073`, `DEBT-113`..`DEBT-121`).
2. Trace each claim to code paths in app, use-cases, and repositories.
3. Compare behavior claims to SSOT acceptance criteria (`SLICE-3`, `SLICE-4`, `SLICE-5`).
4. Reclassify or correct docs where classification/details were inaccurate.

---

## Decisions

### Reclassified (Bug → Debt)

- `BUG-072` reclassified to `DEBT-122`.
  - Rationale: SSOT requires exam review-stage jump navigation, not full in-run navigation.
- `BUG-073` reclassified to `DEBT-123`.
  - Rationale: SSOT requires final summary totals; per-question final-summary breakdown is not currently required.

### New Correctness Bug Added

- `BUG-074`: missed-questions latest-attempt query can misclassify on `answered_at` timestamp ties.
  - Root cause in `DrizzleAttemptRepository` latest-attempt join strategy.

### Debt Docs Corrected for Accuracy

- Updated file-size/count details in:
  - `DEBT-115`
  - `DEBT-116`
  - `DEBT-119`
  - `DEBT-120`

---

## Evidence Paths

- SSOT acceptance criteria:
  - `docs/specs/master_spec.md`
- Session runner/UI behavior:
  - `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`
- Dashboard/review behavior:
  - `app/(app)/app/dashboard/page.tsx`
  - `app/(app)/app/review/page.tsx`
  - `app/(app)/app/bookmarks/page.tsx`
- Missed-question query logic:
  - `src/adapters/repositories/drizzle-attempt-repository.ts`
- Supporting use cases:
  - `src/application/use-cases/get-next-question.ts`
  - `src/application/use-cases/get-practice-session-review.ts`
  - `src/application/use-cases/get-user-stats.ts`
  - `src/application/use-cases/get-missed-questions.ts`

---

## Register Updates Applied

- Updated: `docs/bugs/index.md`
- Updated: `docs/debt/index.md`
- Updated: `docs/dev/stabilization-checklist.md`
- Added (now archived): `docs/_archive/bugs/bug-074-missed-questions-timestamp-tie-misclassification.md`
- Added: `docs/debt/debt-122-in-run-question-navigation-gap.md`
- Added: `docs/debt/debt-123-session-summary-missing-question-breakdown.md`

---

## Next Work Queue (Recommended)

1. Fix `BUG-074` in repository query + count logic with deterministic tie-breaking.
2. Decide whether `DEBT-122` and `DEBT-123` are accepted scope or queued for next UX iteration.
3. Keep `master_spec.md` as SSOT and classify future items as bug vs debt based on explicit acceptance criteria.
