# BUG-363: The Home Page's Resume Render Can Fail to Match Its Prerender

**Status:** Open — closes as Accepted in this pull request: 8 events in 33 days, from requests Next.js's client never sends, none signed in; BUG-319's Waiting row holds the trigger
**Priority:** P3
**Date:** 2026-10-21

---

## Summary

Sentry's server issue ADDICTION-BOARDS-SERVER-2 records unhandled errors on `POST /`: "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering". With `cacheComponents` on, the home page is a partial prerender. React raises this error when the tree it renders on resume does not match the prerendered shell.

BUG-319 took the same error, seen 12 times from 2026-04-21 to 2026-09-26, for skew between builds. The five events still readable are server-action POSTs to `/` that Next.js's own client never sends, most likely a probe. The cause below is inferred from Next.js's source, not reproduced.

## Evidence

- **Sentry, read 2026-11-15 through its API** (tags and header names only): 8 events, none from a signed-in user. The web project has no matching issue.
  - 3 on 2026-10-13, from release `f66056bd` (promotion #1481) on Next.js 16.3.8. Read on 2026-10-21: each from Chrome 131, two on Linux and one on macOS; which OS tag was read is not recorded, and the events have aged out, so the split cannot be re-checked. Sentry also kept two successful `POST /` resumes on that release at the 5% trace sample, so resumes succeeded there too.
  - 5 from 2026-11-02 11:13Z to 2026-11-04 09:12Z, on four releases running Next.js 16.4.2 and 16.4.3, 1.4 to 24.3 hours after each promotion's merge. Each reports Chrome 131, a 2024 version, on three client systems (`client_os`): Mac OS X twice, Windows 10+ twice, Linux once. None since, to 2026-11-15.
- **The captured requests.** All five carry `x-matched-path: /`, `next-action: x`, `content-type: application/x-www-form-urlencoded`, and an `x-next-resume-state-length` 13 bytes short of the body. No build has an action ID `x`. Next.js's client sends an action as text or multipart, never URL-encoded. `x-next-resume-state-length` is an internal Next.js header; a client cannot know the saved state's size, so Vercel set it (inference).
- **The resume path, in Next.js 16.4.5.** In minimal mode, as Vercel runs it, a possible server action on a `cacheComponents` route that carries `x-next-resume-state-length` has that many bytes taken from the start of its body as the prerender's saved state, and is rendered by resuming it (`node_modules/next/dist/build/templates/app-page-runtime.js:237-278`).
- **The page.** `app/page.tsx` last changed on 2026-09-22, and the `components/marketing/` source on 2026-09-16 (its tests on 2026-10-15), before both sets of events.
- **Explanations** (inferences, none reproduced):
  1. **A malformed action, likeliest.** Next.js answers a URL-encoded request with a `next-action` header as not found (`node_modules/next/dist/server/app-render/action-handler.js:403-410`). It then renders the not-found tree, `app/not-found.tsx`, resuming the home page's saved state (`node_modules/next/dist/server/app-render/app-render.js:1791-1798`). Those trees differ, which fits this error.
  2. **Clerk.** The root layout's `ClerkProvider` ships Clerk's `invalidateCacheAction` to every page, `/` included. Clerk calls it only before `setActive` (`node_modules/@clerk/nextjs/dist/esm/app-router/client/ClerkProvider.js:23-31`), nothing on `/` signs anyone in, and its ID is a build hash, not `x`. Unlikely.
  3. **Skew between builds** (BUG-319). Not needed: no build has an action `x`.

## Impact

None seen by a person. The requests carry an action ID no build has and a body type Next.js's client never sends, and none had a signed-in user; on explanation 1, they receive the not-found page either way. Each is an unhandled error, counted against Sentry's error quota: 8 in 33 days.

## Options

1. **Investigate.** Reproduce locally in minimal mode, with a URL-encoded `next-action: x` POST to `/` behind the saved state, and report it upstream if it reproduces.
2. **Filter the error in the server's `beforeSend`.** A filter on the message would also hide a real mismatch from a real visitor.
3. **Accept it,** with a trigger.

## Resolution (decided)

Option 3, decided 2026-11-15 by the reviewing session, at the owner's delegation of engineering calls for this review (records accuracy review, 2026-11-15). The requests do not come from the app's own client. The likely cause is Next.js's handling of a malformed action, which the app cannot change, so option 1 would rebuild Vercel's minimal mode by hand to file an upstream report at most. Option 2 would hide the case the trigger exists to catch. The trigger, in BUG-319's Waiting row: SERVER-2 records a signed-in user, an action ID other than `x`, or more than 10 events in a week.

## Verification

- [x] The checks that could not be made are recorded, and an option is chosen (due 2026-11-04; done 2026-11-15). Not made: a local minimal-mode reproduction, and the October events' request headers, which have aged out.
- [x] BUG-319's Waiting row carries the trigger (index, this pull request).

## Related

- BUG-319: first recorded the error, as probable skew; its Waiting row holds Skew Protection and this record's trigger.

Corrected 2026-11-15: Sentry now holds 8 events, 5 of them on Next.js 16.4.2 and 16.4.3, which rules out a 16.3.8 defect. Their clients run three operating systems (`client_os`), not one; the earlier "Linux" was the server's `os` tag. All five carry `x-next-resume-state-length` and `next-action: x`, so the resume came from a malformed server-action POST, not from a `next-resume` header. Event delays are measured from each merge, and the marketing source dates are corrected. The lapsed 2026-11-04 step is done by recording what could not be checked, and option 3 closes the record. The sampling estimate, ingestion check and nonce notes are in git at 34d9aea0.
