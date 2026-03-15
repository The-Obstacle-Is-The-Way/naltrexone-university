# DEBT-286: Client-Side Caught Error Reporting — Complete SPEC-016 Rollout

**Priority:** P2
**Created:** 2026-03-07
**Updated:** 2026-03-15
**Source:** [AUDIT-011](../audits/audit-011-error-observability-defensive-coding.md), reclassified from BUG-200
**Governing Spec:** [SPEC-016: Observability](../specs/spec-016-observability.md)
**Status:** Resolved (branch: `feat/debt-286-client-error-reporting`)

---

## Context

SPEC-016 established the observability foundation:

- **Server-side:** structured logging plus Sentry request-error capture
- **Client-side:** Sentry initialization in the browser

That foundation existed, but tracer-bullet verification showed the client-side rollout was incomplete: caught client failures still did not have a standard path into Sentry.

This debt is specifically about **caught client-side operational failures** in hooks, effects, and async UI helpers. It is **not** a claim that every server-side telemetry concern is solved forever. A repo-wide sweep still found a direct server-side `console.info` in `app/(app)/app/questions/[slug]/page.tsx`, but that is a separate observability consistency issue, not this debt.

## Resolution

Implemented on 2026-03-15:

- Added `lib/report-client-error.ts` as the shared client-side reporting utility.
- Added `shouldReportClientError()` so expected `ActionResult` business errors remain UI/data paths instead of noisy Sentry events.
- Wired every rollout target in this debt, including the helper/reporting seams added after the original audit.
- Kept only documented exceptions: route/global error-boundary logging, server/config console sites, the explicit defense-in-depth `console.error` fallback in `question-flow-actions.ts`, and the URL-normalization catch in `question-page-client.tsx`.

---

## Repo-Wide Verification

Full sweep of `app/` + `src/` production code, excluding tests/specs.

> **Post-implementation snapshot (2026-03-15).** Direct `Sentry.captureException()` / `Sentry.captureMessage()` calls remain centralized outside `app/` + `src/`; unexpected caught client-side operational failures in the audited rollout now flow through `lib/report-client-error.ts`.

- `Sentry.captureException()` calls: **0**
- `Sentry.captureMessage()` calls: **0**
- direct `console.error(...)` calls: **2**
- direct `console.warn(...)` calls: **1**
- `console.info(...)` calls: **1**
- bare `catch {}` blocks in `app/` + `src/`: **9** total; remaining client-bundled catches are reporter guards, URL parsing, or explicit fallback preservation
- `reportClientError()` utility: **exists** in `lib/report-client-error.ts`

Not every console site belongs in this debt:

- `app/global-error.tsx` is an error-boundary path
- `components/error-boundary-page.tsx` is the shared route-error boundary path used by multiple `error.tsx` routes
- `question-flow-actions.ts` still logs unconditionally after BUG-214, but its `onUnhandledError` extension point is now wired from the real caller paths that can reject
- `use-question-page-controller.ts` still emits a development-only normalization warning for mixed review params
- `question-page-client.tsx` uses a bare catch for URL normalization, not an unexpected operational failure

The actual gap was narrower and more important: **caught client-side failures that affected real user flows did not reach Sentry before this rollout.**

---

## The Original Gap

SPEC-016 originally said error tracking exists on both client and server, but its acceptance criteria stopped at initialization:

> [x] Sentry is initialized (client + server) when DSNs are configured

At audit time, there was no acceptance criterion and no canonical pattern for:

> [ ] Unexpected caught client-side operational errors are reported to Sentry

At the time of the audit, the codebase relied on a mix of:

- `console.error`
- development-only `console.warn` / `console.error`
- silent fallback state

instead of a unified client-side reporting utility.

---

## Priority Rollout Targets

These were the verified user-facing client flows that required migration onto a shared `reportClientError()` utility. The list below is the priority inventory that drove the rollout, not a claim that these were the only console sites in the repo.

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

All items in the table above were completed in the 2026-03-15 rollout. `question-flow-actions.ts` was resolved by wiring `onUnhandledError` from callers while retaining its unconditional `console.error` as a last-resort fallback.

---

## Audit Corrections (2026-03-15)

Two tracer-bullet corrections matter before implementation:

1. `createAction()` catches controller/use-case/repository throws and converts them into `ActionResult` failures via `handleError()`. Most server-side operational failures therefore do **not** reject the client promise; they arrive as `!res.ok` UI-state paths. `fireAndForget()` and `runTransitionedAsyncAction()` only observe transport/client rejections plus truly uncaught client bugs.
2. The original 10-row rollout list was not exhaustive at the helper layer. The current codebase has additional client-bundled catch sites that set fallback UI state without Sentry reporting.

Missing-from-inventory helper/reporting seams confirmed by the 2026-03-15 audit:

- `app/(app)/app/practice/practice-page-logic.ts` — bookmark-toggle `logError` seam plus reporter-guard catches
- `app/(app)/app/practice/practice-page-session-start.ts` — session-start `reportError` seam plus reporter-guard catch
- `app/(app)/app/practice/practice-page-incomplete-session.ts` — incomplete-session load/abandon failures set UI error only
- `app/(app)/app/practice/[sessionId]/practice-session-page-logic.ts` — end-session, navigator, and summary-review failures set UI error only
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage-state.ts` — review-load/finalize failures set UI error only
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-mark-for-review.ts` — mark-for-review failures set UI error only
- `app/(app)/app/history/hooks/use-history-sessions.ts` — history-session review fetch failures set UI error only
- `app/(app)/app/questions/[slug]/question-page-logic.ts` — question-load and answer-submit failures set UI error only, in addition to the existing review-hydration catch

All of the helper/reporting seams above were included in the final rollout and no longer remain open inventory gaps.

Path correction:

- The shared reporter should live in `lib/report-client-error.ts`, not `app/lib/...`, to match the existing client-safe utility layout (`lib/use-is-mounted.ts`, `lib/with-timeout.ts`, etc.).

Scope correction:

- Route/global error boundaries remain observability-adjacent cleanup, but they are not part of the core rollout table below unless SPEC-016 is explicitly expanded to include them.

---

## Incidental Finding: `logUnhandledAsyncError` Signature Mismatch

> **Found during 2026-03-15 path audit.**

`fire-and-forget.ts` exports `logUnhandledAsyncError(error: unknown)`, but two callers pass `{ message, context }` instead of a raw error:

- `use-quick-practice-status-counts.ts:141` → `logUnhandledAsyncError({ message, context })`
- `use-practice-available-questions-count.ts:41` → `logUnhandledAsyncError({ message, context })`

This was not a crash (the object was logged), but the structured `{ message, context }` shape was lost inside a generic "Unhandled async UI action error" console line. The `reportClientError()` rollout fixed this by replacing these call sites with the properly typed utility.

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

## Implemented Fix

### Phase 1: Add a client-side reporting utility

```typescript
// lib/report-client-error.ts
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
2. `practice-page-logic.ts` + `use-practice-question-bookmarks.ts` (BUG-212 bookmark-toggle reporter seam + bookmark load effect)
3. `practice-page-session-start.ts` + `use-practice-session-start.ts` (BUG-213 session-start reporter seam)
4. `practice-page-incomplete-session.ts`
5. `practice/[sessionId]/practice-session-page-logic.ts`
6. `use-practice-session-review-stage-state.ts`
7. `use-practice-session-mark-for-review.ts`
8. `use-history-sessions.ts`
9. `use-question-page-controller.ts`
10. `question-page-logic.ts`
11. `use-quick-practice-status-counts.ts`
12. `use-practice-available-questions-count.ts`
13. `use-practice-session-tags.ts`
14. `question-flow-actions.ts` (BUG-214 `onUnhandledError` hook — wire `reportClientError()` from callers where actual rejections can escape)

### Phase 3: Update SPEC-016

Implemented acceptance criteria:

- [x] Caught client-side operational failures are reported via `reportClientError()`
- [x] `reportClientError()` exists in `lib/`
- [x] Helper-level catch sites that currently convert thrown/rejected server-action calls into fallback UI state are routed through `reportClientError()` or explicitly justified
- [x] Direct client-side error reporting uses `reportClientError()` unless a fallback/error-boundary path is explicitly retained and documented
- [x] Bare `catch {}` blocks that swallow unexpected client-side operational failures are eliminated or explicitly justified

---

## What This Does NOT Change

- Server-side logger abstractions
- `handleError()` in server action results
- Sentry initialization files
- React error-boundary behavior
- Domain-layer purity

Expected `ActionResult` business errors such as `VALIDATION_ERROR`, `UNAUTHENTICATED`, `UNSUBSCRIBED`, and `RATE_LIMITED` still remain UI/data-handling paths. The rollout is for unexpected operational failures that would otherwise disappear into console-only or silent fallback branches.

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

Add parity coverage for the newly audited silent-catch flows:

- incomplete-session load + abandon
- practice-session end/navigator/summary-review
- session-review load/finalize + mark-for-review
- history-session review fetch
- standalone question load + submit

---

## Relationship to Other Work

- **Extends SPEC-016** rather than replacing it
- **Reclassified from BUG-200** because the root cause is systemic
- **Orthogonal to BUG-202** and other clarity-only defensive findings
- **Separate from direct server-side console cleanup** such as `page.tsx:65`
