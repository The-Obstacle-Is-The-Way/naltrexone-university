# BUG-324: Exported Server Actions Accept Caller-Supplied Dependencies

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Resolved — 2026-10-06: every exported action takes only its input, in production
**Priority:** P1
**Date:** 2026-10-05
**Resolved:** 2026-10-06
**Verification receipts:** #1387 and #1389, promotions #1388 and #1390 (production 2026-10-06 06:17Z). Production build logs show the manifest check passing; `main` CI's E2E passed on #1390; Sentry shows no server-action error since.

---

## Summary

Most exported server actions took, besides their input, optional dependencies and options meant for tests. A client can call a server action with any arguments it likes: React's documentation says "Arguments to Server Functions are fully client-controlled". So any signed-in user could supply these, and anyone could for the public pricing actions.

DEBT-502 item 5 first recorded this for the subscribe actions, as hardening. An independent review on 2026-10-05 showed it is wider and worse:
- **It reaches every controller action:** all 29 built by `createAction`, the five app-level actions in four modules, and `requireEntitledUserId`, which was itself exported as an action.
- **One request can run many actions.** React accepts other server actions as arguments ([`use server`](https://react.dev/reference/rsc/use-server)). Each action run that way with the real container makes its own Clerk `currentUser()` call. That is the same shared allowance as [BUG-323](../../bugs/bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md), reachable here by any free account.

A second independent review, on 2026-10-06, found the same class through the input itself:
- **The app's form actions read their input by calling its methods,** such as `formData.get(...)`, without checking that it is form data.
- **The input is client-controlled too.** It can be any value React can decode, and that includes server functions as members of an object.
- **So a form action could be made to run other actions,** without an account in the public pricing actions. A rule that actions take only their input does not close this.

No privilege gain was found. Every action returns an envelope, a string, nothing or a redirect, so none can stand in for a user or an entitlement. Neither path was run against any environment.

## Evidence

- `createAction` returned `(input, deps?, options?)` (`src/adapters/controllers/create-action.ts`). `createDepsResolver` used any `deps` it was given (`lib/controller-helpers.ts`).
- The subscribe, manage-billing (both copies) and remove-bookmark actions took a second `deps` argument.
- `src/adapters/controllers/require-entitled-user-id.ts` began with `'use server'`, which made the helper a callable action.
- The `'use server'` barrel `src/adapters/controllers/index.ts` re-exports `processStripeWebhook`. Nothing imports it, so it is not callable today.
- The form actions in `app/` (subscribe, manage billing, remove bookmark, add a card) call `formData.get` on their first argument as received.
- React's reply decoder rebuilds a client-sent server reference wherever it appears in an object, except under the keys `then` and `__proto__` (`react-server-dom-turbopack-server.node.production.js` `loadServerReference$1`, vendored in Next 16.3.6).

## Impact

Any free account could drain the Clerk allowance that every signed-in page depends on, causing the same outage as BUG-323. The public pricing actions could also be made to throw and log errors without an account.

## Options

1. **Exported actions take only their input.** Each action's logic, with its test seams, moves out of the `'use server'` module, where a client cannot reach it.
2. **A production build ignores the seams** (`testSeam`, `lib/action-test-seams.ts`). This is a few lines that close the hole at once, but tests and production then take different paths.
3. **Reject forged arguments at runtime** by React's internal marker for server references. This is a blocklist on internals, and it would break silently if they changed.
4. **Each form action checks that its input is form data before touching it.** Every legitimate path gives one: React decodes a submitted form into the global `FormData`, with or without JavaScript. So the check refuses only input no form produces.

## Resolution (decided)

Option 1 is shipped. Option 2 was the temporary stopgap and has been removed. Option 3 is rejected. *Corrected 2026-10-06: the decision states the final implementation; the dated Progress preserves the sequence.*
- **The app-level actions get option 1 now.** Their logic moves to `subscribe-to-plan.ts`, `manage-billing-request.ts` (both copies) and `remove-bookmark.ts`.
- **`requireEntitledUserId` is no longer a `'use server'` module.**
- **The 29 controller actions use option 1.** It landed on 2026-10-06; see Progress.
- **Option 4 for every form action** (added 2026-10-06). A form action whose input is not form data returns at once, with nothing logged: no form sends that, and logging it would let anyone fill the logs.
- **Accepted until option 1 lands: production drops the checkout logger.** The subscribe logic passes its request-scoped logger to the checkout controller as an option, and option 2 drops every option in production. So the controller's own error log loses the request ID; the subscribe flow's "Stripe checkout failed" log keeps it. Option 1 gives server-side callers a core that is not an action, which ends this. (Ended 2026-10-06.)
- **This changes five action IDs on purpose.** Next encodes an action's declared argument count in its ID, so the subscribe, manage-billing and remove-bookmark actions get new IDs. A page opened before the deploy reloads on its next submit, through [BUG-319](../../bugs/bug-319-subscribe-actions-break-after-a-deploy.md)'s recovery.

## Progress

**2026-10-05, the stopgap** (the pull request that files this record). Tests were written red first:
- `testSeam` drops a seam in a production build. After CodeRabbit's review it fails closed: only a known test or development run (`NODE_ENV` of `test` or `development`) keeps one, so an unset or unexpected value drops it too.
- `createAction` and `createDepsResolver` ignore caller-supplied dependencies and options there; removing the guard fails a test.
- `tests/server-action-signatures.test.ts` imports every `'use server'` module under `app/` and checks that each export takes at most one parameter. Adding a second parameter fails it.
- `tests/server-action-wrappers.test.ts` calls each exported app-level action with empty form data and checks Next's real redirect, including its target.

**2026-10-06, the independent review's findings** (same pull request).
- **The input path above:** each form action now checks for form data first. `tests/server-action-input.test.ts` calls every exported action, in `app/` and in the controllers, with an input whose members record any call, and fails if one is called.
- **The signature guard could pass when it should fail.** `Function.length` ignores default and rest parameters, and the discovery read only `app/**/*.ts`. The guard now reads the TypeScript syntax of every `'use server'` module under `app/`, `src/`, `lib/` and `components/`. It rejects a second, default or rest parameter, re-exports, and `'use server'` inside a function. Until option 1 lands, it also allows the `createAction` exports.
- **The barrel is removed.**
- **The checkout logger and the changed action IDs** are recorded above.

**2026-10-06, option 1 for the controllers** (the next pull request). Tests were written red first.
- **Controllers are no longer actions.** The nine controller modules begin with `import 'server-only'`, not `'use server'`. Their `createAction` exports keep their names and their test dependencies, so server code and tests call them as before.
- **Seven exports are not reachable by a client at all.** Only server pages and logic modules call them: the three billing actions, `getBookmarks`, `getUserStats`, `getSessionHistory` and `getAttemptedQuestions`.
- **The 22 actions a browser calls are thin wrappers.** They are in six `'use server'` modules beside their controllers: `bookmark-actions.ts`, `practice-actions.ts`, `question-actions.ts`, `question-feedback-actions.ts`, `question-view-actions.ts` and `tag-actions.ts`. Each takes only its input. Client hooks and their browser specs import these.
- **The stopgap is gone.** `testSeam` is removed, so the checkout logger reaches the controller again in production.
- **The guards are tightened.**
  - The signature guard no longer allows `createAction` exports. Putting `'use server'` back on a controller fails it.
  - The input guard checks all 28 actions.
- **A post-build check reads the action manifest** (`scripts/check-server-action-manifest.ts`). `pnpm build` runs it, so CI, the local gate and every Vercel deploy fail if any action's ID declares more than its first argument. It fails closed when the manifest lists no actions.
  - On a build from the previous code, it reported all 29 controller actions.
  - On this code: "server actions: 38, all take only their input". That is 28 actions, Clerk's cache action and nine `'use cache'` functions. The final check includes all 38 entries, including cached functions.
- **The 22 browser-called actions get new IDs,** because they moved module and now declare one argument.
  - A page opened before the deploy gets an error from each of them until its next full load: a reload, "Try again" on an error page, or a navigation after the deploy.
  - The hooks catch these errors themselves, so BUG-319's automatic reload, which runs only on route error pages, does not fire. That is BUG-319's accepted scope. An automatic reload from a hook could also discard unsaved work, such as an exam answer.
  - This happens once, for this deploy, which is promoted at a quiet hour.
- **The independent review of this step** found no way left to pass dependencies or options. Its other findings are fixed here:
  - this record had said a stale page reloads by itself;
  - the architecture records still told authors to mark controllers `'use server'`;
  - nothing checked what a wrapper does with its input. The scan now requires each wrapper's body to be exactly `return controller.<sameName>(input)`. After CodeRabbit's review, it also accepts only function declarations in a wrapper module, so an arrow or function-expression export cannot skip that check.
  - The manifest check skipped `'use cache'` functions, which a client can call by ID. It now applies the same rule to them; all nine pass.
  - Nothing pinned the check into `pnpm build`. A test now does.

**2026-10-06, in production.** Promotion #1390 (`51c14544`) reached production at 06:17:47 UTC. Its Vercel build log shows "server actions: 38, all take only their input". The signed-in check of practice, bookmarks and checkout was later replaced by `main` CI's E2E on #1390's merge commit (run 37421764279) and a clean Sentry (see Verification).

## Verification

- [x] A production build ignored caller-supplied dependencies on controller actions (the stopgap, replaced by option 1).
- [x] The app-level actions take only their form data, enforced by the signature guard.
- [x] Every form-action wrapper checks `instanceof FormData` in source. `tests/server-action-input.test.ts` exercises all 28 exports and asserts that none invokes a member of its probe input. It catches rejected promises and does not spy on logging, so that test alone does not prove “no throw” or “no log”.
- [x] The signature guard reads the syntax of every `'use server'` module, in `app/`, `src/`, `lib/` and `components/`.
- [x] The `'use server'` barrel is removed.
- [x] Exported controller actions take only their input; the signature guard stops allowing `createAction` exports; the checkout logger reaches the controller again in production.
- [x] A post-build check reads the action manifest: every action's ID declares at most one argument.
- [x] `requireEntitledUserId` is not a server-action export in the shipped source. The post-build check validates argument bits; it does not assert that this particular name is absent. The original production-manifest observation is a separate operator receipt.
- [x] The production build log shows the manifest check passing (read through Vercel's API); `main` CI's E2E, which runs practice, bookmarks and checkout against a production build of the promoted code in Stripe test mode, passed on the promotion; and Sentry has no server-action error since the deploy. *Corrected 2026-10-06: these replace an owner's signed-in click-through, which would add nothing they do not cover.*

## Related

- [BUG-323](../../bugs/bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md): the same shared Clerk allowance, reached without an account.
- [DEBT-502](../../debt/debt-502-account-identity-and-action-hardening.md) item 5: where this was first recorded.
- [DEBT-503](../../debt/debt-503-clerk-backend-api-allowance-single-point-of-failure.md): reading identity from the session token, which would make each action run cost no Clerk call at all.
