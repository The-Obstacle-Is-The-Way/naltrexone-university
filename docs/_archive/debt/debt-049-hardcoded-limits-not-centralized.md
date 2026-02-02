# DEBT-049: Hard-Coded Limits Not Centralized Across Controllers

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

Controller boundary validation limits were duplicated/hard-coded in some Zod schemas, increasing the risk of inconsistent constraints when values change.

## Impact

- Values duplicated (50, 3, 100 appear in multiple places)
- If limits change, developer must find all occurrences
- Easy to update one place but miss another
- No single source of truth for validation limits

## Resolution

Centralized limits and imported them consistently:

- Practice-session related limits live in `src/adapters/repositories/practice-session-limits.ts`.
- General controller boundary limits live in `src/adapters/shared/validation-limits.ts`.
- Controllers import these constants instead of hard-coding numeric values.

## Verification

- [x] Zod schemas reference shared constants.
- [x] Unit tests and typecheck pass.

## Related

- `src/adapters/repositories/practice-session-limits.ts`
 - `src/adapters/shared/validation-limits.ts`
