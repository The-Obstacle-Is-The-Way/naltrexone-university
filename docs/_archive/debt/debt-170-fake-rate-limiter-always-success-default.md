# DEBT-170: FakeRateLimiter Always-Success Default Masks Rejection Paths

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-08
**Resolved:** 2026-02-08

---

## Description

`FakeRateLimiter` in `src/application/test-helpers/fakes/fake-gateways.ts` returns `{ success: true }` when no explicit results are configured. This means every test that uses the default `FakeRateLimiter()` (without passing a rejection result) silently assumes rate limiting always passes — the rejection/429 code paths are never exercised unless a test author explicitly remembers to configure a failure result.

**Current behavior (lines 50-65):**

```typescript
async limit(input: RateLimitInput): Promise<RateLimitResult> {
  this.inputs.push(input);
  const next = this.results.shift();
  if (next instanceof Error) throw next;
  if (next) return next;

  // Falls through to always-success when no results configured
  return {
    success: true,
    limit: input.limit,
    remaining: Math.max(0, input.limit - 1),
    retryAfterSeconds: 0,
  };
}
```

This is a reasonable default for most tests (you don't want rate limiting to interfere with unrelated test logic), but it creates a systematic gap: **no test will accidentally discover that a rate-limited endpoint fails to handle rejection correctly**.

## Impact

- **Systematic blind spot** — rejection/429 paths in all rate-limited endpoints are only tested if someone explicitly writes a rate-limit-rejection test
- **False confidence** — tests pass even if a rate-limited endpoint has no error handling for `success: false`
- **Inconsistent coverage** — some endpoints may have explicit rate-limit rejection tests, others may not; there's no forcing function

## Resolution

This is not about changing `FakeRateLimiter`'s default (always-success is the correct default for most tests). The fix is to **audit all rate-limited endpoints and ensure each has at least one test that configures a rejection result**.

### Audit checklist — rate-limited endpoints:

Each endpoint using `RateLimiter.limit()` should have a test that:
1. Configures `FakeRateLimiter` with `{ success: false, limit: N, remaining: 0, retryAfterSeconds: X }`
2. Verifies the endpoint returns 429 with correct `Retry-After` header
3. Verifies the rate limit response headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)

Endpoints to audit:
- Clerk webhook handler (`app/api/webhooks/clerk/handler.ts`)
- Stripe webhook handler (if rate-limited)
- Any server actions with rate limiting
- Cron route handlers

## Verification

- [x] Rate-limited HTTP endpoints audited (health, Clerk webhook, Stripe webhook)
- [x] Each audited route has explicit rejection-path coverage
- [x] Route tests assert `429`, `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining`
- [x] Rate-limited server-action controllers already cover `RATE_LIMITED` error behavior
- [x] `pnpm test --run` passes

## Related

- `src/application/test-helpers/fakes/fake-gateways.ts` — `FakeRateLimiter`
- `src/application/ports/gateways.ts` — `RateLimiter` port
- `app/api/webhooks/clerk/handler.ts` — Clerk webhook rate limiting
