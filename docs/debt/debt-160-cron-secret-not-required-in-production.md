# DEBT-160: CRON_SECRET Not Enforced as Required in Production

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

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

1. Update `.env.example` to mark `CRON_SECRET` as required with clear instructions
2. Consider adding startup validation (e.g., in `lib/env.ts`) that requires `CRON_SECRET` when the cron route is present, or at minimum in production

## Verification

- [ ] `.env.example` updated to mark CRON_SECRET as required
- [ ] Optional: startup validation for production deployments

## Related

- `app/api/cron/reconcile-stripe-subscriptions/route.ts:45-55`
- `.env.example:54-56`
