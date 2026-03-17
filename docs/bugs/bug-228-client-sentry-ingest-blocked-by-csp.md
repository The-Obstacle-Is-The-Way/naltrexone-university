# BUG-228: Client Sentry Ingest Is Blocked by Clerk-Owned CSP

**Status:** Open
**Priority:** P2
**Date:** 2026-03-16

## Summary

Browser-side Sentry reporting is configured but cannot send events because the emitted `Content-Security-Policy` omits the Sentry ingest origin from `connect-src`.

This breaks the current client-side observability path:

- `sentry.client.config.ts` initializes the browser SDK when `NEXT_PUBLIC_SENTRY_DSN` is present
- `lib/report-client-error.ts` funnels caught client-side operational failures into `Sentry.captureException(...)`
- the browser then rejects the outbound request before it leaves the page

Result: client-side errors look "reported" in code but are silently dropped at runtime.

## Impact

- **Client observability is effectively disabled** whenever a browser page tries to send an event
- **SPEC-016 acceptance is undermined in practice** because the configured browser path never reaches Sentry
- **Recent client-side reporting work is partially nullified** because `reportClientError()` cannot deliver captured exceptions
- **Failures are silent in production UX** unless someone actively checks browser console output or Sentry dashboards for missing events

## Steps to Reproduce

1. Ensure `NEXT_PUBLIC_SENTRY_DSN` is configured
2. Start the app locally with Clerk enabled: `pnpm dev`
3. Load any browser page that initializes the client bundle, such as `/sign-in` or `/app/dashboard`
4. Open the browser console
5. Observe the blocked request error for the Sentry ingest endpoint

## Browser-Verified Findings

- `sentry.client.config.ts` initializes Sentry whenever `NEXT_PUBLIC_SENTRY_DSN` is non-empty
- Local `.env.local` has both `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` configured
- The response header for `http://localhost:3000/sign-in` emits:
  - `connect-src 'self' https://clerk-telemetry.com https://*.clerk-telemetry.com https://api.stripe.com https://maps.googleapis.com https://img.clerk.com https://images.clerkstage.dev infinite-jaguar-35.clerk.accounts.dev ws: wss:`
- That header does **not** include the configured Sentry ingest host (or any wildcard covering `*.ingest.us.sentry.io`)
- Browser console on an authenticated dashboard load reports:
  - a CSP violation blocking the configured Sentry ingest URL
  - a failed `fetch` because the page refused the connection under CSP

## Root Cause

`proxy.ts` delegates baseline CSP generation to Clerk middleware and only adds a narrow `connect-src` override:

```ts
'connect-src': ['ws:', 'wss:']
```

Clerk merges its own required sources into the final response, but Sentry is not one of Clerk's known integrations. The resulting header covers Clerk, Stripe, Maps, and websocket development traffic, but it never whitelists the app's Sentry ingest endpoint.

At the same time, `sentry.client.config.ts` eagerly initializes the browser SDK when a DSN exists. The code path is therefore "enabled" while the network policy forbids the transport it needs.

## Affected Files

| File | Issue |
|------|-------|
| `proxy.ts` | Clerk CSP override does not allow Sentry ingest traffic in `connect-src` |
| `sentry.client.config.ts` | Browser SDK initializes and attempts to send events through a transport the CSP blocks |
| `lib/report-client-error.ts` | Calls into Sentry succeed locally in code but never reach the network destination |

## Stopgap Fix

Keep CSP ownership delegated to Clerk middleware, but extend the app-specific `connect-src` allowances to include Sentry ingest.

Two safe approaches:

1. Parse `NEXT_PUBLIC_SENTRY_DSN` and add its origin to `connect-src`
2. Add a constrained wildcard such as `https://*.ingest.us.sentry.io` if that matches the team's Sentry tenancy policy

The first option is tighter and avoids broadening CSP more than necessary.

## Verification

- [ ] Response `Content-Security-Policy` includes the configured Sentry ingest origin in `connect-src`
- [ ] Browser console no longer shows CSP violations for Sentry transport requests
- [ ] A forced client-side exception reaches Sentry from a real browser session
- [ ] Existing Clerk and Stripe flows still load without new CSP regressions

## Related

- `proxy.ts`
- `sentry.client.config.ts`
- `lib/report-client-error.ts`
- `docs/specs/spec-016-observability.md`
- [DEBT-286](../_archive/debt/debt-286-client-side-error-reporting.md)
- [BUG-071](../_archive/bugs/bug-071-nextjs-preview-blank-page-csp.md) — prior CSP regression; relevant because the fix must preserve Clerk-owned CSP strategy
