# SPEC-017: Rate Limiting

> **Status:** Complete (MVP)
> **Priority:** P2 (Important for Production)
> **Author:** Claude
> **Created:** 2026-02-01
> **Updated:** 2026-03-15

---

## Current State

✅ **Implemented (MVP Complete):**
- `src/adapters/gateways/drizzle-rate-limiter.ts` — Postgres-backed **fixed-window** rate limiter (atomic `INSERT ... ON CONFLICT DO UPDATE`)
- `src/application/ports/gateways.ts` — `RateLimiter` interface (port)
- `src/adapters/shared/rate-limits.ts` — Centralized limit configuration (no magic numbers)
- `lib/request-ip.ts` — IP extraction trusting only `x-vercel-forwarded-for` (spoof-resistant)
- `db/schema.ts` — `rateLimits` table with composite PK `(key, window_start)` + migration `0002`
- `lib/container/gateways.ts` — `DrizzleRateLimiter` wired via constructor injection
- `src/application/test-helpers/fakes/fake-gateways.ts` — `FakeRateLimiter` for unit tests
- Rate limiting applied to **all 9 endpoints**:

| Endpoint | Controller / Handler | Rate Limit Key | Limit |
|----------|---------------------|----------------|-------|
| Checkout session creation | `billing-controller.ts` | `billing:createCheckoutSession:{userId}` | 10/min |
| Portal session creation | `billing-controller.ts` | `billing:createPortalSession:{userId}` | 20/min |
| Practice session start | `practice-controller.ts` | `practice:startPracticeSession:{userId}` | 20/min |
| Answer submission | `question-controller.ts` | `question:submitAnswer:{userId}` | 120/min |
| Bookmark toggle | `bookmark-controller.ts` | `bookmark:toggleBookmark:{userId}` | 60/min |
| Stripe webhook | `stripe/webhook/handler.ts` | `webhook:stripe:{ip}` | 1000/min |
| Clerk webhook | `webhooks/clerk/handler.ts` | `webhook:clerk:{ip}` | 100/min |
| Health check | `health/handler.ts` | `health:{ip}` | 600/min |
| Cron reconcile | `cron/reconcile-stripe-subscriptions/route.ts` | `cron:reconcile-stripe-subscriptions` | 5/min |

**Response headers on 429:** `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`

**Accepted risk:** Question fetching (read-only) is not rate limited. Content is non-secret medical knowledge. Add a read-rate limit key if scraping is observed.

---

## Problem

Without rate limiting, our APIs are vulnerable to:
1. **Abuse** — Malicious actors hammering endpoints
2. **Cost overruns** — Excessive Neon DB queries, Stripe API calls
3. **Degraded UX** — Legitimate users impacted by noisy neighbors
4. **Scraping** — Question content being harvested

This aligns with [OWASP API4:2023 "Unrestricted Resource Consumption"](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/), which broadened the earlier "Lack of Rate Limiting" (2019) to also cover payload sizes, array element counts, upload file sizes, and computational cost. Rate limiting addresses the request-count dimension; input validation (a separate concern) addresses the rest.

---

## Decision

### Defense-in-Depth Layers

| Layer | Protection | Notes |
|-------|------------|-------|
| **Vercel WAF** | Infrastructure-level IP rate limiting | GA on Hobby (free): 1 rule, 1M requests/month. See [Enhancement E1](#e1-vercel-waf-rate-limiting) |
| **Vercel Edge** | DDoS protection | Automatic, no config needed |
| **Application** | Per-user, per-action fixed-window counters | Our `DrizzleRateLimiter` — the core of this spec |
| **Clerk** | Auth endpoint rate limiting | Built into Clerk SDK |
| **Stripe** | API rate limits | Stripe enforces 100 req/sec |
| **Neon** | Connection pooling limits | Serverless driver has built-in limits |

### Why Postgres-Backed Fixed-Window Is Correct for Now

Community consensus (as of March 2026) confirms this approach:
- **Postgres fixed-window** is universally considered sufficient for zero-to-low traffic apps. `node-rate-limiter-flexible` benchmarks Postgres at ~995 req/s with 7.48ms average latency.
- **Known trade-off:** burst at window boundaries allows up to 2× the configured limit. Acceptable at low scale; sliding window is an optimization for later.
- **Neon cold-start latency** (500ms–3s after inactivity) is irrelevant here because rate-limit checks fire on already-active connections (the user request already warmed the compute).
- **Controller-level placement** is the correct location for business-logic-aware limits (per-user, per-action). Middleware-level is better for blanket IP-based throttling — that role is served by Vercel WAF.

### IP Spoofing Mitigation

`lib/request-ip.ts` trusts only `x-vercel-forwarded-for` in production. This header is set by Vercel's Edge Network and stripped from client requests, making it immune to `X-Forwarded-For` spoofing attacks. This follows Vercel's documented recommendation.

### Response Headers

We return `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining` on 429 responses. This matches the de facto standard used by GitHub, Stripe, and most major APIs.

The IETF is drafting standardized headers (`RateLimit-Policy`, `RateLimit`) via [draft-ietf-httpapi-ratelimit-headers](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) (draft-10, not yet an RFC as of March 2026). No action needed until ratified; when it becomes an RFC, consider dual-emitting both `X-RateLimit-*` and the standard headers during a transition period.

---

## Test Coverage

| Test Suite | File | Cases |
|------------|------|-------|
| Drizzle rate limiter unit | `src/adapters/gateways/drizzle-rate-limiter.test.ts` | 11 (pruning, overflow, isolation) |
| Fake rate limiter unit | `src/application/test-helpers/fakes/fake-rate-limiter.test.ts` | 5 (scripted results, errors) |
| Integration (real Postgres) | `tests/integration/rate-limiter.integration.test.ts` | Counter increments + rejection |
| Billing controller | `billing-controller.test.ts` | RATE_LIMITED path for checkout + portal |
| Question controller | `question-controller.test.ts` | RATE_LIMITED path for answer submission |
| Health route | `health/route.test.ts` | 4 (429 response, headers, limiter failure) |
| Stripe webhook route | `stripe/webhook/route.test.ts` | Rate limiter mocked + tested |
| Clerk webhook route | `clerk/route.test.ts` | Rate limiter created + tested |
| Cron reconcile route | `cron/reconcile-stripe-subscriptions/route.test.ts` | Rate limiter in mock container |

---

## Files

```text
src/
├── adapters/
│   ├── gateways/
│   │   ├── drizzle-rate-limiter.ts          # ✅ Postgres fixed-window implementation
│   │   └── drizzle-rate-limiter.test.ts     # ✅ 11 unit tests
│   └── shared/
│       └── rate-limits.ts                   # ✅ Centralized limit configuration
├── application/
│   ├── ports/
│   │   └── gateways.ts                     # ✅ RateLimiter interface
│   └── test-helpers/
│       └── fakes/
│           ├── fake-gateways.ts            # ✅ FakeRateLimiter
│           └── fake-rate-limiter.test.ts   # ✅ 5 unit tests
lib/
├── container/
│   └── gateways.ts                         # ✅ DrizzleRateLimiter wiring
└── request-ip.ts                           # ✅ Spoof-resistant IP extraction
db/
├── schema.ts                               # ✅ rateLimits table
└── migrations/
    └── 0002_curious_firelord.sql           # ✅ Table creation migration
tests/
└── integration/
    └── rate-limiter.integration.test.ts    # ✅ Real Postgres tests
```

---

## Future Enhancements

These are **not needed now** (zero users, pre-launch). Each includes a trigger for when to revisit.

### E1: Vercel WAF Rate Limiting

**What:** Configure 1 free WAF rule in the Vercel dashboard for infrastructure-level IP throttling. Zero code changes required — takes effect globally within 300ms.

**Trigger:** Before launch, or anytime. Free on Hobby plan (1 rule, 1M requests/month).

**Details:** [Vercel WAF Rate Limiting Docs](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting). The `@vercel/firewall` SDK also exposes a `checkRateLimit` function for programmatic integration if needed later.

### E2: Redis-Backed Rate Limiting (Upstash)

**What:** Migrate from Postgres to Upstash Redis for lower-latency counters and sliding-window / token-bucket semantics.

**Trigger:** When Postgres rate-limit query latency appears in Vercel metrics, or when multi-region deployment requires edge-local counters.

```typescript
// lib/rate-limit.ts (future)
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

export const apiRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true,
  prefix: 'ratelimit:api',
});
```

**Dependencies:** `pnpm add @upstash/ratelimit @upstash/redis`

**File to create:** `lib/rate-limit.ts`

### E3: Next.js Middleware-Level Rate Limiting

**What:** Add blanket IP-based throttling in Next.js middleware (Edge Runtime) to reject abusive traffic before serverless function cold-starts.

**Trigger:** When Vercel WAF's free tier is insufficient, or when you need custom logic (e.g., per-path limits at the edge).

**Note:** Requires an external store (Redis/KV) since Edge Runtime has no persistent memory. Upstash (E2) is a prerequisite.

### E4: IETF Standard Rate Limit Headers

**What:** Dual-emit `RateLimit-Policy` and `RateLimit` headers alongside existing `X-RateLimit-*` headers per [draft-ietf-httpapi-ratelimit-headers](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/).

**Trigger:** When the IETF draft becomes an RFC.

### E5: OWASP Unrestricted Resource Consumption (Beyond Rate Limiting)

**What:** Address the non-rate-limiting dimensions of OWASP API4:2023 — max payload sizes, array element limits, upload file sizes, computational cost caps.

**Trigger:** When adding file upload, large payload, or computationally expensive endpoints. This is a separate concern from rate limiting and should be tracked in its own spec if needed.

---

## Historical Notes

### Pre-Implementation Plan (Superseded)

Before the Postgres-backed limiter existed, the MVP plan was to rely only on upstream protections (Clerk/Stripe/Vercel). That plan is now fully superseded by the current implementation.

### Monitoring Triggers (Retained for Reference)

Escalate to Redis (E2) or WAF (E1) when ANY of these occur:
- Unusual traffic spikes in Vercel Analytics
- Neon DB costs increase unexpectedly
- User reports of slow response times
- Evidence of content scraping

---

## References

- [OWASP API4:2023 — Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)
- [Vercel WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Vercel WAF Rate Limiting SDK (`@vercel/firewall`)](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk)
- [IETF Rate Limit Headers Draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)
- [Upstash Rate Limiting](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview)
- [Vercel Edge Middleware Rate Limiting](https://vercel.com/templates/next.js/api-rate-limit-upstash)
- [Clerk Rate Limits](https://clerk.com/docs/reference/rate-limits)
- [node-rate-limiter-flexible PostgreSQL Benchmarks](https://github.com/animir/node-rate-limiter-flexible/wiki/PostgreSQL)
