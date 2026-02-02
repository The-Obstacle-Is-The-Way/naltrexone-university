# DEBT-054: Unused Domain Error Codes — Defined But Never Thrown

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The domain error code union included codes that were never thrown by any domain service. This made the type surface area misleading and suggested error states that did not exist in behavior.

## Impact

- Error codes suggest handling for conditions that are never triggered
- Misleading for developers reading error type definitions
 - Encourages defensive code that doesn’t map to reality

## Resolution

Removed unused domain error codes from `DomainErrorCodes` so the domain error type matches actual thrown behavior.

## Verification

- [x] Domain unit tests pass (`src/domain/errors/domain-errors.test.ts`, `src/domain/services/grading.test.ts`).

## Related

- `src/domain/errors/domain-errors.ts`
