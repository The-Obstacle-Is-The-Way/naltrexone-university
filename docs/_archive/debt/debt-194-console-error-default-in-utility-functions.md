# DEBT-194: Default console.error in Utility Function Parameters

**Status:** Resolved
**Priority:** P4
**Date:** 2026-02-08

---

## Description

Three utility functions accept a `logError` callback parameter that defaults to `console.error`. This means production code silently falls back to bare console output when callers don't inject a structured logger, bypassing the observability pipeline.

## Affected Files

| File | Default Pattern |
|------|----------------|
| `app/(app)/app/practice/fire-and-forget.ts` | `onError` parameter defaults to `logUnhandledAsyncError` which wraps `console.error` (line 7) |
| `app/(app)/app/practice/practice-page-bookmarks.ts` | Optional `logError` param, falls back via `??` to inline `console.error` wrapper (line 30-34) |
| `app/(app)/app/practice/practice-page-tags.ts` | Optional `logError` param, falls back via `??` to inline `console.error` wrapper (line 10-14) |

## Impact

- Low: These defaults only execute if a caller omits the `logError` parameter, which is unlikely in production code paths (hooks inject `console.error` explicitly)
- If a caller forgets to inject a logger, errors are logged but not captured by structured logging/Sentry
- Inconsistent with DEBT-183 resolution (which removed bare `console.error` from client hooks)

## Resolution

Options:
1. **Remove defaults** — make `logError` required so callers must explicitly inject it
2. **No-op default** — default to `() => {}` and let the caller decide (risks silent swallowing)
3. **Accept as-is** — `console.error` is a reasonable last resort for client-side code where no structured logger exists

Option 1 is cleanest. The functions are called from hooks that already inject the callback.

## Verification

- `pnpm typecheck` — all callers provide the argument
- `pnpm test --run` — existing tests pass

## Related

- DEBT-183 (resolved — bare console.error in client hooks)
- DEBT-095 (resolved — console.error in production code)
