# BUG-228: Client Sentry Ingest Is Blocked by Clerk-Owned CSP

**Status:** Open — Confirmed active in Production
**Priority:** P1
**Date:** 2026-03-16
**Confirmed:** 2026-03-17

## Summary

Browser-side Sentry reporting is configured but cannot send events because the `Content-Security-Policy` header emitted by Clerk middleware omits the Sentry ingest origin from `connect-src`.

The app has two layers of Sentry setup:

1. **Server-side** (`instrumentation.ts`) — works fine. Server HTTP requests are not subject to browser CSP.
2. **Client-side** (`sentry.client.config.ts` + `lib/report-client-error.ts`) — broken. The browser SDK initializes, but every outbound `fetch()` to the Sentry ingest endpoint is rejected by the browser's CSP enforcement before it leaves the page.

Result: client-side errors look "reported" in code but are silently dropped at runtime. Server-side Sentry is unaffected.

## Verification That This Is a Real, Active Bug

This bug was initially filed on 2026-03-16 by an agent-browser sweep. On 2026-03-17, a manual investigation confirmed every claim through static code analysis and Vercel environment inspection:

### 1. Vercel env vars confirm the DSN is live everywhere

Ran `vercel link` (temporarily, on clone-2) then `vercel env ls`. The output shows:

| Variable | Environments | Added |
|----------|-------------|-------|
| `NEXT_PUBLIC_SENTRY_DSN` | Development, Preview, **Production** | ~22 days ago |
| `SENTRY_DSN` | Development, Preview, **Production** | ~22 days ago |

Both DSNs are set on all three Vercel environments. This means the client Sentry SDK initializes on every production page load.

### 2. Code analysis confirms the CSP gap

- **`proxy.ts:10-12`** — the app's custom CSP directives only add `['ws:', 'wss:']` to `connect-src`
- **Clerk merges (does not replace)** its own defaults into these directives — confirmed via [Clerk's source code](https://github.com/clerk/javascript/blob/main/packages/nextjs/src/server/content-security-policy.ts) and [Clerk's CSP docs](https://clerk.com/docs/guides/secure/best-practices/csp-headers). Clerk adds: `'self'`, `clerk-telemetry.com`, `*.clerk-telemetry.com`, `api.stripe.com`, `maps.googleapis.com`, `img.clerk.com`, `images.clerkstage.dev`, plus the dynamic Clerk FAPI host
- **Neither the app nor Clerk** adds any Sentry domain to `connect-src`
- **`sentry.client.config.ts:5`** — the browser SDK eagerly initializes when `NEXT_PUBLIC_SENTRY_DSN` is truthy (which it is, everywhere)

### 3. Sentry's own docs confirm the failure mode

[Sentry's CSP documentation](https://docs.sentry.io/platforms/javascript/guides/nextjs/security-policy-reporting/) states the ingest domain must be in `connect-src` or the browser will block requests. When blocked:

- The SDK initializes normally — no error at init time
- `Sentry.captureException()` returns without throwing
- The underlying `fetch()` is rejected by the browser before it leaves the page
- The browser console shows a CSP violation, but the calling code (e.g. `reportClientError()`) has no idea the event was dropped

### 4. CI has no coverage for this

`ci.yml` does not set `NEXT_PUBLIC_SENTRY_DSN` or `SENTRY_DSN` in any job. Sentry is completely disabled in CI. There is no automated test that would catch this CSP gap.

## Impact

- **Client error reporting has been silently dead in Production for ~22 days** (since the DSNs were added to Vercel)
- **Server-side Sentry is fine** — `instrumentation.ts` reports server errors normally since server HTTP requests bypass browser CSP
- **`reportClientError()` is a no-op in the browser** — the function runs, calls `Sentry.captureException()`, which silently fails to send
- **SPEC-016 client-side acceptance is unmet** — the configured browser observability path never reaches Sentry

## Steps to Reproduce

1. Confirm `NEXT_PUBLIC_SENTRY_DSN` is set (it is, on all Vercel environments and in `.env.local`)
2. Start the app locally with Clerk enabled: `pnpm dev`
3. Load any page that initializes the client bundle (e.g. `/sign-in`, `/app/dashboard`)
4. Open the browser console
5. Observe the CSP violation error blocking the Sentry ingest URL

Or, without running the app:

1. Read `proxy.ts:10-17` — note `connect-src` has no Sentry domain
2. Read `sentry.client.config.ts:5` — note the SDK inits when DSN is present
3. Run `vercel env ls` — note `NEXT_PUBLIC_SENTRY_DSN` is set on Production
4. Conclude: SDK inits, CSP blocks, events drop silently

## Root Cause

`proxy.ts` passes custom CSP directives to Clerk's `clerkMiddleware`:

```ts
const CLERK_CSP_DIRECTIVES = {
  // ...
  'connect-src': ['ws:', 'wss:'],
  // ...
};
```

Clerk merges its own required sources into `connect-src` (clerk-telemetry, stripe, google maps, etc.), but Sentry is not a Clerk integration. Nobody adds the Sentry ingest origin.

Meanwhile, `sentry.client.config.ts` eagerly initializes the browser SDK when a DSN exists. The SDK is "on" but its transport is blocked.

## Affected Files

| File | Role in Bug |
|------|-------------|
| `proxy.ts:10-12` | CSP `connect-src` does not include Sentry ingest domain |
| `sentry.client.config.ts:5` | Browser SDK initializes eagerly when DSN is present |
| `lib/report-client-error.ts` | Calls `Sentry.captureException()` which silently fails to send |
| `instrumentation.ts` | Server-side Sentry — NOT affected (no CSP on server requests) |

## Fix

Keep CSP ownership delegated to Clerk middleware, but extend the app's `connect-src` to include Sentry ingest.

Two approaches:

1. **Parse `NEXT_PUBLIC_SENTRY_DSN` at middleware init time** and extract its origin (e.g. `https://o4508933259198464.ingest.us.sentry.io`) to add to `connect-src`. Tightest CSP — only allows the exact ingest host.
2. **Add a constrained wildcard** like `https://*.ingest.us.sentry.io`. Slightly broader but simpler and resilient to DSN changes.

## Verification Checklist

- [ ] Response `Content-Security-Policy` includes the Sentry ingest origin in `connect-src`
- [ ] Browser console no longer shows CSP violations for Sentry transport requests
- [ ] A forced client-side exception reaches Sentry from a real browser session
- [ ] Existing Clerk and Stripe flows still load without new CSP regressions
- [ ] Server-side Sentry continues to work (regression guard)

## Related

- `proxy.ts`
- `sentry.client.config.ts`
- `lib/report-client-error.ts`
- `instrumentation.ts`
- `docs/specs/spec-016-observability.md`
- [DEBT-286](../_archive/debt/debt-286-client-side-error-reporting.md)
- [BUG-071](../_archive/bugs/bug-071-nextjs-preview-blank-page-csp.md) — prior CSP regression; the fix must preserve Clerk-owned CSP strategy
