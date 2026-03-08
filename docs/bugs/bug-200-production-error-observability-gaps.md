# ~~BUG-200~~ → RECLASSIFIED as [DEBT-286](../debt/debt-286-client-side-error-reporting.md)

**Status:** Reclassified (2026-03-07)
**Reason:** These are not independent bugs. They are symptoms of a systemic gap in SPEC-016 (Observability): `Sentry.captureException()` is called zero times in `app/` + `src/` application code, and there is no standard way for caught client-side failures to reach Sentry. Tracer-bullet verification after reclassification also showed that the original 5-location slice below was not exhaustive. DEBT-286 carries the corrected broader inventory and rollout plan.

**See:** [DEBT-286: Client-Side Caught Error Reporting](../debt/debt-286-client-side-error-reporting.md)

---

## Original Problem (preserved for reference)

The original filing captured 5 representative client-side locations that either swallowed errors completely in production or routed them only through `console.error`. That slice was directionally correct but incomplete. DEBT-286 now documents the verified broader picture: additional client-side caught-error flows, plus out-of-scope boundary/dev-only console sites that should not be conflated with this debt.

---

## Instances

### 1. `fire-and-forget.ts:1-3` — Central error handler uses `console.error`

```typescript
export function logUnhandledAsyncError(error: unknown): void {
  console.error('Unhandled async UI action error', error);
}
```

**Impact:** This function is the error handler for **all** `fireAndForget()` calls across the practice flow: question submission, bookmark toggling, session finalization, exam review. Every unhandled async error in the practice UI goes through this single `console.error` call. Zero production visibility.

**Callers:** `practice-page-client.tsx`, `quick-practice-client.tsx`, `practice-session-page-view.tsx`, `exam-review-view.tsx`, `use-quick-practice-status-counts.ts`, `use-practice-available-questions-count.ts`

### 2. `use-practice-question-bookmarks.ts:52` — Bookmark failures

```typescript
logError: (message: string, context: unknown) => {
  console.error('createBookmarksEffect failed:', message, context);
},
```

**Impact:** Bookmark loading failures are invisible in production. Users see bookmarks not loading but developers cannot detect or measure the failure rate.

### 3. `use-practice-session-tags.ts:25` — Tag loading failures

```typescript
logError: (message: string, context: unknown) => {
  console.error('createTagsEffect failed:', message, context);
},
```

**Impact:** Same pattern as bookmarks. Tag loading failures are invisible in production.

### 4. `use-question-page-controller.ts:290-296` — Session navigation errors

```typescript
.catch((error: unknown) => {
  if (isStale || !isMounted()) return;
  if (process.env.NODE_ENV === 'development') {
    console.error('[SessionNavigation] Review fetch threw:', error);
  }
  setSessionNavigation(null);
});
```

**Impact:** In production, the error is **completely swallowed** — not even `console.error`. The UI silently degrades (no session navigation shown) with zero diagnostic information. This is the worst instance because there is literally no error output in production.

### 5. `question-page-logic.ts:350` — Review hydration error discarded

```typescript
} catch {
  if (!isMounted() || isStale()) return;
  setReviewHydrationState('hydration_error');
  return;
}
```

**Impact:** The `catch` block has no error variable binding — the error object is discarded entirely. The user sees "Could not load your previous answer" but there is no way to determine what failed. If a systematic parsing bug exists, it will go undetected. (Note: BUG-167 previously fixed the missing `isMounted()` guard inside this catch. The error discarding is a separate issue.)

---

## Root Cause

Client-side code lacks a unified error reporting mechanism. The server-side codebase has a proper `Logger` abstraction injected via constructor, but client-side hooks and effects use ad-hoc `console.error` calls or nothing at all.

---

## Proposed Fix

### Option A: Add error binding + `console.error` everywhere (minimal)

Ensure all catch blocks at least bind the error and log it. This doesn't add structured logging but eliminates completely silent failures.

### Option B: Client-side error reporting utility (proper)

Create a lightweight client-side error reporter that:
1. Always calls `console.error` (for dev)
2. Could be extended to send to an error tracking service (Sentry, etc.) in the future
3. Accepts structured context (component name, action, error)

Replace all `console.error` calls and bare catches with this utility.

---

## Test Plan

| # | Scenario | Expected |
|---|----------|----------|
| T1 | `fireAndForget` promise rejects | Error logged (not just console.error) |
| T2 | Bookmark loading fails in production | Error observable (not silent) |
| T3 | Tag loading fails in production | Error observable (not silent) |
| T4 | Session navigation fetch fails in production | Error logged (currently completely silent) |
| T5 | Review hydration parsing fails | Error object captured and logged |
