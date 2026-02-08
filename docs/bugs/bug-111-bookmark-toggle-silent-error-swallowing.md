# BUG-111: Bookmark Toggle Silently Swallows Errors

**Status:** Open
**Priority:** P2
**Date:** 2026-02-08

---

## Description

`toggleBookmark()` in `practice-page-logic.ts` uses a bare `catch {}` block that discards the error object entirely. When the server action throws (network failure, 500, timeout), the error is lost — no logging, no telemetry, no diagnostic information is preserved. The UI does transition to an `'error'` bookmark status, but the _cause_ of the failure is permanently gone.

**Observed:** Bookmark toggle fails silently. The user sees a generic error state but operators have zero visibility into what went wrong. No log entry, no error object, no stack trace.

**Expected:** The error object should be captured (even if only logged client-side via `console.error`) so that failures are observable. In production, this means bookmark failures are invisible in any monitoring/logging system.

## Steps to Reproduce

1. Start a practice session and load a question
2. Trigger a network failure or server error (e.g., disconnect network, or have the server action throw)
3. Click the bookmark toggle button
4. Observe: UI shows error state, but no error is logged anywhere

## Root Cause

**File:** `app/(app)/app/practice/practice-page-logic.ts:219-222`

```typescript
} catch {
  if (!isMounted()) return;
  input.setBookmarkStatus('error');
  return;
}
```

The `catch` clause has no parameter — the error object is never captured. Compare with other catch blocks in the same codebase that properly capture and log errors (e.g., `submit-answer.ts` catches and rethrows, webhook handlers log via `container.logger.error`).

This is a bare catch anti-pattern: the error is created, thrown, caught, and immediately garbage-collected with zero observability.

## Impact

- **Zero observability** — if bookmark toggles start failing in production (e.g., database connection issues, rate limiting, auth failures), operators will not know unless users manually report it
- **Debugging difficulty** — when users report "bookmarks don't work," there's no error trail to investigate
- **Silent data loss** — the error may contain actionable information (e.g., `CONFLICT` from idempotency, `UNAUTHORIZED` from expired session) that would inform the correct recovery strategy

## Fix

Capture the error object and log it. The function already receives `input` which could carry a logger, or at minimum use `console.error` for client-side observability:

```typescript
} catch (error) {
  if (!isMounted()) return;
  console.error('Bookmark toggle failed:', error);
  input.setBookmarkStatus('error');
  return;
}
```

A more robust fix would thread a logger through the input parameter, consistent with the project's `Logger` port pattern.

## Verification

- [ ] `catch` block captures the error object
- [ ] Error is logged (at minimum `console.error`, ideally via a logger)
- [ ] Bookmark still transitions to `'error'` status on failure
- [ ] Unit test verifies error is logged when toggle throws
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run` passes

## Related

- `app/(app)/app/practice/practice-page-logic.ts` — `toggleBookmark()` function
- BUG-112 — same bare-catch pattern in navigator fetch
- BUG-096 — bookmark toggle idempotency key (resolved)
