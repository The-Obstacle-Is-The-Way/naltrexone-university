# BS-017: Dev Environment Resilience — Server Action Hangs and Observable Failure Gaps

**Status:** Resolved
**Resolved:** 2026-02-15
**Date:** 2026-02-15
**Triggered by:** Two AI agent sessions hung indefinitely while running Playwright screenshots against localhost:3000. Server actions returned no response, leaving the UI in a permanent "Loading..." state with no timeout or error recovery.
**Scope:** The codebase has no client-side timeout on server action calls — the only layer in the stack without a timeout. When a server action hangs (database stall, network partition, Neon cold start edge case), the UI waits forever with no error feedback.
**Related:** [Testing Infrastructure](../dev/testing-infrastructure.md), [AGENTS.md](../../AGENTS.md) (port 3000 cleanup tip)

---

## What This Doc Covers

This brainstorming doc investigates **observable failure gaps** in both dev and production. It follows the fail-fast / fail-loud philosophy: every failure should be detected quickly and surfaced clearly. No silent swallowing, no fallbacks that mask errors.

### Audience

Developers, AI agents, and anyone debugging "the UI is stuck on Loading..." scenarios.

---

## What's Already Good (Verified)

Before listing gaps, it's important to document what the codebase already does well. These were verified against source code on 2026-02-15.

### Database Connection (`lib/db.ts`)

| Feature | Status | Evidence |
|---------|--------|----------|
| **`connect_timeout`** | 30 seconds (driver default) | `postgres@3.4.8` source: `connect_timeout: 30` — NOT infinity |
| **`max_lifetime`** | Random 30–60 minutes (driver default) | Source: `60 * (30 + Math.random() * 30)` — jittered to prevent thundering herd |
| **`keep_alive`** | 60 seconds (driver default) | TCP keepalive detects broken connections |
| **`max`** | 10 connections (driver default) | Appropriate for Vercel serverless with Neon pooled endpoint |
| **Reconnection backoff** | Built-in exponential with jitter | Source: `(0.5 + Math.random()/2) * Math.min(3^retries / 100, 20)` — caps at ~20s |
| **Singleton pattern** | Correct | `globalForDb` in dev prevents HMR connection leaks; fresh instance per serverless invocation in prod |
| **Driver choice** | Correct | `postgres` (porsager) is the right driver for Node.js runtime on Vercel. `@neondatabase/serverless` is only needed for edge/worker runtimes without TCP. |
| **Prepared statements** | Safe | `prepare: true` (default) works with Neon's PgBouncer since v1.22.0 (`max_prepared_statements=1000`) |

### Error Handling

| Feature | Status | Evidence |
|---------|--------|----------|
| **`createAction` wrapper** | Every server action wrapped in try/catch | `src/adapters/controllers/create-action.ts` — errors never propagate as unhandled rejections |
| **Typed `ActionResult<T>`** | Discriminated union | `{ ok: true, data }` or `{ ok: false, error: { code, message } }` — forces callers to check |
| **Error boundaries** | 11 `error.tsx` files + `global-error.tsx` | Every user-facing route has a dedicated boundary with contextual UI |
| **Loading states** | 8 `loading.tsx` files | Every major route has a loading state |
| **Suspense fallback** | Present with accessible text | `app/(app)/app/layout.tsx:95-103` renders `<output aria-live="polite">Loading app content…</output>` |
| **Error logging** | Structured pino with secret redaction | `lib/logger.ts` — `server-only` import, JSON output, Vercel-compatible |
| **`handleError`** | Catches all error types | `ApplicationError` (typed codes), `ZodError` (field-level), unknown (logged + generic message to client) |

### Health Check

| Feature | Status | Evidence |
|---------|--------|----------|
| **`/api/health` endpoint** | Already exists (POST) | `app/api/health/route.ts` — runs `SELECT 1`, rate-limited, returns `{ ok, db, timestamp }` with proper HTTP status codes (200/429/500/503) |

### Retry Infrastructure

| Feature | Status | Evidence |
|---------|--------|----------|
| **Retry utility** | Well-designed, production-quality | `src/adapters/shared/retry.ts` — exponential backoff, configurable factor, max delay, injectable sleep for testing |
| **`isTransientExternalError`** | Classifies retryable errors | Covers `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, `ENOTFOUND`, `ECONNREFUSED`, `EHOSTUNREACH`, `EPIPE`, HTTP 429, 5xx |
| **Applied to external APIs** | Stripe + Clerk | `stripe-retry.ts`, `clerk-auth-gateway.ts` — 3 attempts, 100ms initial, factor 2, max 1000ms |

### Client-Side Safety

| Feature | Status | Evidence |
|---------|--------|----------|
| **`useIsMounted` guard** | Used across ~24 source files | Prevents state updates on unmounted components |
| **Stale closure prevention** | `isStale` flag + cleanup | `use-question-page-controller.ts:161-163` — cancels outdated requests |
| **`useTransition`** | Consistent usage | Provides `isPending` state for loading UI |

---

## The Actual Gaps

### Gap 1: No Client-Side Timeout on Server Action Calls (HIGH — the root cause of the observed hangs)

**What happens:** When a server action hangs (database stall beyond the 30s `connect_timeout`, Neon compute unreachable, network partition), the client-side promise waits forever. The user sees "Loading..." indefinitely with no error, no timeout, and no way to recover without refreshing.

**Why error boundaries don't help:** React error boundaries only catch errors during rendering. A server action that hangs (promise never resolves or rejects) will never trigger an error boundary. The `createAction` try/catch on the server side only fires if the operation errors — a hang means neither success nor error.

**Why AbortController doesn't help:** As of Next.js 16, server actions **cannot be aborted** via `AbortController`. This is a [known limitation](https://github.com/vercel/next.js/issues/81418). The abort signal does not propagate to the server function. For cancellable operations, you must use Route Handlers with `fetch()` instead.

**Canonical 2026 pattern — `Promise.race` with timeout:**

```typescript
// lib/with-timeout.ts
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
```

**Important caveat:** `Promise.race` only prevents the **client from waiting** — the server action continues running until it completes or the platform kills it (via `maxDuration` / Vercel timeout). This is a **UX safeguard**, not a server-side cancellation.

**Where to apply:** This should wrap server action calls in client hooks, not inside `createAction` itself. Per Clean Architecture, the timeout is a presentation-layer concern — the adapter/controller layer should not know about client-side timeouts.

**Evidence:** `grep -r "AbortController" app/ src/` returns zero results. No server action call site has any timeout mechanism.

### Gap 2: No `maxDuration` on Any Route (MEDIUM — relies on implicit platform defaults)

**What happens:** Without `export const maxDuration` on any page or route, server actions inherit Vercel's implicit default:
- **Without Fluid Compute (legacy):** 10s (Hobby) / 15s (Pro)
- **With Fluid Compute (default since April 2025):** 300s (5 min)

If Fluid Compute is enabled (likely for new projects), a hung server action could run for **5 minutes** before Vercel kills it.

**Best practice:** Set `maxDuration` explicitly per-route based on expected execution time with a reasonable buffer. Don't rely on implicit defaults.

```typescript
// app/(app)/app/questions/[slug]/page.tsx
export const maxDuration = 30; // All server actions on this page get 30s
```

For global configuration, consider `vercel.json`:

```json
{
  "functions": {
    "app/**/*": { "maxDuration": 30 },
    "app/api/cron/**/*": { "maxDuration": 60 }
  }
}
```

**Evidence:** `grep -r "maxDuration" app/` returns zero results. No route file in the codebase exports `maxDuration`.

### Gap 3: Silent Error on Session Navigation Fetch (LOW — acceptable degradation, but no observability)

**File:** `app/(app)/app/questions/[slug]/use-question-page-controller.ts:126-131`

```typescript
void getPracticeSessionReview({ sessionId }).then((result) => {
  if (isStale) return;
  if (!isMounted()) return;
  if (!result.ok) {
    setSessionNavigation(null);  // ← Error silently swallowed
    return;
  }
  // ...
});
```

**What happens:** If `getPracticeSessionReview` returns `{ ok: false }`, the session navigation (prev/next buttons) silently disappears. No error is logged, no toast is shown. The user has no idea that session navigation failed — the buttons simply don't render.

**Why this is LOW severity:** Session navigation is supplementary UI. The user can still interact with the question, submit answers, and navigate manually. Setting navigation to `null` on error is a valid degradation strategy.

**What's missing:** A `logger.warn()` or `console.warn()` so that developers/agents can see that the fetch failed. The degradation is correct; the lack of observability is the gap.

**Additionally:** The `.then()` chain has no `.catch()` handler. If `getPracticeSessionReview` throws (network error, etc.) rather than returning `{ ok: false }`, the error is swallowed by `startTransition`'s internal handling with no dev-mode logging. Compare with `runTransitionedAsyncAction` in `question-flow-actions.ts:100-121` which has an explicit catch with `console.error` in dev mode.

### Gap 4: Retry Infrastructure Not Wired to Database Operations (LOW — driver handles reconnection, but queries don't retry)

**What happens:** The `retry` utility and `isTransientExternalError` are only wired to Stripe and Clerk calls. Database queries through Drizzle → postgres do not use application-level retry.

**Why this is LOW severity:** The postgres driver handles **connection-level** reconnection internally (via `backoff`). Individual query failures (e.g., a transient `ECONNRESET` mid-query) would need application-level retry, but these are rare with Neon's pooled connections.

**Per Clean Architecture:** Retry logic belongs in the **adapter layer**, not the use case layer. If we add DB query retry, it should be in a repository adapter wrapping the Drizzle calls, not in the use case or controller.

### Gap 5: `idle_timeout` Not Set — Connections Never Auto-Close When Idle (LOW — acceptable for serverless)

**Current:** `idle_timeout: null` (driver default) — connections stay open when idle.

**Why this is LOW for our setup:**
- **Vercel serverless:** Function instances are frozen/recycled by the platform, so idle connections are cleaned up by runtime lifecycle.
- **Development:** The singleton pattern prevents connection accumulation across HMR reloads.
- **`max_lifetime`** (30-60 min random) already handles connection recycling.

**When it matters:** If connections go stale (e.g., Neon suspends compute while a connection is idle), the postgres driver's `keep_alive: 60` will detect the dead connection, and `max_lifetime` will eventually recycle it. Setting `idle_timeout: 20` would close idle connections faster, reducing the window for stale connection issues.

**Recommended:** Set `idle_timeout: 20` as a belt-and-suspenders measure, especially for dev where the server may sit idle between work sessions.

### Gap 6: Playwright `webServer` Config Doesn't Verify DB Connectivity (LOW — health endpoint exists but isn't used)

**Current (`playwright.config.ts:37-42`):**

```typescript
webServer: {
  command: process.env.CI ? 'pnpm start' : 'pnpm dev',
  url: baseURL,  // Just checks if port 3000 responds
  reuseExistingServer: !process.env.CI,
  timeout: 120000,
},
```

**Gap:** The health check endpoint (`/api/health`) exists and verifies DB connectivity, but Playwright's `webServer.url` just checks if the server is listening on port 3000. The server can be "up" (responding to HTTP) but unable to serve data (database unreachable).

**Fix:** Change `url` to point to the health check. However, since the health check is `POST`-only, Playwright's URL polling (which uses `GET` requests) won't work directly. Options:
1. Add a `GET` handler to the health check route
2. Create a lightweight `/api/health/ready` GET endpoint
3. Keep current config (the 30s `connect_timeout` will surface DB errors quickly in test assertions)

---

## Severity Summary

| Gap | Severity | Frequency | Effort | Impact |
|-----|----------|-----------|--------|--------|
| **1. No client-side timeout** | HIGH | Every hung server action | Low (utility function + usage) | Eliminates indefinite "Loading..." hangs |
| **2. No `maxDuration`** | MEDIUM | Vercel-deployed functions | Low (1-line exports) | Explicit platform timeout instead of implicit defaults |
| **3. Silent session nav error** | LOW | When session review fetch fails | Trivial (add console.warn) | Better dev/agent observability |
| **4. No DB query retry** | LOW | Rare transient failures | Medium | Driver handles reconnection; query retry is incremental |
| **5. `idle_timeout` not set** | LOW | Stale connections after inactivity | Trivial (config change) | Faster stale connection cleanup |
| **6. Playwright health check** | LOW | E2E test startup | Low | Better test reliability |

---

## Proposed Fixes (Prioritized)

### Fix 1: Client-Side Timeout Wrapper (HIGH priority, Low effort)

Create `lib/with-timeout.ts` (see Gap 1 code above). Apply to critical server action calls in client hooks. Start with the most impactful call sites:

1. `use-question-page-controller.ts` — question loading and session navigation
2. Practice session hooks — `startSession`, `submitAnswer`, `getNextQuestion`
3. History/review hooks — session review loading

**Where it lives (Clean Architecture):** The `withTimeout` utility is a **lib-level concern** (outermost layer). It wraps the call at the presentation layer, not inside the controller or use case.

**Timer cleanup:** Always use `.finally(() => clearTimeout(timer))` to prevent timer leaks.

### Fix 2: Add `maxDuration` to Routes (MEDIUM priority, Trivial effort)

Add explicit `maxDuration` exports to key routes:

```typescript
// app/(app)/app/questions/[slug]/page.tsx
export const maxDuration = 30;

// app/api/cron/reconcile-stripe-subscriptions/route.ts
export const maxDuration = 60; // Already has runtime='nodejs'

// app/api/stripe/webhook/route.ts
export const maxDuration = 30;

// app/api/webhooks/clerk/route.ts
export const maxDuration = 30;
```

**Note:** `maxDuration` goes on the **page or layout** that uses server actions, not on the server action file itself.

### Fix 3: Add Observability to Session Navigation Error (LOW priority, Trivial effort)

```typescript
// use-question-page-controller.ts, inside the .then() callback
if (!result.ok) {
  if (process.env.NODE_ENV === 'development') {
    console.warn('[SessionNavigation] Review fetch failed:', result.error);
  }
  setSessionNavigation(null);
  return;
}
```

Also add a `.catch()` handler:

```typescript
void getPracticeSessionReview({ sessionId })
  .then((result) => { /* existing code */ })
  .catch((error) => {
    if (isStale || !isMounted()) return;
    if (process.env.NODE_ENV === 'development') {
      console.error('[SessionNavigation] Review fetch threw:', error);
    }
    setSessionNavigation(null);
  });
```

### Fix 4: Set `idle_timeout` in DB Config (LOW priority, Trivial effort)

```typescript
// lib/db.ts
const conn =
  globalForDb.conn ??
  postgres(connectionString, {
    idle_timeout: 20,
    connection: POSTGRES_CONNECTION_PARAMETERS,
  });
```

**What NOT to change:**
- `connect_timeout` — the 30s default is good (covers Neon cold starts with buffer)
- `max_lifetime` — the random 30-60 min default with jitter is optimal
- `max` — the default 10 is appropriate for Vercel serverless with Neon pooled endpoint
- `keep_alive` — the 60s default is standard

### Fix 5: Add GET Handler to Health Check (LOW priority, Trivial effort)

Add a `GET` export alongside the existing `POST` in `app/api/health/route.ts`, or create a lightweight `/api/health/ready` GET route. Then update `playwright.config.ts`:

```typescript
webServer: {
  command: process.env.CI ? 'pnpm start' : 'pnpm dev',
  url: 'http://localhost:3000/api/health/ready',
  reuseExistingServer: !process.env.CI,
  timeout: 120000,
},
```

---

## What We Investigated and Ruled Out

These were initially suspected as problems but investigation proved they are either non-issues or already handled.

| Suspected Issue | Verdict | Why |
|-----------------|---------|-----|
| "No connection timeout" | **Non-issue** | `connect_timeout: 30` is the driver default. Connections time out after 30 seconds. |
| "No max_lifetime" | **Non-issue** | Random 30-60 minute jitter is the driver default. Connections are recycled. |
| "No health check" | **Non-issue** | `/api/health` exists with DB check, rate limiting, and proper status codes. |
| "No error boundaries" | **Non-issue** | 11 route-level boundaries + `global-error.tsx` cover every user-facing route. |
| "Server action errors bubble as unhandled rejections" | **Non-issue** | `createAction` wraps every server action in try/catch. Errors return as `{ ok: false }`. |
| "No retry for transient failures" | **Partially addressed** | Retry exists for Stripe/Clerk. Driver handles connection reconnection. Only DB query-level retry is missing (low risk). |
| "HMR connection leaks" | **Non-issue** | Singleton pattern + `max_lifetime` handle this. The `keep_alive` setting detects dead connections. |
| "No structured logging" | **Non-issue** | Pino with JSON output, secret redaction, and `server-only` enforcement. |
| "Need `@neondatabase/serverless`" | **Non-issue** | Standard `postgres` driver is correct for Node.js runtime. `@neondatabase/serverless` is for edge/worker environments without TCP. |
| "`prepare: false` needed for PgBouncer" | **Non-issue** | Neon's PgBouncer supports protocol-level prepared statements since v1.22.0. |

---

## Neon Cold Start Context

Neon's free tier suspends compute after 5 minutes of inactivity. Current cold start latency (2026): **~400-750ms** (down from 1-5 seconds in earlier versions).

**Why this usually isn't a problem:**
- The postgres driver's `connect_timeout: 30` provides a 30-second window — far more than the ~750ms worst case.
- The driver's built-in exponential backoff retries connection failures automatically.
- `keep_alive: 60` detects broken connections within a minute.

**When it IS a problem:**
- If Neon compute is unreachable (not just cold, but actually down), the 30-second `connect_timeout` fires and returns an error — but there is no client-side timeout, so the UI waits for the full 30 seconds of server-side timeout PLUS any server-side processing time before the error propagates back.
- If multiple cold starts happen simultaneously (e.g., Playwright running multiple tests), connections can queue up.

**Mitigation already in place:** The 30s `connect_timeout` ensures the server side fails within a bounded time. The missing piece is Gap 1 (client-side timeout) to bound the total wait time from the user's perspective.

---

## Clean Architecture Alignment

Per Robert C. Martin's dependency rule and industry best practices:

| Concern | Belongs In | Current Status |
|---------|-----------|----------------|
| **Connection timeout** | Adapter layer (driver config) | Handled by driver defaults |
| **Query retry** | Adapter layer (repository implementation) | Not implemented (LOW priority) |
| **Client-side timeout** | Presentation layer (hooks/components) | NOT implemented (HIGH priority — Gap 1) |
| **Error translation** | Adapter → Application boundary | Handled by `createAction` + `handleError` |
| **Typed error results** | Application layer | Handled by `ActionResult<T>` |
| **Error boundaries** | Presentation layer | Handled by `error.tsx` files |
| **Platform timeout** | Infrastructure config | NOT configured (MEDIUM priority — Gap 2) |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-15 | Created BS-017 | Two agent sessions hung on server action calls; initial root cause traced to missing connection timeouts |
| 2026-02-15 | Corrected BS-017 after deep investigation | Driver defaults provide 30s connect timeout, random 30-60 min max_lifetime, and exponential backoff. Original doc incorrectly claimed these were infinite/missing. Root cause narrowed to no client-side timeout on server actions (Gap 1). |

---

## Related Documentation

- [postgres.js connection options](https://github.com/porsager/postgres#connection) — `connect_timeout`, `idle_timeout`, `max_lifetime`, `max`
- [Neon: Connection Latency and Timeouts](https://neon.com/docs/connect/connection-latency) — Cold start ~400-750ms
- [Neon: Connection Pooling](https://neon.com/docs/connect/connection-pooling) — PgBouncer transaction mode, 10k client connection limit
- [Next.js Server Actions — Cannot Be Aborted](https://github.com/vercel/next.js/issues/81418) — Known limitation, use Route Handlers for cancellable operations
- [Next.js Route Segment Config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config) — `maxDuration` goes on pages/layouts, not server action files
- [Vercel Functions Duration](https://vercel.com/docs/functions/configuring-functions/duration) — Fluid Compute defaults to 300s
- [Vercel: Efficiently Manage DB Pools with Fluid](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute) — Pool reuse in serverless
- [Testing Infrastructure](../dev/testing-infrastructure.md) — Playwright config, troubleshooting
- [AGENTS.md](../../AGENTS.md) — Port 3000 cleanup tip
