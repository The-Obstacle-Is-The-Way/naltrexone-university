# BUG-363: The Home Page's Resume Render Can Fail to Match Its Prerender

**Status:** Open — moves to a Waiting row: the cause is unknown, and 8 events in 33 days came from one old Chrome 131 client with no signed-in user
**Priority:** P3
**Date:** 2026-10-21

---

## Summary

Sentry's server issue ADDICTION-BOARDS-SERVER-2 records unhandled errors on `POST /`: "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering". With `cacheComponents` on, the home page is a partial prerender. React raises this error when the tree it renders on resume does not match the prerendered shell, and then renders that part in the browser, so the page still works.

BUG-319 took the same error, seen 12 times from 2026-04-21 to 2026-09-26, for skew between builds. The cause is unknown.

## Evidence

- **Sentry, read 2026-11-15 through its API** (tags and header names only): 8 events, none from a signed-in user.
  - 3 on 2026-10-13, from release `f66056bd` on Next.js 16.3.8, each from Chrome 131, two on Linux and one on macOS. They have aged out of the event list; these facts were read on 2026-10-21.
  - 5 from 2026-11-02 11:13Z to 2026-11-04 09:12Z, on four releases running Next.js 16.4.2 and 16.4.3, each from Chrome 131 on Linux, and each 1.5 to 24 hours after its promotion. None since, to 2026-11-15. So the error is not a Next.js 16.3.8 defect that 16.4 removed.
  - Chrome 131 dates from late 2024. One old version across every event suggests one automated client.
  - The web project has no matching issue.
- **The captured requests.** All five are `POST /index` with a `next-action` header and no `next-resume` header. Next.js 16.4.5 treats a request as a resume only for a `POST` with `next-resume: 1` in minimal mode (`node_modules/next/dist/server/base-server.js:647`). Whether that header is stripped before Sentry captures the request, or the error arises on a server-action path, is not settled.
- **Server actions on `/`.** The app's own actions live under `/app` and `/pricing`. The root layout's `ClerkProvider` ships Clerk's `invalidateCacheAction`, so a `next-action` POST to `/` can come from Clerk's client as well as from a probe.
- **The page.** `app/page.tsx` and `components/marketing/` last changed on 2026-09-22. The request-time parts sit inside `Suspense`: the get-started call to action (`components/marketing/marketing-home.tsx:305-307`), the header's sign-in navigation (`components/marketing/marketing-layout.tsx:155-157`), and the root layout's `x-nonce` read (`app/layout.tsx:75`). Since BUG-378 (promotion #1694, 2026-11-15) nothing sets `x-nonce`, so the read returns nothing unless a client sends the header; the five events predate that and carry it.
- **Unverified explanations:**
  1. Something in the shell renders differently at request time than at build time, for some requests.
  2. The request carried state from another build (BUG-319's skew). Each event came within a day of a promotion, but so would most requests, since promotions are almost daily.

## Impact

For each request affected, React renders the home page's dynamic part in the browser instead of streaming it from the server: the page works, a little later. All 8 events came from one client signature with no signed-in user, so possibly no person saw them. Each is an unhandled error, counted against Sentry's error quota.

## Options

1. **Investigate.** Reproduce locally against a production build in minimal mode, with Chrome 131's user agent and a `next-action` POST to `/`, and search Next.js's issues for this error on action requests.
2. **Filter the error in the server's `beforeSend`.** Only once the cause is known: if explanation 1 holds, a filter would hide a real rendering difference.
3. **Accept it,** with a trigger.

## Resolution (decided)

Option 3, chosen 2026-11-15. Option 1 rebuilds Vercel's minimal mode by hand for an error one old client raised, while the page still works. The record moves to a Waiting row: revive it when ADDICTION-BOARDS-SERVER-2 records an event from a signed-in user or from a browser other than Chrome 131, or more than 10 events in a week.

## Verification

- [x] The checks that could not be made are recorded, and an option is chosen (due 2026-11-04; done 2026-11-15). Not made: a local minimal-mode reproduction, the October events' request headers, which have aged out, and which build a resumed shell came from.

## Related

- BUG-319: first recorded the error, as probable skew; its Waiting row holds Skew Protection.
- BUG-378: removed the CSP nonce.
- DEBT-522: the root layout's `x-nonce` read and partial prefetching.

Corrected 2026-11-15: Sentry now holds 8 events, 5 of them on Next.js 16.4.2 and 16.4.3 (2026-11-02 to 11-04), which rules out the 16.3.8 explanation. Their requests carry `next-action` and no `next-resume` header, and nothing has set `x-nonce` since BUG-378. The lapsed 2026-11-04 step is done by recording what could not be checked, and option 3 moves the record to Waiting. The 2026-10-21 sampling estimate and the ingestion check are in git at 34d9aea0.
