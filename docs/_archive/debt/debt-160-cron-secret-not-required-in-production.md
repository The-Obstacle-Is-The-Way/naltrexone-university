# DEBT-160: CRON_SECRET Not Enforced as Required in Production

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07
**Resolved:** 2026-02-08

---

## Description

The cron route handles a missing `CRON_SECRET` by returning 503, which is correct. However:

1. `.env.example` marks `CRON_SECRET` as optional ("Leave unset unless enabling cron routes")
2. The cron route IS deployed and reachable — there's no feature flag to disable it
3. If a developer follows `.env.example` guidance and deploys without setting `CRON_SECRET`, the endpoint returns 503 but is still publicly accessible

There is no startup-time validation that would prevent a deployment without `CRON_SECRET` when the route is present.

## Impact

- Accidental deployment without CRON_SECRET leaves the reconciliation endpoint in a degraded state (503 for all requests)
- A missing CRON_SECRET is only discovered at request time, not at deployment
- Misleading documentation could cause production misconfiguration

## Resolution

Implemented both documentation and runtime enforcement:

1. Updated `.env.example` to mark `CRON_SECRET` as required in production runtime
2. Added import-time env validation in `lib/env.ts`:
   - when `isProductionRuntime === true`, missing `CRON_SECRET` now fails startup with `Invalid environment variables`
3. Added regression test in `lib/env.test.ts` for non-Vercel production runtime

## Verification

- [x] `.env.example` updated to mark CRON_SECRET as required
- [x] Startup validation for production deployments

## Related

- `app/api/cron/reconcile-stripe-subscriptions/route.ts:45-55`
- `.env.example:54-56`
