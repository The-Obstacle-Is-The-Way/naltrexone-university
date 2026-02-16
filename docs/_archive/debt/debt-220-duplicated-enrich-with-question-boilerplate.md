# DEBT-220: Duplicated enrichWithQuestion Boilerplate Across 4 Use Cases

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-16
**Resolved:** 2026-02-16
**GitHub Issue:** —

---

## Summary

Four application-layer use cases repeated the same “fetch questions → build map → enrich rows” boilerplate, and `GetBookmarksUseCase` reimplemented the enrichment loop inline instead of using the shared `enrichWithQuestion()` helper.

## Resolution

1. Added a shared helper to fetch published questions and return a `Map` keyed by question id:
   - `src/application/shared/fetch-questions-by-id.ts`
2. Standardized all four use cases on the same fetch → map → enrich shape:
   - `src/application/use-cases/get-bookmarks.ts` (now uses `enrichWithQuestion()`)
   - `src/application/use-cases/get-attempted-questions.ts`
   - `src/application/use-cases/get-user-stats.ts`
   - `src/application/use-cases/get-practice-session-review.ts`

Warning messages and “available/unavailable row” behavior remained unchanged.

## Tests

- Added `src/application/shared/fetch-questions-by-id.test.ts`
- Existing unit tests for the four use cases remained green

