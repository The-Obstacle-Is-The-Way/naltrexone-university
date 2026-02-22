# DEBT-242: CRON_SECRET Missing From Vercel Development Environment

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-22
**Resolved:** 2026-02-22

---

## Description

`CRON_SECRET` was configured in Vercel Preview and Production environments but was missing from the Vercel Development environment. This caused an environment parity gap.

## Resolution

Added `CRON_SECRET` to Vercel Development environment via CLI, using the same value as Preview and Production:

```bash
printf '%s' '<secret>' | vercel env add CRON_SECRET development --yes --force
```

Confirmed via `vercel env ls` — CRON_SECRET now present in all three environments (Development, Preview, Production).

## Verification

- [x] `vercel env ls` shows CRON_SECRET across all three environments

## Related

- `app/api/cron/reconcile-stripe-subscriptions/route.ts` — the cron endpoint
- `lib/env.ts` — Zod schema with `CRON_SECRET` as optional
- [DEBT-160](../_archive/debt/debt-160-cron-secret-not-required-in-production.md) — earlier CRON_SECRET enforcement debt (resolved 2026-02-08)
