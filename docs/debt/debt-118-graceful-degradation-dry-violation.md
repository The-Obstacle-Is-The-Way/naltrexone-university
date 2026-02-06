# DEBT-118: Graceful Degradation Pattern Duplicated in 3 Use Cases

**Status:** Open
**Priority:** P3
**Date:** 2026-02-06

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

## Resolution

### Option A: Extract Helper Function (Recommended)

Create `src/application/shared/enrich-with-question.ts`:

```typescript
function enrichWithQuestion<T, R>(
  rows: T[],
  getQuestionId: (row: T) => string,
  questions: Map<string, Question>,
  enricher: (row: T, question: Question) => R,
  unavailable: (row: T) => R,
  logger?: Logger,
): R[]
```

### Option B: Accept as Acceptable Repetition

Three similar loops of ~25 lines each is borderline. The types differ enough that a generic helper might be over-engineered. Could mark as "Accepted" if the team prefers explicitness over abstraction.

## Verification

- [ ] Single helper handles graceful degradation enrichment
- [ ] All three use cases delegate to it
- [ ] Warning logs still emitted for missing questions
- [ ] Existing test suite passes

## Related

- `src/application/use-cases/get-user-stats.ts:112-141`
- `src/application/use-cases/get-missed-questions.ts:72-97`
- `src/application/use-cases/get-practice-session-review.ts:70-102`
- DEBT-087 (archived — graceful degradation hides data loss, related pattern)
