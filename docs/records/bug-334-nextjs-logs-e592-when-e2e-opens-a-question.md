# BUG-334: Next.js Logs Invariant E592 When E2E Opens a Question

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — upstream Next.js bug (vercel/next.js#99500); no failed request found; the owner's production check and the Next.js fix remain
**Priority:** P3
**Date:** 2026-10-09
**Resolved:** —
**Verification receipts:** —

## Summary

During required E2E, the `next start` server logs this error twice per run,
while `tests/e2e/cross-page-navigation.spec.ts` opens a question's detail page
from Dashboard or History:

```text
Error [InvariantError]: Invariant: postponed state should not be provided when fallback params are provided. This is a bug in Next.js.
```

The error is Next.js's E592, raised inside Next.js. In a traced run every request
returned 200 and the browser navigated without a reload, so no failure reaches
the test's user. Whether a real user can hit it on Vercel is not yet shown.

## Evidence

- **How often.** Four of five local E2E runs in one clone from 2026-10-08 to
  2026-10-09 logged it twice, on Next.js 16.3.6 and 16.3.8. Every run in
  another clone on 16.3.8 did too. The suite passed each time.
- **Traced run** (2026-10-09 21:30Z, Next.js 16.3.8, `next start`,
  `cross-page-navigation.spec.ts` 5 of 5, six errors). Every `/app/questions/*`
  request returned 200: the document requests, the segment prefetches
  (`x-nextjs-cache: MISS`, `x-nextjs-postponed: 2`), the navigation's RSC
  request and the Server Action posts. The browser made no document request
  for the detail page and no retry. Which request throws is not proven: six
  errors do not pair with about fifteen prefetch misses, and no server
  timestamps were captured.
- **The route.** `app/(app)/app/questions/[slug]` has no `generateStaticParams`.
  With `cacheComponents: true`, the build emits it as a partial-prerender shell
  with `slug` as a fallback parameter (`prerender-manifest.json`:
  `routeType: "shell"`, `compute: "resuming"`).
- **The code** (Next.js 16.3.8). `server/app-render/app-render.js` throws E592
  when a render receives both a postponed state and fallback route parameters.
  Outside minimal mode, `build/templates/app-page-runtime.js` loads the
  postponed state from the incremental cache for a dynamic RSC request or a
  Server Action. It also creates fallback route parameters when a request's
  parameters are still placeholders.
- **Upstream.** [vercel/next.js#99500](https://github.com/vercel/next.js/issues/99500),
  open since 2026-09-30, reports E592 for RSC and form requests to a literal
  `[slug]` URL under `next start`, still on 16.4.0-canary.53. The closed
  [#98647](https://github.com/vercel/next.js/issues/98647) reports that on
  Vercel, a resume of a fallback shell can arrive with the parameter still a
  placeholder and fail with a 500.
- **Production.** Vercel's runtime-error groups for the seven days to
  2026-10-09 hold no E592: only a Clerk handshake 404 and one user-upsert
  conflict. That is weak evidence, because production sees little `/app`
  traffic, and the Hobby plan keeps request logs for an hour. Sentry was not
  checked.

## Impact

- **Users:** none known. If #98647's resume path applied here, opening a
  question on Vercel would fail, which the owner would likely have seen; the
  production check below settles it.
- **Tests:** the error is noise in every E2E run's server output. The suite
  does not fail on server errors, so a real one in the same output would also
  go unnoticed.

## Options

1. **Change our route to avoid the path.** A sentinel `generateStaticParams`
   (the #98647 reporter's workaround) or no `cacheComponents` would change how
   every question page renders, to silence a log line. Not justified while no
   request fails.
2. **Wait for upstream.** Take the Next.js release that fixes #99500, then
   confirm a local E2E run logs no E592.
3. **Make server errors visible in E2E.** Fail the run, or list the errors in
   its summary, when the web server logs an error not named in a short
   known-noise list that links here.

## Resolution (proposed)

Option 2, after the production check. Option 3 is an owner decision: it would
have raised this error when it first appeared, at the cost of keeping the list.

## Checklist

- [ ] Owner: on production, open a question from Dashboard, then within the
      hour search Vercel's runtime logs, and Sentry, for "postponed state".
      For each hit, find the request that logged it and its status. A failed
      response, or a page that did not load, raises this to P1. A hit on a
      request that succeeded is the same noise as in E2E.
- [ ] Owner decision: option 3.
- [ ] A Next.js release fixes vercel/next.js#99500; after taking it, a local
      E2E run logs no E592.
