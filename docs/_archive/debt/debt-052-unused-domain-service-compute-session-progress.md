# DEBT-052: Unused Domain Service — computeSessionProgress

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Description

The domain service `computeSessionProgress()` was implemented and tested but was not called from production code, which made it look like dead code.

**Service location:** `src/domain/services/session.ts`

```typescript
export function computeSessionProgress(
  session: PracticeSession,
  attemptCount: number,
): SessionProgress {
  const total = session.questionIds.length;
  const safeAttemptCount = Math.max(0, attemptCount);

  return {
    current: Math.min(safeAttemptCount, total),
    total,
    isComplete: safeAttemptCount >= total,
  };
}
```

**Test exists:** `src/domain/services/session.test.ts`

## Impact

Unused code increases cognitive load and makes it harder to tell what is real, relied-upon behavior vs leftover experiments.

## Resolution

Use the domain service to compute the session `index` and `total` returned from the session-based next-question flow:

- `src/application/use-cases/get-next-question.ts` calls `computeSessionProgress(session, answeredCount)` and returns `NextQuestion.session.index` and `NextQuestion.session.total` from that result.

## Verification

- [x] Unit tests: `src/application/use-cases/get-next-question.test.ts` continues to pass.
- [x] Domain tests: `src/domain/services/session.test.ts` continues to pass.

## Related

- `src/domain/services/session.ts`
- `src/domain/services/session.test.ts`
- `src/application/use-cases/get-next-question.ts`
