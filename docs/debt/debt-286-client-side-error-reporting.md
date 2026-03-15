# DEBT-286: Client-Side Caught Error Reporting — Complete SPEC-016 Rollout

**Priority:** P2
**Created:** 2026-03-07
**Updated:** 2026-03-15
**Source:** [AUDIT-011](../audits/audit-011-error-observability-defensive-coding.md), reclassified from BUG-200
**Governing Spec:** [SPEC-016: Observability](../specs/spec-016-observability.md)
**Status:** In Progress (branch: `feat/debt-286-client-error-reporting`)

---

## Context

SPEC-016 established the observability foundation:

- **Server-side:** structured logging plus Sentry request-error capture
- **Client-side:** Sentry initialization in the browser

That foundation exists. But tracer-bullet verification showed the client-side rollout is incomplete: caught client failures still do not have a standard path into Sentry.

This debt is specifically about **caught client-side operational failures** in hooks, effects, and async UI helpers. It is **not** a claim that every server-side telemetry concern is solved forever. A repo-wide sweep still found a direct server-side `console.info` in `app/(app)/app/questions/[slug]/page.tsx`, but that is a separate observability consistency issue, not this debt.

---

## Repo-Wide Verification

Full sweep of `app/` + `src/` production code, excluding tests/specs.

> **Re-verified 2026-03-15.** Counts unchanged; all Sentry DSNs confirmed set in Vercel (Production, Preview, Development) and `.env.local`.

- `Sentry.captureException()` calls: **0**
- `Sentry.captureMessage()` calls: **0**
- `console.error(...)` calls: **9**
- `console.warn(...)` calls: **2**
- `console.log(...)` calls: **0**
- bare `catch {}` blocks in client files: **2**
- bare `catch {}` blocks in server/application files: **5**

Not every console site belongs in this debt:

- `app/global-error.tsx` is an error-boundary path
- `components/error-boundary-page.tsx` is the shared route-error boundary path used by multiple `error.tsx` routes
- `question-flow-actions.ts` now logs unconditionally after BUG-214; it remains a console-only fallback plus an unwired `onUnhandledError` extension point
- `question-page-client.tsx` uses a bare catch for URL normalization, not an unexpected operational failure

The actual gap is narrower and more important: **caught client-side failures that affect real user flows still do not reach Sentry.**

---

## The Gap

SPEC-016 says error tracking exists on both client and server, but its acceptance criteria stop at initialization:

> [x] Sentry is initialized (client + server) when DSNs are configured

There is no acceptance criterion and no canonical pattern for:

> [ ] Unexpected caught client-side operational errors are reported to Sentry

So the codebase currently relies on a mix of:

- `console.error`
- development-only `console.warn` / `console.error`
- silent fallback state

instead of a unified client-side reporting utility.

---

## Priority Rollout Targets

These are the verified user-facing client flows that should be moved onto a shared `reportClientError()` utility. The list below is the current priority inventory, not a claim that these are the only console sites in the repo.

> **Path update (2026-03-15):** Practice hooks moved from `shared/hooks/` to `hooks/`. Question-page files live under `app/(app)/app/questions/[slug]/`. Paths below reflect current codebase.

| # | File (current path) | Current Behavior | Impact |
|---|----------|------------------|--------|
| 1 | `app/(app)/app/practice/fire-and-forget.ts` | Central async UI error handler logs to `console.error` | Affects fire-and-forget practice flows such as submit, bookmark toggle, session finalization, and exam-review actions |
| 2 | `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts:51-52` | `console.error('createBookmarksEffect failed:', ...)` | Bookmark load failures are invisible to Sentry |
| 3 | `app/(app)/app/practice/hooks/use-practice-session-tags.ts:24-26` | `console.error('createTagsEffect failed:', ...)` | Tag load failures are invisible to Sentry |
| 4 | `app/(app)/app/questions/[slug]/use-question-page-controller.ts` | Development-only console output for mixed-review-param normalization and session-navigation fetch failures; production falls back silently | Session navigation fetch failures are invisible in production |
| 5 | `app/(app)/app/questions/[slug]/question-page-logic.ts:350` | Bare `catch {}` with fallback UI only | Review hydration failures are invisible everywhere |
| 6 | `app/(app)/app/practice/hooks/use-quick-practice-status-counts.ts:140-142` | Routes caught effect errors through `logUnhandledAsyncError()` | Quick-practice status count failures reach console only |
| 7 | `app/(app)/app/practice/hooks/use-practice-available-questions-count.ts:40-42` | Routes caught effect errors through `logUnhandledAsyncError()` | Available-count failures reach console only |
| 8 | `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts:100` | `console.error('toggleBookmarkForQuestion failed:', ...)` (BUG-212 fix) | Bookmark toggle failures reach console only |
| 9 | `app/(app)/app/practice/hooks/use-practice-session-start.ts:132-134` | `console.error('startSession failed:', ...)` (BUG-213 fix) | Session start thrown errors reach console only |
| 10 | `app/(app)/app/practice/shared/question-flow-actions.ts:147-150` | `onUnhandledError?.()` hook (BUG-214 fix) — unwired by callers; `console.error` fires unconditionally | Hook ready for direct `reportClientError()` wiring |

---

## Incidental Finding: `logUnhandledAsyncError` Signature Mismatch

> **Found during 2026-03-15 path audit.**

`fire-and-forget.ts` exports `logUnhandledAsyncError(error: unknown)`, but two callers pass `{ message, context }` instead of a raw error:

- `use-quick-practice-status-counts.ts:141` → `logUnhandledAsyncError({ message, context })`
- `use-practice-available-questions-count.ts:41` → `logUnhandledAsyncError({ message, context })`

This is not a crash (the object is logged), but the structured `{ message, context }` shape is lost inside a generic "Unhandled async UI action error" console line. The `reportClientError()` rollout will fix this naturally by replacing these call sites with the properly typed utility.

---

## Related But Out of Scope

Tracer-bullet verification also found these observability-adjacent sites. They should stay visible in the debt discussion so we do not overstate completeness, but they are not the core DEBT-286 rollout targets:

- `app/global-error.tsx:16` logs an already-bubbled boundary error
- `components/error-boundary-page.tsx:33` logs already-bubbled route-boundary errors for shared `error.tsx` pages
- `app/(app)/app/practice/shared/question-flow-actions.ts` logs unconditionally after BUG-214 fix (previously dev-only); `onUnhandledError` hook is available for direct Sentry wiring
- `app/(app)/app/questions/[slug]/question-page-client.tsx` uses a bare catch for URL normalization
- `app/(app)/app/questions/[slug]/page.tsx` uses direct server-side `console.info`

---

## Why This Is Debt, Not Bugs

These flows are not broken functionally. The UI degrades gracefully:

- counts reset
- navigation disappears
- bookmarks/tags show fallback state
- review hydration moves to an error state

The missing piece is architecture: there is no standard client-side counterpart to the server-side observability pattern. Fixing each site ad hoc would create the same fragmented reporting pattern that the server-side logger abstractions were designed to avoid.

---

## Proposed Fix

### Phase 1: Add a client-side reporting utility

```typescript
// app/lib/report-client-error.ts
import * as Sentry from '@sentry/nextjs';

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

### Phase 2: Roll out to the priority client flows

1. `fire-and-forget.ts`
2. `use-practice-question-bookmarks.ts` (includes BUG-212 `logError` callback + bookmark load effect)
3. `use-practice-session-tags.ts`
4. `use-question-page-controller.ts`
5. `question-page-logic.ts`
6. `use-quick-practice-status-counts.ts`
7. `use-practice-available-questions-count.ts`
8. `use-practice-session-start.ts` (BUG-213 `reportError` callback)
9. `question-flow-actions.ts` (BUG-214 `onUnhandledError` hook — wire `reportClientError()` from callers)

### Phase 3: Update SPEC-016

Add acceptance criteria such as:

- [ ] Caught client-side operational failures are reported via `reportClientError()`
- [ ] `reportClientError()` exists in `app/lib/`
- [ ] Direct client-side error reporting does not use raw `console.error` in production paths
- [ ] Bare `catch {}` blocks that swallow unexpected client-side operational failures are eliminated or explicitly justified

---

## What This Does NOT Change

- Server-side logger abstractions
- `handleError()` in server action results
- Sentry initialization files
- React error-boundary behavior
- Domain-layer purity

---

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| T1 | `fireAndForget` promise rejects | Error reaches Sentry with useful context |
| T2 | Bookmark loading fails | Error reaches Sentry |
| T3 | Tag loading fails | Error reaches Sentry |
| T4 | Session navigation fetch fails in production | Error reaches Sentry instead of being silently swallowed |
| T5 | Review hydration parsing/fetch fails | Bound error is reported before fallback UI |
| T6 | Quick-practice status counts fail | Error reaches Sentry |
| T7 | Available question count fails | Error reaches Sentry |
| T8 | Development environment | Console output still exists for local debugging |
| T9 | No Sentry DSN configured | No crash; development console output still works |

---

## Relationship to Other Work

- **Extends SPEC-016** rather than replacing it
- **Reclassified from BUG-200** because the root cause is systemic
- **Orthogonal to BUG-202** and other clarity-only defensive findings
- **Separate from direct server-side console cleanup** such as `page.tsx:65`
