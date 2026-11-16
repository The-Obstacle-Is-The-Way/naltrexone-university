# BUG-334: Next.js Logs Invariant E592 When E2E Opens a Question

**Status:** Verifying — E592 ended with Next.js 16.4.1; option 3 is declined; closes as Resolved in this pull request; due 2026-11-22
**Priority:** P3
**Date:** 2026-10-09

---

## Summary

On Next.js 16.3.6 and 16.3.8, the `next start` server in required E2E logged
this error twice per run, while `tests/e2e/cross-page-navigation.spec.ts`
opened a question's detail page from Dashboard or History:

```text
Error [InvariantError]: Invariant: postponed state should not be provided when fallback params are provided. This is a bug in Next.js.
```

The error is Next.js's E592, raised inside Next.js. In a traced run every
request returned 200, so no failure reached the test's user. It stopped with
the Next.js 16.4.1 upgrade (41809515, 2026-10-14), and no run since has logged it.

## Evidence

- **Before.** CI logs of the push runs on `main` from 2026-10-08 to 2026-10-14:
  15 of 28 runs on 16.3.6 and 16.3.8 logged E592, twice each. Local runs on
  16.3.x logged it in most runs.
- **After.** 0 of 30 push runs on `main` on 16.4.1 to 16.4.3 (2026-10-15 to
  2026-11-08), and 0 of the 58 required E2E executions after them, to
  2026-11-15, on 16.4.3 to 16.4.5. Five of the 16.4.1 runs predate
  `partialPrefetching: false` (d97d2dcc, DEBT-522), so the upgrade, not that
  setting, ended it. CI prints the server's output (`[WebServer]` lines), so an
  E592 would show.
- **The route.** `app/(app)/app/questions/[slug]` has no `generateStaticParams`;
  with `cacheComponents: true` it is a partial-prerender shell with `slug` as a
  fallback parameter.
- **Upstream.** vercel/next.js#99500 (E592 for requests to a literal `[slug]`
  URL under `next start`) is still open. A comment of 2026-11-04 says #101106
  fixed that path by limiting placeholder detection to minimal mode. 16.4.5
  ships the matching security fix (GHSA-vvgp-ww4w-46vf), and its
  `app-page-runtime.js` gates that detection on minimal mode. vercel/next.js#101144
  tracks a separate minimal-mode case with host rewrites, which this app does
  not use.
- **Production.** Vercel's runtime-error groups held no E592 for the seven days
  to 2026-10-09, nor for the seven days to 2026-11-15 (three Clerk groups only).
  A render error there would also reach Sentry through `onRequestError`
  (`instrumentation.ts:28`).

## Impact

None now. It was log noise in E2E; no user failure was found.

## Options

1. Change the route to avoid the path (a sentinel `generateStaticParams`, or no
   `cacheComponents`). Not needed.
2. Wait for upstream. The 16.4.1 upgrade ended it.
3. Fail E2E, or list errors in its summary, when the web server logs an error
   not on a known-noise list. Proposed for decline with this closure: it was
   proposed to catch this error, which no longer occurs, and the list would need
   upkeep for the errors E2E provokes on purpose.

## Resolution (decided)

Option 2, done by the 16.4.1 upgrade. The owner's production check is no longer
needed: the E2E signal that prompted it is gone, and production's error groups
and Sentry would record a render failure.

## Verification

- [x] CI E2E logs no E592 after the upgrade (2026-11-15: 0 in 88 runs on
      16.4.1 to 16.4.5).
- [x] Production's runtime-error groups hold no E592 (2026-11-15, seven days).
- [x] Option 3 declined 2026-11-15 by the reviewing session, at the owner's delegation: the error it was meant to catch is gone, and its known-noise list would need upkeep.

## Related

- BUG-337: its 2026-10-11 server output held no E592 either.
- DEBT-522: `partialPrefetching`.

Corrected 2026-11-15: Next.js is 16.4.5; E592 ended with 16.4.1, per CI logs before and after; production checked again; the owner's production check is withdrawn; option 3 is proposed for decline. Finished investigation detail is in git at 34d9aea0.
