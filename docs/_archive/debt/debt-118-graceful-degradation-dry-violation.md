# DEBT-118: Graceful Degradation Pattern Duplicated in 3 Use Cases

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-06
**Resolved:** 2026-02-06

---

## Description

Three use cases contain near-identical "graceful degradation" loops that:
1. Iterate over data rows
2. Check if the associated question still exists
3. If missing, log a warning and create an "unavailable" placeholder row
4. If present, enrich the row with question metadata

**Locations:**
- `src/application/use-cases/get-user-stats.ts` (lines 112-141)
- `src/application/use-cases/get-missed-questions.ts` (lines 72-97)
- `src/application/use-cases/get-practice-session-review.ts` (lines 70-102)

The pattern is structurally identical across all three — only the input/output types differ.

## Impact

- Three copies of the same defensive pattern
- If the degradation strategy changes (e.g., throw instead of warn, different placeholder format), all three must be updated
- Minor DRY violation — the pattern is small (~25 lines each) but the repetition is clear

## Resolution (Implemented)

Implemented Option A with a typed shared helper:

- Added `src/application/shared/enrich-with-question.ts`
  - Handles available/unavailable mapping
  - Emits warning logs for missing referenced questions
- Refactored three use cases to delegate:
  - `src/application/use-cases/get-user-stats.ts`
  - `src/application/use-cases/get-missed-questions.ts`
  - `src/application/use-cases/get-practice-session-review.ts`
- Added dedicated tests:
  - `src/application/shared/enrich-with-question.test.ts`

## Verification

- [x] Single helper handles graceful degradation enrichment
- [x] All three use cases delegate to it
- [x] Warning logs still emitted for missing questions
- [x] Existing test suite passes

## Related

- `src/application/shared/enrich-with-question.ts`
- `src/application/use-cases/get-user-stats.ts`
- `src/application/use-cases/get-missed-questions.ts`
- `src/application/use-cases/get-practice-session-review.ts`
- `src/application/shared/enrich-with-question.test.ts`
- DEBT-087 (archived)
