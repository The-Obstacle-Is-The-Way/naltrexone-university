# DEBT-077: No Rate Limiting on Webhooks or Actions

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-02

---

## Description

There is zero rate limiting on any endpoint:
- Stripe webhooks (`/api/stripe/webhook`)
- Clerk webhooks (`/api/webhooks/clerk`)
- Server actions (subscribe, submit answer, etc.)

## Attack Vectors

1. **Compromised webhook signing key** — Attacker sends unlimited fake events, fills database
2. **Thundering herd** — Stripe retries webhook 100x, each hits our DB
3. **Brute force** — User spams "Subscribe" button, creates many checkout sessions
4. **Resource exhaustion** — Bot creates millions of practice sessions

## Current State

```typescript
// app/api/stripe/webhook/route.ts
export async function POST(req: Request) {
  // No rate limit check
  const rawBody = await req.text();
  // ... process immediately
}
```

## Resolution Options

1. **Upstash Rate Limit** — Serverless Redis, works with Vercel
2. **Vercel Edge Config** — Built-in rate limiting
3. **In-memory (dev only)** — Map with timestamps, not production-ready
4. **Cloudflare** — If using CF, rate limit at edge

## Resolution

We implemented a **database-backed fixed-window rate limiter** (no external Redis dependency):

- `db/schema.ts` + migration adds a `rate_limits` table (composite PK: `key` + `window_start`)
- `src/adapters/gateways/drizzle-rate-limiter.ts` provides `RateLimiter.limit()` backed by Drizzle/Postgres
- Webhook route handlers enforce limits and return **429** with `Retry-After`
- High-risk server actions enforce per-user limits and return `ApplicationError('RATE_LIMITED', ...)`

## Recommended Limits

| Endpoint | Limit | Window | Notes |
|----------|-------|--------|-------|
| `/api/stripe/webhook` | 1000 | 1 min | High for webhook retries |
| `/api/webhooks/clerk` | 100 | 1 min | User events are rare |
| Server actions (authed) | 60 | 1 min | Per user ID |
| Server actions (unauthed) | 20 | 1 min | Per IP |

## Verification

- [x] Webhook routes have rate limiting (`/api/stripe/webhook`, `/api/webhooks/clerk`)
- [x] Server actions have per-user rate limiting (checkout session, submit answer, start practice session)
- [x] 429 responses include `Retry-After` header
- [x] Rate limiter behavior is covered by unit + integration tests

## Related

- OWASP API Security Top 10: API4 - Lack of Resources & Rate Limiting
- Stripe webhook best practices: Implement idempotency
- BUG-047: Could have been mitigated by rate limiting
