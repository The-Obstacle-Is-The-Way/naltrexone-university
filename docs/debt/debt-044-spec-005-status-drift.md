# DEBT-044: SPEC-005 Status Incorrectly Marked as Implemented

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

---

## Description

`docs/specs/spec-005-core-use-cases.md` and `docs/specs/index.md` both list SPEC-005 as "Implemented", but only 3 of 9 use cases are actually implemented.

**Implemented (3/9):**
- `CheckEntitlementUseCase`
- `GetNextQuestionUseCase`
- `SubmitAnswerUseCase`

**Missing (6/9):**
- `StartPracticeSessionUseCase`
- `EndPracticeSessionUseCase`
- `ToggleBookmarkUseCase`
- `GetUserStatsUseCase`
- `GetMissedQuestionsUseCase`
- `CreateCheckoutSessionUseCase`

## Impact

- **Misleading progress tracking:** Team believes more is done than actually is
- **Planning errors:** Future work estimates will be wrong
- **Onboarding confusion:** New contributors get incorrect picture of system maturity

## Location

- `docs/specs/spec-005-core-use-cases.md` (line 7, Status field)
- `docs/specs/index.md` (line 25, SPEC-005 row)

## Resolution

1. Update SPEC-005 status from "Implemented" to "Partial"
2. Update index.md to reflect "Partial" status
3. Add checklist in SPEC-005 showing which use cases are done vs remaining

## Verification

- [ ] SPEC-005 header shows "Status: Partial"
- [ ] index.md shows SPEC-005 as "Partial"
- [ ] Checklist accurately reflects implemented vs missing use cases

## Related

- `src/application/use-cases/index.ts` - Current exports
- SPEC-012, SPEC-013, SPEC-014 - Feature slices that will implement remaining use cases
