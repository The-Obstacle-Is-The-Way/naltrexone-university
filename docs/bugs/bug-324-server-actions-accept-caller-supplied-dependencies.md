# BUG-324: Exported Server Actions Accept Caller-Supplied Dependencies

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — production ignores the seams; next, exported controller actions take only their input
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

No privilege gain was found. Every action returns an envelope, a string, nothing or a redirect, so none can stand in for a user or an entitlement. Not run against any environment.

## Evidence

- `createAction` returned `(input, deps?, options?)` (`src/adapters/controllers/create-action.ts`). `createDepsResolver` used any `deps` it was given (`lib/controller-helpers.ts`).
- The subscribe, manage-billing (both copies) and remove-bookmark actions took a second `deps` argument.
- `src/adapters/controllers/require-entitled-user-id.ts` began with `'use server'`, which made the helper a callable action.
- The `'use server'` barrel `src/adapters/controllers/index.ts` re-exports `processStripeWebhook`. Nothing imports it, so it is not callable today.

## Impact

Any free account could drain the Clerk allowance that every signed-in page depends on, causing the same outage as BUG-323. The public pricing actions could also be made to throw and log errors without an account.

## Options

1. **Exported actions take only their input.** Each action's logic, with its test seams, moves out of the `'use server'` module, where a client cannot reach it.
2. **A production build ignores the seams** (`testSeam`, `lib/action-test-seams.ts`). This is a few lines that close the hole at once, but tests and production then take different paths.
3. **Reject forged arguments at runtime** by React's internal marker for server references. This is a blocklist on internals, and it would break silently if they changed.

## Resolution (decided)

Option 2 now, as the stopgap, and option 1 as the fix. Option 3 is rejected.
- **The app-level actions get option 1 now.** Their logic moves to `subscribe-to-plan.ts`, `manage-billing-request.ts` (both copies) and `remove-bookmark.ts`.
- **`requireEntitledUserId` is no longer a `'use server'` module.**
- **The 29 controller actions get option 2 now and option 1 next.** That change touches about 25 test files.

## Progress

**2026-10-05, the stopgap** (the pull request that files this record). Tests were written red first:
- `testSeam` drops a seam in a production build.
- `createAction` and `createDepsResolver` ignore caller-supplied dependencies and options there; removing the guard fails a test.
- `tests/server-action-signatures.test.ts` imports every `'use server'` module under `app/` and checks that each export takes at most one parameter. Adding a second parameter fails it.
- `tests/server-action-wrappers.test.ts` calls each exported app-level action with empty form data and gets Next's real redirect, so the wiring is exercised and not only the signature.

## Verification

- [x] A production build ignores caller-supplied dependencies on controller actions (unit tests).
- [x] The app-level actions take only their form data, enforced by the signature guard.
- [ ] Exported controller actions take only their input, and the signature guard covers `src/adapters/controllers` too.
- [ ] The `'use server'` barrel is removed.
- [ ] After promotion, the production build's action manifest no longer lists `requireEntitledUserId`.

## Related

- [BUG-323](./bug-323-anonymous-requests-can-spend-clerks-shared-api-limit.md): the same shared Clerk allowance, reached without an account.
- [DEBT-502](../debt/debt-502-account-identity-and-action-hardening.md) item 5: where this was first recorded.
- [DEBT-503](../debt/debt-503-clerk-backend-api-allowance-single-point-of-failure.md): reading identity from the session token, which would make each action run cost no Clerk call at all.
