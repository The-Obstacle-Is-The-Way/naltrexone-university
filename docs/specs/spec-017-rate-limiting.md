# SPEC-017: Rate Limiting

> **Status:** Partial
> **Priority:** P2 (Important for Production)
> **Author:** Claude
> **Created:** 2026-02-01
> **Updated:** 2026-02-03

---

## Current State

✅ **Implemented:**
- `src/adapters/gateways/drizzle-rate-limiter.ts` — Postgres-backed sliding window rate limiter
- `src/application/ports/gateways.ts` — `RateLimiter` interface
- Rate limiting applied to:
  - Checkout session creation (`billing-controller.ts`)
  - Practice session start (`practice-controller.ts`)
  - Answer submission (`question-controller.ts`)
- `db/schema.ts` — `rateLimits` table for tracking

❌ **Not Yet Implemented:**
- Redis-backed rate limiter (Upstash) for edge performance
- IP-based rate limiting for webhooks
- Rate limit headers in responses

---

## Problem

Without rate limiting, our APIs are vulnerable to:
1. **Abuse** - Malicious actors hammering endpoints
2. **Cost overruns** - Excessive Neon DB queries, Stripe API calls
3. **Degraded UX** - Legitimate users impacted by noisy neighbors
4. **Scraping** - Question content being harvested

---

## Decision

### Current Implementation: Postgres-Backed Rate Limiter

We implemented a custom rate limiter using Postgres for durability:

| Layer | Protection | Notes |
|-------|------------|-------|
| **Vercel** | Edge network DDoS protection | Automatic, no config needed |
| **Clerk** | Auth endpoint rate limiting | Built into Clerk SDK |
| **Stripe** | API rate limits | Stripe enforces 100 req/sec |
| **Neon** | Connection pooling limits | Serverless driver has built-in limits |

### Post-MVP: Add Custom Rate Limiting

When usage grows, add custom rate limiting using **Upstash Redis** + `@upstash/ratelimit`:

```typescript
// lib/rate-limit.ts (Post-MVP)
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

// 10 requests per 10 seconds sliding window
export const apiRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true,
  prefix: 'ratelimit:api',
});

// Usage in middleware or route handler:
// const { success, limit, remaining } = await apiRateLimiter.limit(userId);
```

### Rate Limit Tiers (Post-MVP)

| Endpoint Category | Limit | Window | Key |
|-------------------|-------|--------|-----|
| **Auth callbacks** | 20 | 1 min | IP |
| **Question fetch** | 60 | 1 min | userId |
| **Answer submit** | 30 | 1 min | userId |
| **Webhook** | 100 | 1 min | IP |

---

## MVP Implementation

For MVP, we ship a Postgres-backed sliding-window rate limiter via
`src/adapters/gateways/drizzle-rate-limiter.ts` and apply it to:

1. Checkout session creation (`billing-controller.ts`)
2. Practice session start (`practice-controller.ts`)
3. Answer submission (`question-controller.ts`)

### Historical Note (Pre-Implementation)

Before the Postgres-backed limiter existed, the MVP plan was to rely only on
upstream protections (Clerk/Stripe/Vercel). That plan is now superseded, but is
kept here for context:

### Already Protected

1. **Clerk endpoints** (`/sign-in`, `/sign-up`, etc.) - Clerk handles rate limiting
2. **Stripe webhooks** - Stripe retries with backoff, we just process
3. **Static assets** - Vercel CDN, unlimited

### Potentially Vulnerable (Accept Risk for MVP)

1. **Question fetching** - Could be scraped, but content isn't secret (medical knowledge)
2. **Answer submission** - Rate limited by natural user behavior
3. **Health check** - Public, but cheap operation

---

## When to Implement Custom Limits

Add custom rate limiting when ANY of these occur:
- [ ] Unusual traffic spikes in Vercel Analytics
- [ ] Neon DB costs increase unexpectedly
- [ ] User reports of slow response times
- [ ] Evidence of content scraping

---

## Files to Create (Post-MVP)

```text
lib/
└── rate-limit.ts    # Upstash rate limiter instance
```

---

## Dependencies (Post-MVP)

```bash
pnpm add @upstash/ratelimit @upstash/redis
```

---

## References

- [Upstash Rate Limiting](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview)
- [Vercel Edge Middleware Rate Limiting](https://vercel.com/templates/next.js/api-rate-limit-upstash)
- [Clerk Rate Limits](https://clerk.com/docs/reference/rate-limits)
