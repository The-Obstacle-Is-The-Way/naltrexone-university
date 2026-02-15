# SPEC-029: Dev Environment Resilience — Client-Side Timeouts, Platform Limits, and Observable Failures

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Ready
**Layer:** Infrastructure
**Date:** 2026-02-15
**Brainstorming:** [BS-017](../brainstorming/bs-017-dev-environment-resilience.md)

---

## Overview

Two AI agent sessions hung indefinitely when server actions returned no response during Playwright E2E runs. Investigation (BS-017) identified six gaps in failure observability. This spec implements all six fixes, prioritized by impact.

The root cause: the codebase has no client-side timeout on server action calls. When a server action hangs, the UI waits forever — error boundaries don't help (they only catch render errors, not promises that never settle), and `AbortController` [cannot abort Next.js server actions](https://github.com/vercel/next.js/issues/81418).

---

## Requirements

### Functional

1. **Client-side timeout utility** (`lib/with-timeout.ts`) — `Promise.race`-based wrapper that rejects with `TimeoutError` after a configurable duration
2. **`maxDuration` on key routes** — explicit Vercel function timeout limits instead of implicit platform defaults
3. **Session navigation error observability** — dev-mode `console.warn` when session review fetch fails, plus `.catch()` for uncaught throws
4. **Database idle timeout** — `idle_timeout: 20` in `lib/db.ts` to close stale idle connections faster
5. **Health check GET handler** — add GET export to `/api/health` so Playwright can poll it
6. **Playwright config update** — point `webServer.url` at the health endpoint for DB-aware readiness

### Non-Functional

- Zero breaking changes to existing behavior
- No new runtime dependencies
- Client-side timeout does NOT cancel the server action — it only unblocks the UI (the server action runs to completion or platform kill)
- All changes are backward-compatible with both local dev and Vercel deployment

---

## Design

### Fix 1: `lib/with-timeout.ts` (HIGH)

A lib-level utility. Per Clean Architecture, the timeout wrapping happens in the **presentation layer** (hooks), not in controllers or use cases. The `createAction` wrapper is not modified.

#### Interface

```typescript
// lib/with-timeout.ts

export class TimeoutError extends Error {
  readonly ms: number;
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.ms = ms;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>;
```

#### Timeout Values

| Call Site | Timeout | Rationale |
|-----------|---------|-----------|
| Question loading (`getQuestionBySlug`) | 15 000 ms | Covers Neon cold start (~750ms) + query + network. 30s `connect_timeout` is server-side; client should give up sooner. |
| Answer submission (`submitAnswer`) | 15 000 ms | Write operation, same reasoning. |
| Session review fetch (`getPracticeSessionReview`) | 10 000 ms | Supplementary UI — acceptable to fail faster. |
| Previous attempt fetch (`getPreviousAttempt`) | 10 000 ms | Review-mode convenience data. |

These are **initial values**. They can be tuned based on production telemetry.

#### Implementation

```typescript
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
```

#### Where to Apply

Wrap server action calls in the hooks/logic files that invoke them, NOT inside `createAction`:

- `app/(app)/app/questions/[slug]/question-page-logic.ts` — `getQuestionBySlug`, `submitAnswer`, `getPreviousAttempt`
- `app/(app)/app/questions/[slug]/use-question-page-controller.ts` — `getPracticeSessionReview`

#### How `TimeoutError` Surfaces

When a `TimeoutError` is caught in the presentation layer:
- **Question loading:** The existing `loadState` FSM transitions to `{ status: 'error', message: 'Request timed out. Please try again.' }` with the existing "Try Again" button
- **Answer submission:** Same — transitions to error state with retry affordance
- **Session navigation:** Already degrades gracefully (sets navigation to `null`) — now also logs in dev
- **Previous attempt:** Falls through to no-op (review mode just shows the question without prior attempt data)

No new UI components needed — the existing error states and try-again flows handle `TimeoutError` the same as any other failure.

### Fix 2: `maxDuration` Exports (MEDIUM)

Add `export const maxDuration` to key route files:

| Route File | `maxDuration` | Rationale |
|------------|---------------|-----------|
| `app/(app)/app/questions/[slug]/page.tsx` | 30 | Server actions on question pages (load, submit, review) |
| `app/api/cron/reconcile-stripe-subscriptions/route.ts` | 60 | Long-running reconciliation job |
| `app/api/stripe/webhook/route.ts` | 30 | Webhook processing |
| `app/api/webhooks/clerk/route.ts` | 30 | Webhook processing |
| `app/api/health/route.ts` | 10 | Health check should be fast |

Per [Next.js docs](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config), `maxDuration` on a page applies to all server actions invoked from that page. For route handlers, it applies to the handler itself.

### Fix 3: Session Navigation Error Observability (LOW)

In `use-question-page-controller.ts`, add:
1. `console.warn` inside the `if (!result.ok)` branch (dev only)
2. `.catch()` handler for uncaught throws (dev `console.error` + set navigation to `null`)

This matches the pattern already used by `runTransitionedAsyncAction` in `question-flow-actions.ts:106-115`.

### Fix 4: `idle_timeout` in DB Config (LOW)

Add `idle_timeout: 20` to the postgres connection options in `lib/db.ts`. This closes idle connections after 20 seconds, reducing the window for stale connection issues (especially during dev where the server may sit idle between work sessions).

**What NOT to change:** `connect_timeout` (30s default is good), `max_lifetime` (random 30-60 min is optimal), `max` (10 is appropriate for serverless), `keep_alive` (60s default is standard).

### Fix 5: Health Check GET Handler (LOW)

Add a `GET` export to `app/api/health/route.ts`. The GET handler:
- Runs the same `SELECT 1` DB check as POST
- Applies rate limiting (same limits)
- Returns the same `{ ok, db, timestamp }` response shape

This allows Playwright (which uses GET for `webServer.url` polling) to verify DB connectivity at startup.

### Fix 6: Playwright Config Update (LOW)

Change `playwright.config.ts` `webServer.url` from `baseURL` (just port check) to `${baseURL}/api/health` (DB-aware readiness). Playwright's GET request will hit the new GET handler.

---

## Tests First

### `lib/with-timeout.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('withTimeout', () => {
  it('resolves when promise settles before timeout', async () => {
    // Promise that resolves in 10ms, timeout at 1000ms → should resolve
  });

  it('rejects with TimeoutError when promise exceeds timeout', async () => {
    // Promise that never resolves, timeout at 50ms → should reject with TimeoutError
  });

  it('clears the timer after promise resolves (no timer leak)', async () => {
    // Verify clearTimeout is called via .finally()
  });

  it('clears the timer after promise rejects (no timer leak)', async () => {
    // Rejected promise, timeout at 1000ms → should reject with original error, timer cleared
  });

  it('preserves the resolved value', async () => {
    // Promise resolves with { data: 42 } → withTimeout returns same value
  });

  it('preserves the original error when promise rejects before timeout', async () => {
    // Promise rejects with custom error → withTimeout rejects with that same error
  });
});

describe('TimeoutError', () => {
  it('has name "TimeoutError"', () => {});
  it('includes ms in message', () => {});
  it('exposes ms property', () => {});
  it('is instanceof Error', () => {});
});
```

### `app/api/health/handler.test.ts`

Extend existing tests (if any) or create new ones:

```typescript
describe('GET /api/health', () => {
  it('returns { ok: true, db: true } when database is reachable');
  it('returns 500 when database query fails');
  it('returns 429 when rate limited');
});
```

### Fix 3 — No dedicated test needed

The session navigation error logging is a dev-mode observability concern. Testing `console.warn` in dev mode would be testing implementation, not behavior. The existing behavior (setting navigation to `null` on error) is already tested.

### Fix 4 — No dedicated test needed

`idle_timeout` is a driver configuration value. We test behavior, not configuration.

---

## Implementation Notes

### Order of Implementation

1. `lib/with-timeout.ts` + tests (TDD) — highest value, standalone utility
2. Health check GET handler + test — enables Fix 6
3. `maxDuration` exports — trivial, no tests needed (config-only)
4. Session navigation observability — trivial code change
5. `idle_timeout` — trivial config change
6. Playwright config update — depends on Fix 5

### Clean Architecture Alignment

| Fix | Layer | Rationale |
|-----|-------|-----------|
| 1. `withTimeout` | `lib/` (infrastructure) | Generic utility, no domain knowledge |
| 1b. Wrapping calls | `app/` (presentation) | Client-side timeout is a presentation concern |
| 2. `maxDuration` | `app/` (framework config) | Route segment config |
| 3. Console.warn | `app/` (presentation) | Dev observability in hook |
| 4. `idle_timeout` | `lib/` (infrastructure) | Driver configuration |
| 5. GET handler | `app/api/` (infrastructure) | Route handler |
| 6. Playwright config | Root config | Test infrastructure |

### What This Does NOT Change

- `createAction` wrapper — server-side error handling is already solid
- Error boundaries — already cover render errors
- Retry utility — not wired to DB queries (intentionally LOW priority per BS-017 Gap 4, deferred)
- Domain or application layers — zero changes to business logic

---

## Acceptance Criteria

- [ ] `lib/with-timeout.ts` exists with `withTimeout()` and `TimeoutError`
- [ ] All tests pass for `withTimeout` (resolve, reject, timeout, timer cleanup)
- [ ] Server action calls in question page hooks are wrapped with `withTimeout`
- [ ] `TimeoutError` triggers existing error states (no new UI needed)
- [ ] `maxDuration` exported on 5 key routes
- [ ] Session navigation fetch has `.catch()` + dev-mode warning
- [ ] `idle_timeout: 20` set in `lib/db.ts`
- [ ] `/api/health` responds to GET with DB check
- [ ] Playwright `webServer.url` points to health endpoint
- [ ] All quality gates pass: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration && pnpm build`

---

## Related

- [BS-017: Dev Environment Resilience](../brainstorming/bs-017-dev-environment-resilience.md) — source investigation
- [SPEC-016: Observability](./spec-016-observability.md) — logging infrastructure
- [SPEC-017: Rate Limiting](./spec-017-rate-limiting.md) — health endpoint rate limiting
- [ADR-012: Clean Architecture Layers](../adr/adr-012-clean-architecture-layers.md)
- [Next.js: Server Actions Cannot Be Aborted](https://github.com/vercel/next.js/issues/81418)
- [Next.js: Route Segment Config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)
- [Vercel: Configuring Function Duration](https://vercel.com/docs/functions/configuring-functions/duration)
- [Vercel: Fluid Compute](https://vercel.com/docs/fluid-compute)
- [Playwright: Web Server Config](https://playwright.dev/docs/test-webserver)
- [postgres.js: Connection Options](https://github.com/porsager/postgres#connection)
