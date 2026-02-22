# DEBT-241: Sentry DSN Missing From All Vercel Environments

**Status:** Open
**Priority:** P2
**Date:** 2026-02-22

---

## Description

Neither `NEXT_PUBLIC_SENTRY_DSN` nor `SENTRY_DSN` is configured in any Vercel environment (Development, Preview, or Production). This means **error tracking is silently disabled in all deployed environments**.

The Sentry SDK is installed, configured in `sentry.client.config.ts` and `instrumentation.ts`, and the DSN exists in `.env.local` for local development — but it was never added to Vercel.

### Current State

| Environment | `NEXT_PUBLIC_SENTRY_DSN` | `SENTRY_DSN` | Error Tracking Active? |
|-------------|--------------------------|--------------|------------------------|
| `.env.local` | Set | Set | Yes (local only) |
| Vercel Development | **Missing** | **Missing** | **No** |
| Vercel Preview | **Missing** | **Missing** | **No** |
| Vercel Production | **Missing** | **Missing** | **No** |

### Why It's Silent

The Sentry initialization code guards against missing DSN:

- **Client** (`sentry.client.config.ts`): `if (dsn) { Sentry.init({...}) }` — silently skips
- **Server** (`instrumentation.ts`): `if (!dsn) { return; }` — silently skips
- The DSN is **not** in the Zod env schema (`lib/env.ts`), so the app starts without error

Additionally, all sample rates are currently set to 0:
- `tracesSampleRate: 0`
- `replaysSessionSampleRate: 0`
- `replaysOnErrorSampleRate: 0`

Even after adding the DSN, the sample rates would need to be tuned for actual error capture.

## Impact

- **No production error visibility:** Runtime errors in production are invisible. Users may encounter bugs with no signal reaching the team.
- **No preview error visibility:** Preview deployments (PR reviews) also lack error tracking.
- **False confidence:** Sentry is "set up" in the codebase but provides zero value in deployed environments.

## Resolution

1. Add `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` to all Vercel environments via Vercel Dashboard or CLI:
   ```bash
   vercel env add NEXT_PUBLIC_SENTRY_DSN production preview development
   vercel env add SENTRY_DSN production preview development
   ```
   Value: `https://8283ca0e4e6a0414f2c7cba18660c34f@o4508933259198464.ingest.us.sentry.io/4510829539164160`

2. Update sample rates for production (at minimum):
   - `replaysOnErrorSampleRate: 1.0` (capture replays when errors occur)
   - `tracesSampleRate: 0.1` (sample 10% of traces, adjust based on volume)

3. Redeploy to pick up the new env vars

4. Optionally add `SENTRY_DSN` to the Zod env schema in `lib/env.ts` as a required field so missing DSN causes a startup error instead of silent skip

## Verification

- Trigger a test error in a preview deployment and confirm it appears in Sentry dashboard
- Verify Sentry initialization logs in production deployment
- Check Sentry dashboard shows events flowing from production

## Related

- `sentry.client.config.ts` — client-side Sentry initialization
- `instrumentation.ts` — server-side Sentry initialization
- `lib/env.ts` — Zod env schema (DSN not included)
- [DEBT-101](../_archive/debt/debt-101-add-sentry-error-tracking.md) — original Sentry setup debt (resolved 2026-02-05, but env vars never deployed)
