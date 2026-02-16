# DEBT-223: Verbose Set+Array Dedup Pattern in get-user-stats.ts

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-16
**Resolved:** 2026-02-16
**GitHub Issue:** —

---

## Summary

`GetUserStatsUseCase` previously used a verbose manual dedup loop (Set + Array push) to derive unique question ids for a `findPublishedByIds()` call.

## Resolution

Removed the manual loop by centralizing the dedup+fetch behavior in:

- `src/application/shared/fetch-questions-by-id.ts` (dedups via `[...new Set(ids)]`)

`GetUserStatsUseCase` now delegates question fetching to this helper, eliminating the local Set+push pattern and reducing duplication across the application layer.

## Tests

- Covered by `src/application/shared/fetch-questions-by-id.test.ts`
- Existing `src/application/use-cases/get-user-stats.test.ts` remained green

