# DEBT-135: Rate-Limit Client IP Trust Boundary Is Not Explicitly Hardened

**Status:** Resolved
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

Hardened the trust model in `lib/request-ip.ts`:

1. Production (`NODE_ENV=production`) now trusts only `x-vercel-forwarded-for`.
2. Fallback parsing of `x-forwarded-for` and `x-real-ip` is limited to non-production environments.
3. Added regression tests in `lib/request-ip.test.ts` for environment-specific behavior.

## Verification

- [x] Production mode ignores spoofable fallback headers
- [x] Local dev behavior remains usable
- [x] Route tests assert trust-boundary behavior for IP extraction

## Related

- `docs/specs/master_spec.md` (rate limiting + public API sections)
- `src/adapters/shared/rate-limits.ts`
