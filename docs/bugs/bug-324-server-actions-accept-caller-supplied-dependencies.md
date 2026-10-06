# BUG-324: Exported Server Actions Accept Caller-Supplied Dependencies

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — production ignores the seams and form actions reject other input; next, controller actions take only their input
**Priority:** P1
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

Most exported server actions took, besides their input, optional dependencies and options meant for tests. A client can call a server action with any arguments it likes: React's documentation says "Arguments to Server Functions are fully client-controlled". So any signed-in user could supply these, and anyone could for the public pricing actions.

DEBT-502 item 5 first recorded this for the subscribe actions, as hardening. An independent review on 2026-10-05 showed it is wider and worse:
- **It reaches every controller action:** all 29 built by `createAction`, the four app-level actions, and `requireEntitledUserId`, which was itself exported as an action.
- **One request can run many actions.** React accepts other server actions as arguments ([`use server`](https://react.dev/reference/rsc/use-server)). Each action run that way with the real container makes its own Clerk `currentUser()` call. That is the same shared allowance as [BUG-323](./bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md), reachable here by any free account.

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

Option 2 now, as the stopgap, and option 1 as the fix. Option 3 is rejected.
- **The app-level actions get option 1 now.** Their logic moves to `subscribe-to-plan.ts`, `manage-billing-request.ts` (both copies) and `remove-bookmark.ts`.
- **`requireEntitledUserId` is no longer a `'use server'` module.**
- **The 29 controller actions get option 2 now and option 1 next.** That change touches about 25 test files.
- **Option 4 for every form action** (added 2026-10-06). A form action whose input is not form data returns at once, with nothing logged: no form sends that, and logging it would let anyone fill the logs.
- **Accepted until option 1 lands: production drops the checkout logger.** The subscribe logic passes its request-scoped logger to the checkout controller as an option, and option 2 drops every option in production. So the controller's own error log loses the request ID; the subscribe flow's "Stripe checkout failed" log keeps it. Option 1 gives server-side callers a core that is not an action, which ends this.
- **This changes five action IDs on purpose.** Next encodes an action's declared argument count in its ID, so the subscribe, manage-billing and remove-bookmark actions get new IDs. A page opened before the deploy reloads on its next submit, through [BUG-319](./bug-319-subscribe-actions-break-after-a-deploy.md)'s recovery.

## Progress

**2026-10-05, the stopgap** (the pull request that files this record). Tests were written red first:
- `testSeam` drops a seam in a production build.
- `createAction` and `createDepsResolver` ignore caller-supplied dependencies and options there; removing the guard fails a test.
- `tests/server-action-signatures.test.ts` imports every `'use server'` module under `app/` and checks that each export takes at most one parameter. Adding a second parameter fails it.
- `tests/server-action-wrappers.test.ts` calls each exported app-level action with empty form data and checks Next's real redirect, including its target.

**2026-10-06, the independent review's findings** (same pull request).
- **The input path above:** each form action now checks for form data first. `tests/server-action-input.test.ts` calls every exported action, in `app/` and in the controllers, with an input whose members record any call, and fails if one is called.
- **The signature guard could pass when it should fail.** `Function.length` ignores default and rest parameters, and the discovery read only `app/**/*.ts`. The guard now reads the TypeScript syntax of every `'use server'` module under `app/`, `src/`, `lib/` and `components/`. It rejects a second, default or rest parameter, re-exports, and `'use server'` inside a function. Until option 1 lands, it also allows the `createAction` exports.
- **The barrel is removed.**
- **The checkout logger and the changed action IDs** are recorded above.

## Verification

- [x] A production build ignores caller-supplied dependencies on controller actions (unit tests).
- [x] The app-level actions take only their form data, enforced by the signature guard.
- [x] Every form action ignores input that is not form data, and no exported action calls a member of its input (`tests/server-action-input.test.ts`).
- [x] The signature guard reads the syntax of every `'use server'` module, in `app/`, `src/`, `lib/` and `components/`.
- [x] The `'use server'` barrel is removed.
- [ ] Exported controller actions take only their input; the signature guard stops allowing `createAction` exports; the checkout logger reaches the controller again in production.
- [ ] A post-build check reads the action manifest: every action's ID declares at most one argument.
- [ ] After promotion, the production build's action manifest no longer lists `requireEntitledUserId`.

## Related

- [BUG-323](./bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md): the same shared Clerk allowance, reached without an account.
- [DEBT-502](../debt/debt-502-account-identity-and-action-hardening.md) item 5: where this was first recorded.
- [DEBT-503](../debt/debt-503-clerk-backend-api-allowance-single-point-of-failure.md): reading identity from the session token, which would make each action run cost no Clerk call at all.
