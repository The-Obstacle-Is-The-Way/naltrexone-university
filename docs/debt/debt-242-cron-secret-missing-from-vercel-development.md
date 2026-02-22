# DEBT-242: CRON_SECRET Missing From Vercel Development Environment

**Status:** Open
**Priority:** P3
**Date:** 2026-02-22

---

## Description

`CRON_SECRET` is configured in Vercel Preview and Production environments but is **missing from the Vercel Development environment**. This causes the reconcile-stripe-subscriptions cron endpoint to return HTTP 503 in dev deployments.

### Current State

| Environment | `CRON_SECRET` | Cron Endpoint Status |
|-------------|---------------|---------------------|
| `.env.local` | Not set | N/A (not used locally) |
| Vercel Development | **Missing** | **503 Service Unavailable** |
| Vercel Preview | Set | Operational |
| Vercel Production | Set | Operational |

### How It Works

The cron endpoint (`app/api/cron/reconcile-stripe-subscriptions/route.ts`) validates the secret at request time:

```typescript
// lib/env.ts line 65
CRON_SECRET: z.string().min(1).optional()
```

- If `CRON_SECRET` is missing: endpoint returns HTTP 503
- If `CRON_SECRET` is present but token doesn't match: endpoint returns HTTP 401
- The field is deliberately marked `optional()` in the Zod schema, so the app starts fine without it

### Assessment

This may be **intentional** — cron reconciliation in dev deployments may not be needed. However, it should be explicitly documented either way.

## Impact

- **Low:** The cron endpoint is not user-facing. It runs on a Vercel cron schedule and only affects background subscription reconciliation.
- **Dev parity gap:** Dev deployments behave differently from Preview/Production for this endpoint.
- **Debugging friction:** If someone tests the cron flow against a dev deployment, it silently fails with 503.

## Resolution

**Option A (Add it):** Add `CRON_SECRET` to Vercel Development environment:
```bash
vercel env add CRON_SECRET development
```

**Option B (Document it):** Add a note to `docs/dev/deployment-environments.md` explaining that `CRON_SECRET` is intentionally omitted from Development because cron jobs don't run in dev deployments.

Recommend **Option A** for environment parity, unless there's a specific reason to exclude it.

## Verification

- If Option A: Verify the cron endpoint returns 200 (with valid token) in a dev deployment
- If Option B: Verify documentation is updated and the 503 behavior is noted

## Related

- `app/api/cron/reconcile-stripe-subscriptions/route.ts` — the cron endpoint
- `lib/env.ts` — Zod schema with `CRON_SECRET` as optional
- [DEBT-160](../_archive/debt/debt-160-cron-secret-not-required-in-production.md) — earlier debt about CRON_SECRET enforcement (resolved 2026-02-08)
- Discovered during Vercel environment audit (DEBT-239 session)
