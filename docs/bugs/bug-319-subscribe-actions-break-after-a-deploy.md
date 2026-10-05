# BUG-319: Subscribe and Add-Card Fail for a Page Loaded Before a Deploy

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — filed 2026-10-05; resolution decided below
**Priority:** P1
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

After every production deploy, the payment buttons fail on any page that was loaded before the deploy:
- "Start free trial" and "Subscribe" on `/pricing`;
- "Add a card" in the app, which turns a trial into a paying subscription.

Next.js rejects the stale server action, and the error page's "Try again" button cannot recover, because it only resets client state. A reload does recover. This was found by the owner-requested adversarial hunt of the payment flows (2026-10-05).

## Evidence

- **Action IDs change with every build.** `next build` generates a random encryption key per build (`node_modules/next/dist/build/index.js:644-650`, Next 16.3.6). Both webpack and Turbopack use it as the hash salt for server-action IDs (`build/swc/options.js:172` `hashSalt: serverReferenceHashSalt`, and `build/turbopack-build/impl.js:65,111` `encryptionKey`).
  - A stable key is taken from `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (`server/app-render/encryption-utils-server.js:96`).
  - That variable is not set: neither the repository nor the Vercel project sets it (names checked 2026-10-05).
- **A stale action is a 404.** The new deployment answers an unknown action ID with 404, and its own comment reads "If the deployment doesn't have skew protection, this is expected to occasionally happen" (`server/app-render/action-handler.js:378-392`). The client then throws (`client/components/router-reducer/reducers/server-action-reducer.js:102-109`).
- **No skew protection.** Vercel's Skew Protection is a Pro/Enterprise feature, and the project is on Hobby (`billing.plan = hobby`, read 2026-10-05).
- **Deploys are frequent.** There were 6 to 21 production promotions a day through the 2026-10 campaign.
- **The exposure is widest for "Add a card".** Its action is created in `app/(app)/app/layout.tsx`, and a layout is not re-fetched on in-app navigation. So its action ID dates from when the learner first opened the app, and a long practice session easily spans a deploy.
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

## Verification

Criteria to meet before closing; none is met yet.

- [ ] Two consecutive production builds give the same action IDs. Proof: compare the server-reference manifest across two builds, or call a page's action after a deploy.
- [ ] "Try again" calls `retry` on every route error page. A test pins it, red first.
- [ ] A stale action reloads instead of erroring, with a test of the guard.
- [ ] A missing key fails a production build.
- [ ] Sentry shows whether ADDICTION-BOARDS-WEB-T's resume errors stop after the key ships. Record the result either way.

## Related

- [BUG-320](./bug-320-first-pricing-render-user-upsert-race.md), [BUG-321](./bug-321-already-subscribed-answer-discarded.md), [BUG-322](./bug-322-checkout-error-hidden-behind-dialog.md): the other findings of the same hunt.
- [DEBT-501](../debt/debt-501-billing-operations-resilience.md), [DEBT-502](../debt/debt-502-account-identity-and-action-hardening.md).
- [Next.js: Failed to find Server Action](https://nextjs.org/docs/messages/failed-to-find-server-action); [Vercel: Skew Protection](https://vercel.com/docs/skew-protection).
