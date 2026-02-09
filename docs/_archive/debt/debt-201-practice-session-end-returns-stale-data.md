# DEBT-201: Practice Session end() Returns Pre-Read Data Instead of Fresh DB Row

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-08
**Resolved:** 2026-02-09

---

## Description

The `DrizzlePracticeSessionRepository.end()` method reads the session, updates it with `endedAt`, then returns `{ ...existing, endedAt }` using the pre-read `existing` data rather than the freshly-returned `updated` row from `.returning()`.

## Affected Files

| File | Lines | Issue |
|------|-------|-------|
| `src/adapters/repositories/drizzle-practice-session-repository.ts` | 405-444 | Returns `existing` data instead of `updated` row |

## Current Code

```typescript
// Line 405: Read existing session
const existing = await this.findByIdAndUserId(sessionId, userId);

// Line 415-425: Update and get fresh row via .returning()
const [updated] = await this.db.update(...)
  .set({ endedAt })
  .where(...)
  .returning();

// Line 444: Returns pre-read data instead of fresh data
return { ...existing, endedAt };
// Should be: construct from `updated` row
```

## Impact

- If `paramsJson` (which encodes `questionStates`) was concurrently modified between the read at line 405 and the update at line 415 (e.g., an answer was recorded), the returned `questionStates` will be stale
- The `updated` variable already holds the correct, fresh data from the database but is not used in the return value
- In practice, the `endPracticeSession` use case calls `computeSessionStats` on the returned session's `questionStates`, so stale states could produce incorrect accuracy/count in the end-session summary

## Resolution

Construct the return value from the `updated` row instead of `existing`:

```typescript
return mapRowToSession(updated);
```

Or at minimum:

```typescript
return { ...existing, endedAt, questionStates: parseQuestionStates(updated.paramsJson) };
```

## Verification

- [x] `pnpm typecheck && pnpm test --run`
- [x] Repository regression test asserts `end()` returns question state from the updated DB row

## Related

- BUG-118 (question page guards — related practice session flow)
