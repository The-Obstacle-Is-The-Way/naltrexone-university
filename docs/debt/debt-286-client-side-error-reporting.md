# DEBT-286: Client-Side Caught Error Reporting — Complete SPEC-016 Rollout

**Priority:** P2
**Created:** 2026-03-07
**Source:** [AUDIT-011](../audits/audit-011-error-observability-defensive-coding.md), reclassified from BUG-200
**Governing Spec:** [SPEC-016: Observability](../specs/spec-016-observability.md)
**Status:** Open

---

## Context

SPEC-016 established the observability foundation:

- **Server-side:** structured logging plus Sentry request-error capture
- **Client-side:** Sentry initialization in the browser

That foundation exists. But tracer-bullet verification showed the client-side rollout is incomplete: caught client failures still do not have a standard path into Sentry.

This debt is specifically about **caught client-side operational failures** in hooks, effects, and async UI helpers. It is **not** a claim that every server-side telemetry concern is solved forever. A repo-wide sweep still found a direct server-side `console.info` in `app/(app)/app/questions/[slug]/page.tsx`, but that is a separate observability consistency issue, not this debt.

---

## Repo-Wide Verification

Full sweep of `app/` + `src/` production code, excluding tests/specs:

- `Sentry.captureException()` calls: **0**
- `Sentry.captureMessage()` calls: **0**
- `console.error(...)` calls: **7**
- `console.warn(...)` calls: **2**
- `console.log(...)` calls: **0**
- bare `catch {}` blocks in client files: **2**
- bare `catch {}` blocks in server/application files: **4**

Not every console site belongs in this debt:

- `app/global-error.tsx` is an error-boundary path
- `components/error-boundary-page.tsx` is the shared route-error boundary path used by multiple `error.tsx` routes
- `question-flow-actions.ts` and one `use-question-page-controller.ts` warning are development-only diagnostics
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

| Location | Current Behavior | Impact |
|----------|------------------|--------|
| `fire-and-forget.ts:1-13` | Central async UI error handler logs to `console.error` | Affects fire-and-forget practice flows such as submit, bookmark toggle, session finalization, and exam-review actions |
| `use-practice-question-bookmarks.ts:52` | `console.error('createBookmarksEffect failed:', ...)` | Bookmark load failures are invisible to Sentry |
| `use-practice-session-tags.ts:25` | `console.error('createTagsEffect failed:', ...)` | Tag load failures are invisible to Sentry |
| `use-question-page-controller.ts:249-295` | Development-only console output; production falls back silently | Session navigation fetch failures are invisible in production |
| `question-page-logic.ts:350` | Bare `catch {}` with fallback UI only | Review hydration failures are invisible everywhere |
| `use-quick-practice-status-counts.ts:125-126` | Routes caught effect errors through `logUnhandledAsyncError()` | Quick-practice status count failures reach console only |
| `use-practice-available-questions-count.ts:40-41` | Routes caught effect errors through `logUnhandledAsyncError()` | Available-count failures reach console only |

---

## Related But Out of Scope

Tracer-bullet verification also found these observability-adjacent sites. They should stay visible in the debt discussion so we do not overstate completeness, but they are not the core DEBT-286 rollout targets:

- `app/global-error.tsx:16` logs an already-bubbled boundary error
- `components/error-boundary-page.tsx:33` logs already-bubbled route-boundary errors for shared `error.tsx` pages
- `app/(app)/app/practice/shared/question-flow-actions.ts:142` logs only in development
- `app/(app)/app/questions/[slug]/question-page-client.tsx:56` uses a bare catch for URL normalization
- `app/(app)/app/questions/[slug]/page.tsx:65` uses direct server-side `console.info`

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
2. `use-practice-question-bookmarks.ts`
3. `use-practice-session-tags.ts`
4. `use-question-page-controller.ts`
5. `question-page-logic.ts`
6. `use-quick-practice-status-counts.ts`
7. `use-practice-available-questions-count.ts`

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
