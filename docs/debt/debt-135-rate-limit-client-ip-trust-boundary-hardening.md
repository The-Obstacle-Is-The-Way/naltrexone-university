# DEBT-135: Rate-Limit Client IP Trust Boundary Is Not Explicitly Hardened

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

Rate-limited public routes key limits by `getClientIp(req.headers)`, which accepts:

1. `x-vercel-forwarded-for`
2. `x-forwarded-for`
3. `x-real-ip`

While this is fine on trusted infrastructure that guarantees canonical forwarded headers, fallback to generic forwarding headers can be spoofed in non-Vercel or misconfigured proxy setups.

## Impact

- Security behavior depends on deployment/network assumptions not encoded in code.
- In less strict ingress setups, attackers can rotate spoofed IP headers to dilute per-IP limits.
- Affects public routes relying on IP throttling:
  - `/api/stripe/webhook`
  - `/api/webhooks/clerk`
  - `/api/health`

## Evidence

- Header selection logic: `lib/request-ip.ts:1-10`
- Stripe webhook limiter key: `app/api/stripe/webhook/handler.ts:39-45`
- Clerk webhook limiter key: `app/api/webhooks/clerk/handler.ts:56-62`
- Health limiter key: `app/api/health/handler.ts:15-26`

## Resolution

Harden trust model explicitly:

1. Prefer a deployment-trusted header only (for example, Vercel canonical header) in production.
2. Gate fallback header parsing to local development/test environments.
3. Document and test expected behavior per environment.
4. Optionally support signed proxy headers when self-hosting.

## Verification

- [ ] Production mode ignores spoofable fallback headers
- [ ] Local dev behavior remains usable
- [ ] Route tests assert trust-boundary behavior for IP extraction

## Related

- `docs/specs/master_spec.md` (rate limiting + public API sections)
- `src/adapters/shared/rate-limits.ts`
