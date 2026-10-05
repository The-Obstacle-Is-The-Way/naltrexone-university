# BUG-319: Subscribe and Add-Card Fail for a Page Loaded Before a Deploy

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — filed 2026-10-05; fix shipped in the increment that files it; production checks pending
**Priority:** P2 (filed as P1; lowered 2026-10-05, see the correction under Evidence)
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

After a production deploy that changes the server-action key, the payment buttons fail on any page that was loaded before the deploy:
- "Start free trial" and "Subscribe" on `/pricing`;
- "Add a card" in the app, which turns a trial into a paying subscription.

Next.js rejects the stale server action, and the error page's "Try again" button cannot recover, because it only resets client state. A reload does recover. This was found by the owner-requested adversarial hunt of the payment flows (2026-10-05).

## Evidence

- **Action IDs change when the build's key changes.** `next build` takes an encryption key (`node_modules/next/dist/build/index.js:644-650`, Next 16.3.6). Both webpack and Turbopack use it as the hash salt for server-action IDs (`build/swc/options.js:172` `hashSalt: serverReferenceHashSalt`, and `build/turbopack-build/impl.js:65,111` `encryptionKey`).
  - A stable key is taken from `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (`server/app-render/encryption-utils-server.js:96`).
  - Neither the repository nor the Vercel project set it before this fix (names checked 2026-10-05).
  - **Correction (2026-10-05, before the fix shipped).** This record first said the IDs change with every build. Without the variable, Next generates a key and caches it in `.next/cache/.rscinfo` for 14 days (`encryption-utils-server.js:25-28,50-90`), unless the build runs in Docker (`server/cache-dir.js`). Vercel restores that cache for each production build: the build logs of the last three production deployments read "Restored build cache from previous deployment". So the IDs most likely changed when the cached key expired, every 14 days, or on a build that missed the cache, not on every deploy. Whether Vercel's build machine counts as Docker was not observed, and neither were the IDs themselves: they appear only in the dynamic part of the pricing page, which the static HTML and RSC shells fetched from three deployments do not carry. The priority was lowered to P2 for that reason. "Try again" failing on every error page does not depend on this.
- **A stale action is a 404.** The new deployment answers an unknown action ID with 404, and its own comment reads "If the deployment doesn't have skew protection, this is expected to occasionally happen" (`server/app-render/action-handler.js:378-392`). The client then throws (`client/components/router-reducer/reducers/server-action-reducer.js:102-109`).
- **No skew protection.** Vercel's Skew Protection is a Pro/Enterprise feature, and the project is on Hobby (`billing.plan = hobby`, read 2026-10-05).
- **Deploys are frequent.** There were 6 to 21 production promotions a day through the 2026-10 campaign, so any deploy that changes the key catches pages that are open.
- **The exposure is widest for "Add a card".** Its action is created in `app/(app)/app/layout.tsx`, and a layout is not re-fetched on in-app navigation. So its action ID dates from when the learner first opened the app, and a long practice session easily spans a deploy.
- **Sentry cannot see it.** No Sentry issue in the last 90 days matches "was not found on the server", `UnrecognizedActionError` or "Failed to find Server Action" (searched 2026-10-05). That proves nothing: the error is thrown in the browser and caught by a route error page, and the error pages only logged to the console. Sentry's Next.js SDK does not report errors an error page catches.
- **"Try again" cannot recover.** All 11 route error pages use `components/error-boundary-page.tsx`, whose button calls `reset` (line 54). `reset` clears the boundary but replays the same stale tree. Next 16.3.6 passes error components a `retry` (`client/components/error-boundary.d.ts:6`), which refreshes from the server first (`client/components/error-boundary.js:43-47`), and none of our pages use it.

- **Probably the same skew in another form: Sentry ADDICTION-BOARDS-WEB-T.**
  - 12 events from 2026-04-21 to 2026-09-26, across four releases, all on `POST /`.
  - The error reads "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering".
  - A partial-prerender resume answered by a newer build would produce exactly this mismatch. React falls back to client rendering, so the page still works.
  - This is a hypothesis: the events should stop once action IDs and builds are stable. If they don't, they get their own record.

## Impact

A learner who decides to pay, or to add a card at the end of a trial, can meet an error page on the step that converts them. Retrying from that page fails again. Some will give up. No data or money is lost, but conversions are.

## Options

1. **Upgrade to Vercel Pro and turn on Skew Protection.** This keeps old deployments serving their own actions. It costs money, and it is the owner's call; it is not required for the fix.
2. **Set a stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`** (a random 32-byte base64 secret) in Vercel Production and Preview. Action IDs then stay the same across builds while the file and export do. This works on Hobby.
3. **Make "Try again" use `retry`,** which refreshes the route before re-rendering. It also helps every other transient server failure (BUG-320).
4. **Reload on the "Failed to find Server Action" error,** so a stale page heals itself in place.

## Resolution (decided)

Options 2, 3 and 4 together, under the owner's 2026-09-28 delegation. Option 1 stays open for the owner.
1. **The key.** It is an operator secret: the owner approves creating it, then it is set through the Vercel API, with its name read back and never its value. The environment schema then requires it in production and preview builds, so a missing key fails the build rather than silently changing IDs.
2. **`ErrorBoundaryPage`** takes `retry` and uses it for "Try again", keeping `reset` only where no server refresh exists.
3. **A stale action reloads the page once**, guarded against reload loops, rather than reaching the error page.
4. **The error pages report what they catch** (added 2026-10-05 after the Sentry finding above). An error that arose in the browser is sent to Sentry; a server error carries a digest and was already reported on the server, so it is not sent again. Without this, the production checks below could not see a stale action at all.

**Scope limit.** The practice flow calls its actions from client code that catches errors itself (`runTransitionedAsyncAction`), so a stale action there shows the flow's own error, not the error page, and does not reload. With a stable key its IDs change only when that action's file or export changes, which a deploy that changes it brings in any case. This is accepted, not fixed here.

## Progress

**2026-10-05 — the fix, in the increment that files this record.**
- **The key.** The owner approved it. `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` was created through the Vercel API as a sensitive variable for Production and for every Preview branch: a fresh random 32-byte base64 value. Only its name, targets and branch scope were read back.
- **The build guard.** `lib/env.ts` requires the key when `VERCEL_ENV` is `production` or `preview`. It must be a base64 AES key of 16, 24 or 32 bytes, the form Next imports. Tests in `lib/env.test.ts` were written red first; four mutants (no preview check, no requirement, a 20-byte length allowed, no character check) were each killed. A local `VERCEL_ENV=production pnpm build` without the key exited 1 with `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: [ 'Required' ]`.
- **"Try again" uses `retry`.** It was made stable in Next 16.3 and is documented for `error.js` and `global-error.js`. All 11 route error pages and the global error page pass it. `app/error-pages-retry.browser.spec.tsx` finds every `error.tsx` by glob, clicks "Try again" on each, and checks that `retry` was called and `reset` was not. All 11 failed before the change.
- **The stale-action reload.** `lib/stale-server-action.ts` recognizes Next's `UnrecognizedActionError` by name; its test pins that against the real class. It allows at most one reload a minute, recorded in `sessionStorage`. Without working storage it does not reload, since nothing could stop a loop. `ErrorBoundaryPage` uses it through `lib/use-stale-server-action-reload.ts`. Ten mutants of the helper, the hook and its wiring were each killed.
- **Reporting.** `ErrorBoundaryPage` sends browser-side errors to Sentry through `reportClientError`, and not those with a digest. A mutant reporting digest errors too was killed.
- **Docs.** `.env.example`, master spec §10 and `docs/dev/deployment-environments.md` list the key.

## Verification

Criteria to meet before closing.

- [ ] Two consecutive production builds give the same action IDs. Proof: call a page's action from a tab opened before a deploy, or compare the IDs in the pricing page's dynamic payload across two deployments.
- [x] "Try again" calls `retry` on every route error page. A test pins it, red first.
- [x] A stale action reloads instead of erroring, with a test of the guard.
- [x] A missing key fails a production build.
- [ ] Sentry shows whether ADDICTION-BOARDS-WEB-T's resume errors stop after the key ships. Record the result either way.
- [ ] Sentry receives an `UnrecognizedActionError` from the error pages if a stale action ever happens; record the first one, or none, after two weeks.

## Related

- [BUG-320](./bug-320-first-pricing-render-user-upsert-race.md), [BUG-321](./bug-321-already-subscribed-answer-discarded.md), [BUG-322](./bug-322-checkout-error-hidden-behind-dialog.md): the other findings of the same hunt.
- [DEBT-501](../debt/debt-501-billing-operations-resilience.md), [DEBT-502](../debt/debt-502-account-identity-and-action-hardening.md).
- [Next.js: Failed to find Server Action](https://nextjs.org/docs/messages/failed-to-find-server-action); [Vercel: Skew Protection](https://vercel.com/docs/skew-protection).
