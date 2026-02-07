# DEBT-140: Request Correlation Is Defined but Not Wired Into Runtime Logs

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-07

---

## Description

The architecture docs define request-level correlation (`requestId`) for logs, but runtime logging paths did not propagate request context.

## Resolution (2026-02-07)

Wired `createRequestContext()` + `getRequestLogger()` from `lib/request-context.ts` into all entry points:

1. **Stripe webhook** (`app/api/stripe/webhook/route.ts`) — creates request-scoped logger via container override
2. **Clerk webhook** (`app/api/webhooks/clerk/route.ts`) — creates request-scoped logger via container override
3. **Health check** (`app/api/health/route.ts`) — creates request-scoped logger directly
4. **Subscribe actions** (`app/pricing/subscribe-actions.ts`) — creates request-scoped logger for error logging

Every log emitted by these paths now includes a `requestId` field for incident forensics.

## Verification

- [x] Entry routes/actions create and propagate `requestId`
- [x] Logs from a single request share the same `requestId`
- [x] `pnpm typecheck` and `pnpm test --run` pass

## Related

- `lib/request-context.ts`
- `lib/logger.ts`
- `app/api/stripe/webhook/route.ts`
- `app/api/webhooks/clerk/route.ts`
- `app/api/health/route.ts`
- `app/pricing/subscribe-actions.ts`
