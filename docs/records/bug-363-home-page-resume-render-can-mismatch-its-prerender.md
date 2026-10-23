# BUG-363: The Home Page's Resume Render Can Fail to Match Its Prerender

**Status:** Open — find why the resume render differs from the prerender, or record what could not be checked; due 2026-11-04
**Priority:** P3
**Date:** 2026-10-21

---

## Summary

Sentry's server project recorded three unhandled errors on `POST /` on 2026-10-13: "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering". With `cacheComponents` on, the home page is a partial prerender, and `POST /` is the resume request that renders its dynamic parts. React raises this error only while it replays a postponed render, so each of these requests was a resume. React raises this error when the tree it renders on resume does not match the prerendered shell. It then renders that part in the browser instead, so the page still works.

BUG-319 took the same error, seen 12 times from 2026-04-21 to 2026-09-26, for skew between builds, and expected it to stop once the server-action key was stable. It came back from a release that had been live for hours. Whether skew can still explain that is open, since nothing records which build the resumed shell came from or how long it was cached. The cause is unknown.

## Evidence

- **Sentry, read 2026-10-21 through its API** (counts and tags only):
  - 3 events, all in issue ADDICTION-BOARDS-SERVER-2, from 09:13:01Z to 15:31:45Z on 2026-10-13. None since, to 2026-10-21T14:50Z. The web project had none from BUG-319's production assignment (2026-10-05T22:24:30Z) to then. The server project exists since 2026-10-08.
  - All three were unhandled production events from release `f66056bd`, the merge of promotion #1481 at 01:45Z that day. The next promotion, #1485, merged at 16:17Z, after the last event.
  - None of the three had a signed-in user. Each reported Chrome 131, a 2024 version, two on Linux and one on macOS. One old version across two systems suggests an automated client.
  - At the server's 5% trace sample, Sentry kept two successful `POST /` resume transactions on that release. Two samples suggest on the order of 40 successful resumes; an exact 95% Poisson interval for two samples puts it between about 5 and 145. Sentry records every error event, so the three failures are a full count. Across that range, the three failures stay under half of all resumes, but their exact share is unknown. Because resumes also succeeded on that release, whatever differs likely depends on the request.
  - Ingestion was healthy: both projects accepted events every day, and nothing was rate-limited or dropped for quota.
- **The earlier issue,** ADDICTION-BOARDS-WEB-T (12 events, four releases, all on `POST /`), was deleted under BUG-318. Only the facts BUG-319 kept remain.
- **A resume needs minimal mode and the prerender's saved state.** Next.js treats a request as a resume only in minimal mode, as Vercel runs it, for a `POST` with the `next-resume: 1` header (`base-server.js`). The body must parse as the prerender's saved state, which is never sent to the browser. A body that does not parse is logged as "Failed to parse postponed state" and rendered without resuming (`postponed-state.js`), so it cannot raise this error. Checked in 16.4.1, and reported the same for 16.3.8.
- **The versions.** Release `f66056bd` ran Next.js 16.3.8. Production has run 16.4 since #1513 (2026-10-15), with no event since. At this rate, that silence proves little.
- **The page did not change.** Between promotions #1474 and #1485, `app/layout.tsx`, `app/page.tsx`, `components/marketing/`, `proxy.ts` and `next.config.ts` are unchanged.
- **The request-time parts.** `app/page.tsx` renders `MarketingHomeShell` (`components/marketing/marketing-home.tsx`). Its request-time parts are the get-started call to action and the header's sign-in navigation (`components/marketing/marketing-layout.tsx`), each inside a `Suspense` boundary. The root layout reads the request's CSP nonce from `headers()` (`app/layout.tsx`), also behind `Suspense`.
- **Unverified explanations:**
  1. For some requests, something in the shell renders differently at request time than at build time: a value read from the environment, the clock or the request outside a dynamic boundary, or a difference in what a particular client is sent.
  2. The resume carried saved state from another build, for example a shell cached from an earlier deployment. The events came seven to fourteen hours after the deploy, but nothing records the resumed shell's build or cache lifetime, so this is not ruled out.
  3. A defect in Next.js 16.3.8's resume that 16.4 changed.

## Impact

For each request affected, React renders the home page's dynamic part in the browser instead of streaming it from the server: the page works, a little later. The volume is low, 15 events in six months. None of the three recorded here had a signed-in user, and their clients look automated, so possibly no person saw them.

## Options

1. **Investigate first.** Reproduce a resume locally against a production build, sending Chrome 131's user agent, on 16.3.8 and on 16.4.1. The probe has to run Next.js in minimal mode, as Vercel does, and keep the `next-resume` header, which `next start` drops from outside requests unless `NEXT_PRIVATE_TEST_HEADERS` is set. Search Next.js's issues and changelog between 16.3.8 and 16.4.1 for this error. Read the three events' non-personal request facts: headers that mark a resume, never bodies or addresses.
2. **Filter the error in the server's `beforeSend`.** Only once the cause is known: if explanation 1 holds, a filter would hide a real rendering difference.
3. **Accept it,** with a trigger such as a rise in volume.

## Resolution (decided)

No fix is decided yet. The decided next step is option 1, by 2026-11-04. Then choose between fixing the render, accepting an upstream defect that 16.4 removed, or accepting the error with a trigger.

## Verification

- [ ] The cause is found, or the checks that could not be made are recorded, and an option is chosen (due 2026-11-04).

## Related

- BUG-319: first recorded the error, as probable skew.
- BUG-318 (archived): why ADDICTION-BOARDS-WEB-T was deleted.
- DEBT-522: the root layout's nonce read and partial prefetching.
