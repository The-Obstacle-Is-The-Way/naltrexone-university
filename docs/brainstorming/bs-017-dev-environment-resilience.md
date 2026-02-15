# BS-017: Dev Environment Resilience — Connection Timeouts and Server Action Hangs

**Date:** 2026-02-15
**Triggered by:** Two AI agent sessions hung indefinitely while running Playwright screenshots against localhost:3000. Server actions returned no response, leaving the UI in a permanent "Loading…" state with no timeout or error recovery.
**Scope:** The local dev stack has no connection timeouts, no server action client-side timeouts, and no graceful degradation for Neon Postgres cold starts — causing silent hangs that waste developer and agent time.
**Related:** [Testing Infrastructure](../dev/testing-infrastructure.md), [AGENTS.md](../../AGENTS.md) (port 3000 cleanup tip)

---

## Open Questions

1. **What connection timeout is appropriate?** Neon cold starts take 1–5 seconds. A 10-second `connect_timeout` covers cold starts without masking real outages. Is 10s right, or should dev and production differ?
2. **Should server actions use AbortController?** Adding a client-side timeout (e.g., 15 seconds) to every server action call would surface errors instead of hanging forever. But should this be a per-call wrapper or a global middleware?
3. **Should we add a health check endpoint?** A `/api/health` route that pings the database would let Playwright's `webServer` config verify the app is truly ready — not just listening on port 3000 but actually able to serve data.
4. **Connection pool limits?** The `postgres` driver defaults to 10 connections. In dev with HMR, we never explicitly set `max`. Should we cap it lower (e.g., 3) to avoid exhausting Neon's free-tier connection limit?

---

## The Problem

### What Happens

When a developer (or AI agent) runs the Next.js dev server and makes a request that triggers a server action calling the database, the request sometimes hangs indefinitely — no error, no timeout, no feedback. The UI shows "Loading…" forever.

This was observed twice during Playwright-based screenshot sessions:
- **Agent 1:** Spent 38 minutes debugging a `getNextQuestion` server action that never returned. The agent never took a single screenshot.
- **Agent 2:** Got partial screenshots but `SessionNavigationBar` never rendered because the underlying `getPracticeSessionReview` server action hung silently.

Both agents were unable to distinguish "slow response" from "will never respond" because there is no timeout at any layer of the stack.

### Why It Matters

- **Developer time wasted:** A human developer hitting this would kill the server and restart, losing a few minutes. An AI agent (which can't intuit "this is hung") loses its entire context window trying to debug infrastructure.
- **Flaky E2E tests:** Playwright tests with `timeout: 15_000` will fail, but the failure message ("locator timed out") gives no hint that the database connection is the root cause.
- **Production risk:** The same missing timeouts exist in production. A Neon outage would cause server actions to hang forever with no error boundary catching it.

---

## Root Cause Analysis

### 1. No postgres connection timeout

**File:** `lib/db-connection-options.ts`

```typescript
export const POSTGRES_CONNECTION_PARAMETERS = {
  TimeZone: 'UTC',
} as const;
```

**File:** `lib/db.ts:17`

```typescript
const conn =
  globalForDb.conn ??
  postgres(connectionString, { connection: POSTGRES_CONNECTION_PARAMETERS });
```

The `postgres` driver (`postgres ^3.4.8`) accepts `connect_timeout`, `idle_timeout`, and `max_lifetime` options — none are set. If Neon's connection pooler is slow or the database is cold-starting, the driver will wait forever to establish a connection.

**What's missing:**

| Option | Purpose | Current | Suggested |
|--------|---------|---------|-----------|
| `connect_timeout` | Max seconds to wait for initial connection | ∞ (default) | 10 |
| `idle_timeout` | Seconds before idle connections are closed | 0 (never) | 30 |
| `max_lifetime` | Max seconds a connection can exist | ∞ (default) | 300 (5 min) |
| `max` | Max connections in pool | 10 (default) | 3 (dev) / 10 (prod) |

### 2. No server action client-side timeout

**Evidence:** `grep -r "AbortController" app/` returns zero results.

Every server action call in the app is a bare `await controllerFunction(args)` with no timeout wrapper. The `fetch` that Next.js generates under the hood for server actions has no `signal` or `AbortController` attached.

**Example call chain** (review mode):
1. `use-question-page-controller.ts` calls `getPracticeSessionReview(sessionId)`
2. This is a server action in `src/adapters/controllers/review-controller.ts`
3. The controller calls the database via Drizzle → postgres driver
4. If step 3 hangs, step 1 awaits forever — no timeout, no error, no UI feedback

### 3. Neon Postgres cold starts

Neon's free tier suspends compute after 5 minutes of inactivity. The first connection after suspension triggers a cold start taking 1–5 seconds. During this window:
- The postgres driver is blocked on TCP connect
- No timeout fires (because none is configured)
- The server action promise is pending
- The client sees "Loading…" indefinitely if the cold start exceeds expectations

### 4. Next.js HMR connection leaks

**File:** `lib/db.ts:18-20`

```typescript
if (process.env.NODE_ENV !== 'production') {
  globalForDb.conn = conn;
}
```

The singleton pattern prevents creating a new connection on every HMR reload. However, if a file outside the `lib/db.ts` module boundary is edited and causes a partial re-evaluation, the old connection may become stale while `globalForDb.conn` still references it. The postgres driver will try to reuse the dead connection, and — with no `idle_timeout` or `max_lifetime` — it won't know to discard it.

### 5. No graceful degradation or error boundary for data loading

Server action failures (including hangs) bubble up as unhandled promise rejections. There is no:
- Client-side error boundary wrapping server action calls with a timeout
- Retry-with-backoff for transient connection failures
- User-facing "Connection lost — retry?" UI for data loading failures

---

## Severity Assessment

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Frequency** | Moderate | Happens after 5+ minutes of dev inactivity (Neon cold start), or when connection pool is exhausted |
| **Impact** | High | Complete UI hang with no recovery path; wastes significant agent/developer time |
| **Blast radius** | Dev + Prod | Same code path runs in production — a Neon outage would cause identical hangs |
| **Effort to fix** | Low | Most fixes are 1–5 line config changes |

---

## Proposed Fixes (Sketches)

### Fix 1: Add connection timeouts to postgres driver (Low effort)

**File:** `lib/db-connection-options.ts`

Add `connect_timeout`, `idle_timeout`, and `max_lifetime` to the existing connection parameters. These are driver-level options passed directly to `postgres()`, not inside `connection:`.

**File:** `lib/db.ts`

Pass the timeout options alongside the existing `connection` parameter:

```typescript
const conn =
  globalForDb.conn ??
  postgres(connectionString, {
    connect_timeout: 10,
    idle_timeout: 30,
    max_lifetime: 300,
    max: process.env.NODE_ENV === 'production' ? 10 : 3,
    connection: POSTGRES_CONNECTION_PARAMETERS,
  });
```

**Note:** `connect_timeout`, `idle_timeout`, `max_lifetime`, and `max` are top-level `postgres()` options, NOT inside the `connection` object (which maps to PostgreSQL `SET` parameters). See [postgres.js docs](https://github.com/porsager/postgres#connection).

### Fix 2: Server action timeout wrapper (Low effort)

Create a utility that wraps server action calls with an AbortController or Promise.race timeout:

```typescript
// lib/with-timeout.ts
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Server action timed out after ${ms}ms`)), ms)
    ),
  ]);
}
```

Usage in controllers or client hooks:

```typescript
const result = await withTimeout(getPracticeSessionReview(sessionId), 15_000);
```

### Fix 3: Health check endpoint (Low effort)

Add `/api/health` that runs `SELECT 1` against the database. Update `playwright.config.ts` to use it:

```typescript
webServer: {
  command: 'pnpm dev',
  url: 'http://localhost:3000/api/health', // Currently just http://localhost:3000
  timeout: 120_000,
  reuseExistingServer: !process.env.CI,
},
```

### Fix 4: Document troubleshooting in testing-infrastructure.md (Low effort)

Add a section to `docs/dev/testing-infrastructure.md` covering:
- Neon cold start symptoms and how to recognize them
- How to verify the database is reachable: `psql $DATABASE_URL -c "SELECT 1"`
- Port 3000 zombie cleanup (already in `AGENTS.md:138`, should be in testing docs too)
- Connection pool exhaustion signs and recovery

---

## Affected Files

| File | Issue |
|------|-------|
| `lib/db-connection-options.ts` | No timeout parameters |
| `lib/db.ts` | No `max`, `idle_timeout`, `max_lifetime` on `postgres()` call |
| `next.config.ts` | No `serverActions.bodySizeLimit` or timeout config |
| `playwright.config.ts` | `webServer.url` doesn't verify DB connectivity |
| `docs/dev/testing-infrastructure.md` | No troubleshooting for connection hangs |
| All server action callers in `app/` | No client-side timeout or AbortController |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-15 | Created BS-017 | Two agent sessions hung on server action calls; root cause traced to missing connection timeouts |

---

## Related Documentation

- [postgres.js connection options](https://github.com/porsager/postgres#connection) — `connect_timeout`, `idle_timeout`, `max_lifetime`, `max`
- [Neon cold starts](https://neon.tech/docs/introduction/auto-suspend) — Auto-suspend behavior and cold start latency
- [Next.js Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations) — No built-in client-side timeout mechanism
- [Testing Infrastructure](../dev/testing-infrastructure.md) — Existing troubleshooting (minimal)
- [AGENTS.md](../../AGENTS.md) — Port 3000 cleanup tip (line ~138)
