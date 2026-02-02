# DEBT-044: SPEC-005 Status Incorrectly Marked as Implemented

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-01
**Resolved:** 2026-02-02

---

## Description

This debt was based on an outdated assumption about SPEC-005 scope.

`docs/specs/spec-005-core-use-cases.md` defines **only three** core use cases (`CheckEntitlement`, `GetNextQuestion`, `SubmitAnswer`) and its "Files to Create" section lists only those files. The codebase matches that scope exactly.

Additional use cases (practice sessions, bookmarks/review, dashboard stats, billing/checkout) are planned under later feature specs (e.g. SPEC-013 through SPEC-015) rather than SPEC-005.

## Impact

- **Misleading progress tracking:** Team believes more is done than actually is
- **Planning errors:** Future work estimates will be wrong
- **Onboarding confusion:** New contributors get incorrect picture of system maturity

## Location

- `docs/specs/spec-005-core-use-cases.md` (line 7, Status field)
- `docs/specs/index.md` (line 25, SPEC-005 row)

## Resolution

No changes required to SPEC-005 status.

Archived as a false positive.

## Verification

- [x] Verified SPEC-005 scope matches implemented files
- [x] Verified `src/application/use-cases/` matches SPEC-005 "Files to Create"
- [x] Verified additional use cases are owned by later feature specs, not SPEC-005

## Related

- `src/application/use-cases/index.ts` - Current exports
- SPEC-012, SPEC-013, SPEC-014 - Feature slices that will implement remaining use cases
