# BUG-320: A New User's First Visit Can Fail When Two Requests Create Their Row at Once

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Verifying — no `User could not be upserted` error in Sentry for two weeks after the deploy; due 2026-10-20
**Priority:** P2
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

The first time a newly signed-up user's app row is created, two concurrent requests can both try to insert it. The loser fails on the users table's email index and raises `ApplicationError: User could not be upserted due to a uniqueness constraint`. The user sees the pricing error page, at the moment they arrive to subscribe. A reload succeeds, but the page's "Try again" does not (BUG-319).

Sentry recorded that error in production twice, on 2026-10-02 and 2026-10-04. This race is the leading explanation, by the elimination under Evidence. On 2026-10-06 a real-Postgres test reproduced the same message from concurrent first-time upserts, so the race produces it; no event shows which second request caused the production ones. It may be the origin of the owner's report that a bug stopped a user from subscribing.

## Evidence

- **Sentry ADDICTION-BOARDS-WEB-2A** (2 events):
  - releases `6bc8fd40` and `2018ba5a`;
  - real browsers, Firefox and Chrome on macOS;
  - unhandled, through `onRequestError`, on transaction `POST /pricing?plan=monthly`, route type `render`;
  - stack: `upsertByClerkId` → `mapEmailWriteError` → `mapDbError`.

  Its non-sensitive facts were kept before the owner deleted the issue for BUG-318.
- **The POST is a page render, not the subscribe action.** With `cacheComponents` on, Vercel renders the page's dynamic parts with a POST resume. A real action would be labelled `routeType: 'action'` (Next 16.3.6 `app-render.js:448-456`). Sign-up sends a new user to `/pricing?plan=monthly` (`app/pricing/pricing-view.tsx:30`), and that render is the first to load the app user:
  1. `DeferredPricingView` → `loadPricingData` → the cached `getRequestAuthState`;
  2. `ClerkAuthGateway.getCurrentUser` → `ensureClerkUser` (`src/adapters/gateways/clerk-user-provisioner.ts:296-321`);
  3. `upsertByClerkId` (`src/adapters/repositories/drizzle-user-repository.ts:124-165`, lines at filing).
- **The race.**
  - `users` has two unique indexes, on `clerk_user_id` and on `email` (`db/schema.ts:198-199`). The upsert's `onConflictDoUpdate` names only `clerk_user_id` as its target.
  - PostgreSQL resolves conflicts only on the arbiter index. A concurrent duplicate on another unique index raises 23505, since `INSERT … ON CONFLICT` guarantees its outcome only "provided there is no independent error". So when two first-time inserts for the same `(clerkId, email)` overlap, the later fails on `users_email_uq`.
  - `mapEmailWriteError` then finds the email's owner. The owner is the same Clerk user, so the identity-conflict branch (`:72` at filing) does not apply, and the error falls to `mapDbError`'s generic `CONFLICT` (`:42-46`). `ensureClerkUser` rethrows it.
- **What the events show, and what they don't.** The retained Sentry facts give the message and the stack, not the violated constraint. That the conflict was on `users_email_uq` follows by elimination:
  - `users` has three unique indexes: the primary key (a random UUID), `users_clerk_user_id_uq` and `users_email_uq` (`db/schema.ts:187,198-199`);
  - the upsert's arbiter is `users_clerk_user_id_uq`, which PostgreSQL resolves atomically, so it does not raise 23505 for this statement;
  - a primary-key collision needs two equal random UUIDs.
- **The generic message narrows the cause to two cases.** For `users_email_uq`, `mapEmailWriteError` (`drizzle-user-repository.ts:56-82` at filing) gives "Email is already associated with another identity" when the email's owner is a different Clerk user. It falls through to the generic `CONFLICT` only when:
  - the owner is the same Clerk user, which is the race described above; or
  - no owner is found, because the row was deleted between the insert and the lookup (for example by a `user.deleted` webhook).

  The race needs only two requests from a new user. The deletion needs a deletion within milliseconds of first sign-in. So the race is far likelier, but neither event identifies which case occurred. (Qualified 2026-10-05 after CodeRabbit's review: the record first said the events established the race.)
- **The second request is not identified.** Candidates are Clerk's `invalidateCacheAction` with `router.refresh()` around sign-in (`@clerk/nextjs` 7.9.4 `ClerkProvider.js:23-37`), a second tab, or a `user.updated` webhook that inserts (`clerk-webhook-controller.ts:286`).
- **A register note is broader than its evidence.** The bug register's BUG-147 notes (now in its frozen history, `docs/_archive/bugs/register-frozen-2026-10-05.md`) and DEBT-436 call lazy provisioning "verified race-free". That check covered the race between the Clerk webhook and the first signed-in request: the webhook ignores `user.created`. It did not cover two simultaneous first inserts for the same user, which this record describes.

## Impact

A new user can meet an error page on their first visit to pricing, right after signing up. Reloading works, so nothing is lost permanently. The cost is in conversion at the most sensitive moment.

## Options

1. **Retry the upsert once** when the email conflict's owner is the same Clerk user. (The first draft also retried when no owner was found; see Resolution.) The retry takes the update path. BUG-284's refusal of cross-identity conflicts is untouched.
2. **Serialize first inserts** with an advisory lock per Clerk ID. This adds a lock to every authenticated render.
3. **`INSERT … ON CONFLICT DO NOTHING` without a target, then an explicit update and ownership check.** This is a larger restructure of a guarded path.

## Resolution (decided)

Option 1, the smallest change that removes the failure without weakening identity safety. BUG-319's `retry` makes any remaining transient failure recoverable from the page.

**Narrowed on 2026-10-06, after the independent review.** The fix retries only when the owner is the same Clerk user.
- **Why the race always leaves that owner.** Postgres raises a conflict on a non-arbiter unique index only once the conflicting transaction has committed: it waits for one still in progress. So for this race, the owner lookup sees the winner's committed row.
- **What "no owner" means instead.** The row went away after it won, perhaps by a `user.deleted` webhook. The sign-in path does not read the deletion tombstones, so a retry there could create a row for a deleted user. That exposure is DEBT-502 item 2's class, so this fix does not widen it. "Try again" covers the harmless cases.

## Progress

**2026-10-06, the fix.** Tests were written red first.
- **Reproduced first.** `tests/integration/user-repository.integration.test.ts` runs six sessions that each upsert the same new user at once, for 20 rounds. Before the fix it failed with `ApplicationError: User could not be upserted due to a uniqueness constraint`, the production message.
- **The fix.** `upsertByClerkId` (`src/adapters/repositories/drizzle-user-repository.ts`) catches a 23505 on `users_email_uq` and looks up the email's owner.
  - **The owner is the same Clerk user:** it retries the upsert once, and the retry takes the update path.
  - **No row holds the email any more:** no retry, so a deleted user's row cannot come back; it maps to `CONFLICT` as before.
  - **Another identity owns it:** it is still refused with `UserEmailOwnershipConflictError`, without a retry.
  - **A second failure:** it is mapped as before.
- **Unit tests at the sanctioned boundary** (`drizzle-user-repository.test.ts`) pin each case:
  - a retry for its own row;
  - no retry when no row holds the email, or for a unique violation outside the email index;
  - giving up after one retry;
  - a retry that meets another identity is refused;
  - an owner lookup that fails after the retry maps to `INTERNAL_ERROR` with its cause;
  - no retry for another identity.

  The inserts fail at the prepared-query spy, and the owner lookup is answered at the relational query's `execute`. The retry tests fail without the fix.
- **The real-Postgres test runs half its sessions inside an outer transaction,** as the Clerk webhook does, so the retry also runs from a savepoint.
- **The test-double contract register is re-adjudicated.** `FakeUserRepository`'s waiver stands, because the change is unique-index concurrency, which the waiver already excludes.

## Verification

- [x] A 23505 on `users_email_uq` whose owner is the same Clerk user returns the row instead of throwing. It is pinned at the sanctioned error-translation boundary, red first.
- [x] A cross-identity conflict still raises `UserEmailOwnershipConflictError`.
- [x] A real-Postgres test of concurrent first-time upserts for one user ends with one row and no error.
- [ ] In production: no `User could not be upserted due to a uniqueness constraint` event in Sentry for two weeks after the deploy. This is weak evidence on its own, since the error was seen twice in about three days. Record the result, and reopen if it recurs.
- [x] The "race-free" note is qualified to the race it covered: a dated correction in the frozen register history (2026-10-05).

## Related

- [BUG-319](./bug-319-subscribe-actions-break-after-a-deploy.md): the error page's "Try again".
- BUG-147 and BUG-284 (archived): earlier identity and upsert decisions.
