# ADR-016: Rate Limiting and Abuse Prevention

**Status:** Accepted
**Date:** 2026-02-07
**Decision Makers:** Engineering
**Depends On:** ADR-001 (Clean Architecture Layers), ADR-009 (Security Hardening), ADR-011 (API Design Principles)

---

## Context

Public-facing server actions and API routes are exposed to abuse:

- **Unauthenticated routes** (`/api/stripe/webhook`, `/api/webhooks/clerk`, `/api/health`) can be hit by anyone on the internet.
- **Authenticated routes** (practice session start, answer submission, checkout) can be automated by a compromised or malicious client.

Without rate limiting, an attacker can:
- Exhaust database connections with rapid-fire queries.
- Trigger excessive Stripe API calls (which have their own rate limits).
- Inflate answer/attempt counts, corrupting user statistics.
- DDoS the health check endpoint.

---

## Decision

### 1. Port: `RateLimiter`

Defined in `src/application/ports/gateways.ts`:

```typescript
interface RateLimiter {
  limit(input: RateLimitInput): Promise<RateLimitResult>;
}

type RateLimitInput = { key: string; limit: number; windowMs: number };
type RateLimitResult = { success: boolean; limit: number; remaining: number; retryAfterSeconds: number };
```

The port is vendor-agnostic. Implementations can use Postgres, Redis, or in-memory stores.

### 2. Implementation: `DrizzleRateLimiter`

Defined in `src/adapters/gateways/drizzle-rate-limiter.ts`. Uses a **fixed-window counter** backed by the `rate_limits` table:

```text
INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
RETURNING count
```

- **Window alignment:** `windowStartMs = nowMs - (nowMs % windowMs)` — aligns windows to clean boundaries.
- **Atomic increment:** `INSERT ... ON CONFLICT DO UPDATE` in a single query — no race conditions.
- **Retry-After:** Returns seconds until the current window resets.

### 3. Centralized Configuration

All rate limits are defined in `src/adapters/shared/rate-limits.ts`:

| Action | Limit | Window |
|--------|-------|--------|
| Stripe webhook | 1000/min | 60s |
| Clerk webhook | 100/min | 60s |
| Health check | 600/min | 60s |
| Submit answer | 120/min | 60s |
| Bookmark toggle | 60/min | 60s |
| Start practice session | 20/min | 60s |
| Checkout session | 10/min | 60s |

Limits are tuned per-action based on expected usage patterns. All use a 1-minute window for simplicity and predictability.

### 4. Key Strategy

- **Authenticated actions:** Key is `userId:actionName` — per-user, per-action.
- **Unauthenticated routes (webhooks):** Key is `ip:actionName` — per-IP, per-action.
- **IP extraction:** `lib/request-ip.ts` trusts only `x-vercel-forwarded-for` in production (DEBT-135 hardening).

### 5. Controller Integration

Controllers call `rateLimiter.limit()` before executing the use case. On failure, they return an `ActionResult` error with code `RATE_LIMITED` and the `retryAfterSeconds` value.

---

## Consequences

### Positive

- **Abuse prevention** — Bounds resource consumption per user/IP.
- **No external dependencies** — Postgres-backed; no Redis required for MVP.
- **Atomic** — Single-query increment prevents race conditions.
- **Centralized configuration** — All limits in one file, easy to tune.
- **Clean Architecture** — Port in application layer, Drizzle implementation in adapters.
- **Testable** — Fake rate limiter available for unit tests.

### Negative

- **Database load** — Every rate-limited action adds one DB query.
- **Fixed-window imprecision** — Allows burst at window boundaries (up to 2x limit in worst case).
- **No distributed coordination** — In a multi-region deployment, each region has independent counts.

### Mitigations

- Rate limit table is append-heavy with minimal contention (keyed per-user).
- Fixed-window is acceptable for MVP; sliding window or token bucket can be added later.
- For multi-region, Upstash Redis (edge-native) is planned as a post-MVP upgrade.
- Old rate limit rows can be pruned periodically (rows older than the window are dead).

---

## Compliance

- `tests/integration/repositories.integration.test.ts` covers `DrizzleRateLimiter` limit enforcement, window behavior, and retry-after calculation.
- Route tests verify 429 handling and rate-limit headers on public endpoints:
  - `app/api/stripe/webhook/route.test.ts`
  - `app/api/webhooks/clerk/route.test.ts`
  - `app/api/health/route.test.ts`
- Controller tests verify `RATE_LIMITED` behavior on authenticated actions:
  - `src/adapters/controllers/billing-controller.test.ts`
  - `src/adapters/controllers/practice-controller.test.ts`
  - `src/adapters/controllers/question-controller.test.ts`
  - `src/adapters/controllers/bookmark-controller.test.ts`
- SPEC-017 tracks the rate limiting feature with "Partial" status (Postgres MVP, Redis post-MVP).

---

## References

- `src/application/ports/gateways.ts` — `RateLimiter` port
- `src/adapters/gateways/drizzle-rate-limiter.ts` — Postgres implementation
- `src/adapters/shared/rate-limits.ts` — Centralized limit configuration
- `lib/request-ip.ts` — IP extraction with trust boundary
- `db/schema.ts` — `rate_limits` table
- ADR-009 (Security Hardening) — Defense-in-depth context
- SPEC-017 — Rate Limiting specification
