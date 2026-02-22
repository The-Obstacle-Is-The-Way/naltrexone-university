# DEBT-241: Sentry DSN Missing From All Vercel Environments

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-22
**Resolved:** 2026-02-22

---

## Description

Neither `NEXT_PUBLIC_SENTRY_DSN` nor `SENTRY_DSN` was configured in any Vercel environment (Development, Preview, or Production). Error tracking was silently disabled in all deployed environments.

The Sentry SDK was installed and configured, and the DSN existed in `.env.local` for local development — but it was never added to Vercel.

### Root Cause

When Sentry was originally set up (DEBT-101, resolved 2026-02-05), the SDK and config files were added to the codebase but the DSN was only set in `.env.local`. Nobody added the env vars to Vercel.

### Why It Was Silent

The Sentry initialization guards against missing DSN:
- **Client** (`sentry.client.config.ts`): `if (dsn) { Sentry.init({...}) }` — silently skips
- **Server** (`instrumentation.ts`): `if (!dsn) { return; }` — silently skips
- The DSN is **not** in the Zod env schema (`lib/env.ts`), so the app starts without error

## Resolution

Added both `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` to all three Vercel environments via CLI:

```bash
printf '%s' '<dsn>' | vercel env add NEXT_PUBLIC_SENTRY_DSN production --yes --force
printf '%s' '<dsn>' | vercel env add NEXT_PUBLIC_SENTRY_DSN preview --yes --force
printf '%s' '<dsn>' | vercel env add NEXT_PUBLIC_SENTRY_DSN development --yes --force
printf '%s' '<dsn>' | vercel env add SENTRY_DSN production --yes --force
printf '%s' '<dsn>' | vercel env add SENTRY_DSN preview --yes --force
printf '%s' '<dsn>' | vercel env add SENTRY_DSN development --yes --force
```

All six env vars confirmed via `vercel env ls`.

### Remaining Follow-Up

The sample rates are still set to 0:
- `tracesSampleRate: 0`
- `replaysSessionSampleRate: 0`
- `replaysOnErrorSampleRate: 0`

These should be tuned for production. At minimum, `replaysOnErrorSampleRate` should be set to `1.0` to capture session replays when errors occur. This is a separate task — the DSN wiring is now complete.

**Important:** Since `NEXT_PUBLIC_SENTRY_DSN` is a `NEXT_PUBLIC_*` variable, it's inlined at build time. A fresh deployment (not `vercel redeploy`) is required for production to pick it up. Push any commit to trigger a fresh build.

## Verification

- [x] `vercel env ls` shows all six Sentry vars across all environments
- [ ] Trigger a test error in a preview deployment and confirm it appears in Sentry dashboard (requires fresh deployment)
- [ ] Verify Sentry dashboard shows events from production (requires fresh deployment)

## Related

- `sentry.client.config.ts` — client-side Sentry initialization (uses `NEXT_PUBLIC_VERCEL_ENV` for environment tagging)
- `instrumentation.ts` — server-side Sentry initialization (uses `VERCEL_ENV` for environment tagging)
- `lib/env.ts` — Zod schema (DSN not included — could be added as required field in future)
- [DEBT-101](../_archive/debt/debt-101-add-sentry-error-tracking.md) — original Sentry setup (resolved 2026-02-05)
