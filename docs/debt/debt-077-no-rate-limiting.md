# DEBT-077: No Rate Limiting on Webhooks or Actions

**Status:** Open
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

## What Best Practice Looks Like

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'),  // 100 requests per minute
  analytics: true,
});

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const { success, limit, remaining } = await ratelimit.limit(`webhook:stripe:${ip}`);

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'X-RateLimit-Limit': String(limit), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }

  // ... process webhook
}
```

## Resolution Options

1. **Upstash Rate Limit** — Serverless Redis, works with Vercel
2. **Vercel Edge Config** — Built-in rate limiting
3. **In-memory (dev only)** — Map with timestamps, not production-ready
4. **Cloudflare** — If using CF, rate limit at edge

## Recommended Limits

| Endpoint | Limit | Window | Notes |
|----------|-------|--------|-------|
| `/api/stripe/webhook` | 1000 | 1 min | High for webhook retries |
| `/api/webhooks/clerk` | 100 | 1 min | User events are rare |
| Server actions (authed) | 60 | 1 min | Per user ID |
| Server actions (unauthed) | 20 | 1 min | Per IP |

## Verification

- [ ] All webhook routes have rate limiting
- [ ] Server actions have per-user rate limiting
- [ ] 429 response includes `Retry-After` header
- [ ] Rate limit events are logged for alerting

## Related

- OWASP API Security Top 10: API4 - Lack of Resources & Rate Limiting
- Stripe webhook best practices: Implement idempotency
- BUG-047: Could have been mitigated by rate limiting
