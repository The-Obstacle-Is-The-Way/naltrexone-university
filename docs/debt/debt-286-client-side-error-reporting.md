# DEBT-286: Client-Side Caught Error Reporting — Complete SPEC-016 Rollout

**Priority:** P2
**Created:** 2026-03-07
**Source:** [AUDIT-011](../audits/audit-011-error-observability-defensive-coding.md), reclassified from BUG-200
**Governing Spec:** [SPEC-016: Observability](../specs/spec-016-observability.md)
**Status:** Open

---

## Context

SPEC-016 established the observability stack:
- **Server-side**: Pino structured logger (injected via `Logger` port) + Sentry auto-capture via `onRequestError`
- **Client-side**: Sentry auto-capture of unhandled exceptions

The server-side story is complete. Every adapter, controller, and webhook handler uses the injected `Logger` port for structured logging, and Sentry captures unhandled request errors.

**The client-side story has a systemic gap.** Sentry is initialized (`sentry.client.config.ts`) and auto-captures unhandled exceptions. But the codebase is well-written — errors are properly `.catch()`-ed everywhere. This means Sentry never sees them. The caught errors go to:
- `console.error` (5 locations)
- Nowhere at all (1 location — bare `catch {}`)

`Sentry.captureException()` is called **zero times** in the entire application code (`app/` and `src/`).

---

## The Gap

SPEC-016's acceptance criteria check:
> [x] Sentry is initialized (client + server) when DSNs are configured

But there is no criterion for:
> [ ] Caught client-side errors are reported to Sentry

The spec shows usage examples for server-side logging (adapters, webhooks, use cases) but has no guidance for client-side error reporting in React hooks and effects.

---

## Affected Locations (6 instances)

All of these are **client-side** React code in `app/`:

| Location | Current Behavior | Impact |
|----------|-----------------|--------|
| `fire-and-forget.ts:1-3` | `console.error('Unhandled async UI action error', error)` | Central handler for ALL `fireAndForget()` calls — question submit, bookmark toggle, session finalization. Zero Sentry visibility. |
| `use-practice-question-bookmarks.ts:52` | `console.error('createBookmarksEffect failed:', ...)` | Bookmark loading failures invisible in production |
| `use-practice-session-tags.ts:25` | `console.error('createTagsEffect failed:', ...)` | Tag loading failures invisible in production |
| `use-question-page-controller.ts:290-296` | Dev-only `console.error`; production: **completely silent** | Session navigation errors 100% invisible in prod |
| `question-page-logic.ts:350` | Bare `catch {}` — error object not even bound | Review hydration errors 100% invisible everywhere |
| `use-quick-practice-status-counts.ts:126` | Routes through `logUnhandledAsyncError` (→ `console.error`) | Status count failures invisible in production |

---

## Why This Is Debt, Not Bugs

These are not broken behavior — the UI gracefully degrades in every case (shows fallback state, hides nav, resets to empty). The code works as designed.

The problem is that **there was never a design** for how caught client errors reach Sentry. Adding `Sentry.captureException()` ad-hoc to each location would create the same kind of inconsistent slop that the `Logger` port pattern prevents on the server side.

---

## Proposed Fix

### Phase 1: Create client-side error reporting utility

```typescript
// app/lib/report-client-error.ts
import * as Sentry from '@sentry/nextjs';

/**
 * Reports a caught error to Sentry (production) and console (development).
 * Client-side counterpart of the server-side Logger port.
 */
export function reportClientError(
  error: unknown,
  context?: { component?: string; action?: string },
): void {
  if (process.env.NODE_ENV === 'development') {
    console.error('[ClientError]', context, error);
  }
  Sentry.captureException(error, {
    tags: {
      component: context?.component,
      action: context?.action,
    },
  });
}
```

### Phase 2: Systematic rollout

Replace all 6 locations with `reportClientError()`:

1. `fire-and-forget.ts` — `logUnhandledAsyncError` calls `reportClientError`
2. `use-practice-question-bookmarks.ts` — `logError` callback calls `reportClientError`
3. `use-practice-session-tags.ts` — `logError` callback calls `reportClientError`
4. `use-question-page-controller.ts` — `.catch()` calls `reportClientError`
5. `question-page-logic.ts` — Bind the error variable, call `reportClientError`
6. `use-quick-practice-status-counts.ts` — already routes through `logUnhandledAsyncError`

### Phase 3: Update SPEC-016

Add acceptance criteria:
- [ ] Client-side caught errors reported via `reportClientError()` → Sentry
- [ ] `reportClientError()` utility exists in `app/lib/`
- [ ] No bare `catch {}` blocks in client code (errors must be bound and reported)
- [ ] No direct `console.error` for error handling (use `reportClientError`)

---

## What This Does NOT Change

- **Server-side logging** — Pino `Logger` port remains the server pattern
- **Server-side error handling** — `handleError()` in `action-result.ts` remains unchanged
- **Sentry initialization** — No changes to `sentry.client.config.ts` or `instrumentation.ts`
- **Error boundaries** — React error boundaries (if any) remain unchanged
- **Domain layer purity** — Zero side effects in `src/domain/`

---

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| T1 | `fireAndForget` promise rejects in production | Error reaches Sentry with `action` tag |
| T2 | Bookmark loading fails | Error reaches Sentry with `component: 'bookmarks'` |
| T3 | Tag loading fails | Error reaches Sentry with `component: 'tags'` |
| T4 | Session navigation fetch fails in production | Error reaches Sentry (currently 100% silent) |
| T5 | Review hydration parsing fails | Error object captured and sent to Sentry |
| T6 | Development environment | `console.error` still fires for dev visibility |
| T7 | No Sentry DSN configured | No crash; `console.error` only |

---

## Relationship to Other Work

- **Orthogonal to DEBT-284** (feedback visual polish) — different layer entirely
- **Orthogonal to BUG-199** (unsafe array access) — defensive coding, not observability
- **Depends on SPEC-016** — extends the spec's client-side coverage
- **DEBT-249** (checkout success auth hardening) — that debt already added server-side instrumentation; this debt completes the client-side counterpart
