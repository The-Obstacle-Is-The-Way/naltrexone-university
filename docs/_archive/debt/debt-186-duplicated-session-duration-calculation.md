# DEBT-186: Duplicated Session Duration Calculation

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

Two use cases independently compute session duration with identical logic:

```typescript
const durationSeconds = Math.max(
  0,
  Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000),
);
```

### Affected Files

| File | Line |
|------|------|
| `src/application/use-cases/end-practice-session.ts` | 46 |
| `src/application/use-cases/get-session-history.ts` | 60 |

## Impact

- Duration logic changes require updating both files
- Risk of drift between the two implementations
- Violates DRY principle

## Resolution

Extract to a domain service function alongside DEBT-185:

```typescript
// src/domain/services/session.ts
export function computeSessionDurationSeconds(startedAt: Date, endedAt: Date): number {
  return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
}
```

## Verification

- [x] Both use cases use the shared function
- [x] No inline duration calculation remains
- [x] `pnpm typecheck && pnpm lint && pnpm test --run` passes

## Related

- DEBT-185 (session stats duplication) — can be resolved together
