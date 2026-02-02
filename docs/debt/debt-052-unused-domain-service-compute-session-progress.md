# DEBT-052: Unused Domain Service — computeSessionProgress

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

The domain service `computeSessionProgress()` in `src/domain/services/session.ts` is fully implemented and tested but never called from any production code. This is dead code that adds confusion.

**Service location:** `src/domain/services/session.ts:13-25`

```typescript
export function computeSessionProgress(session: PracticeSession): SessionProgress {
  const total = session.questionIds.length;
  const answered = session.answeredQuestionIds.length;
  return {
    total,
    answered,
    remaining: total - answered,
    percentComplete: total > 0 ? Math.round((answered / total) * 100) : 0,
  };
}
```

**Test exists:** `src/domain/services/session.test.ts`

## Impact

- Dead code in codebase
- Developers may assume it's used and modify carefully
- Increases cognitive load when reading session-related code
- Related to BUG-020: Practice sessions never started/ended

## Resolution

**Option A: Use it** (if practice sessions are implemented)
1. Fix BUG-020 to implement practice session flow
2. Call `computeSessionProgress()` in practice UI to show progress bar
3. Service becomes useful

**Option B: Remove it** (if filter-based practice is the design choice)
1. Delete `computeSessionProgress` function
2. Delete related tests
3. Document decision in ADR or SPEC-013

## Verification

If keeping:
- [ ] Function called from practice controller or page
- [ ] Progress displayed in UI

If removing:
- [ ] Function deleted
- [ ] Tests deleted
- [ ] No references remain

## Related

- `src/domain/services/session.ts:13-25`
- `src/domain/services/session.test.ts`
- BUG-020: Practice sessions never started/ended
- SPEC-013: Practice Sessions
