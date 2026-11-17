# DEBT-502: Rare Account States Can Lock a Person Out, and Payment Actions Expose Test Seams

**Status:** Open — items 3, 1, 2 by 39 days before the first real renewal or anniversary (dated from DEBT-511's count); owner: Clerk's verify-at-sign-up setting
**Priority:** P3
**Date:** 2026-10-05

---

## Summary

The same hunt (2026-10-05) found account-lifecycle states that can stop a person from subscribing, or that leave no way to repair them. It also found hardening gaps on the payment actions. Each needs a rare precondition, a scale threshold, or a Clerk setting. None is known to have happened.

## Items

**Decided 2026-10-08 (AUDIT-015): one identity resolver.** Clerk, `users.email` and the Stripe customer each hold the user's email, and nothing keeps them in step; items 1–3 and DEBT-511 are symptoms. Two paths write the stored email today:

- `ensureClerkUser` (`src/adapters/gateways/clerk-user-provisioner.ts:296`), for provisioning and the billing refresh (`clerk-auth-gateway.ts:120`);
- the `user.updated` webhook, which runs the provisioner's steps itself in two transactions. The first takes the tombstone lock (`src/adapters/controllers/clerk-webhook-controller.ts:257`) for `upsertByClerkId` (`:286`) and `validateClerkUserEmailOwnershipConflict` (`:307`). After it commits, `resolveClerkUserEmailOwnershipConflict` (`:400`) asks Clerk outside any lock, and a second transaction takes the lock again (`:423`) for `applyClerkUserEmailOwnershipResolution` (`:441`).

None of the following is built. Both paths are to take only Clerk's verified primary email (item 3); provisioning is to run under the tombstone lock (item 2); and the shared validation is to move a conflicting row (item 1). DEBT-511 refreshes notice addresses through `ensureClerkUser`, and owns syncing Stripe's copy (DEBT-511 item 4). Ship in the order items 3, 1, 2, by 39 days before the earliest annual renewal, or a monthly subscription's first yearly anniversary, of a real live subscription, from the owner's read-only count; DEBT-501 item 7's refunded purchase does not count.

**Adopted 2026-10-17 (DEBT-524 step 5):** keep this deadline and order. The resolver must preserve ADR-004: the verified Clerk session establishes identity; an email address does not. Retain BUG-320/BUG-332's retries as defense after consolidation. If implementation adds `user.created`, specify and test missing/delayed-webhook request fallback, concurrent requests and tombstone/deletion behavior before enabling it. A new webhook path does not remove those races.

### 1. An email change to an address a stale row holds blocks checkout (P3)

- **Evidence.** `ensureClerkUser` validates before it resolves (`clerk-user-provisioner.ts:309-310`). It refuses as soon as the incoming Clerk user already has a row (`:110-120`, `blocked_incoming_identity_already_exists`), even when Clerk proves the stale owner has moved to another address. The webhook does the same (`clerk-webhook-controller.ts:307-311`). `clerk-auth-gateway-session.test.ts`'s "keeps both rows when the refreshed email is held by another identity" (`:275`) locks this in for the billing refresh.
- **Impact.** Since DEBT-503 item 1, signed-in pages read the person's own row by Clerk ID with no Clerk call (`clerk-auth-gateway.ts:50-66`), so pages still load. The refusal blocks the billing refresh (`billing-controller.ts:161`), so the person cannot start a checkout or trial card setup, and their `user.updated` webhook fails on every delivery.
- **Decided.** When Clerk confirms the stale owner's current email differs, move that owner's row first, as the new-user path already does, then continue. The refusal stays for an owner that Clerk cannot confirm. The change is in the shared validation, so both paths get it.

### 2. A row whose Clerk user no longer exists blocks its email permanently, and nothing repairs it (P3)

- **Evidence.** Re-signing up with the same email hits Clerk's 404 for the old ID and is refused on every request (`clerk-user-provisioner.ts:155-165`, BUG-284's fail-closed design). Such a row arises in three ways:
  1. a first sign-in, or a billing refresh, whose upsert commits after the deletion. The sign-in path reads the `deleted_clerk_users` tombstone in a separate read without the tombstone lock (`clerk-auth-gateway.ts:54-57`, and `:82` for the refresh), so this interleaving remains;
  2. a `user.deleted` webhook whose retries ran out;
  3. a Clerk instance switch, which is what happened in BUG-078.
- **Impact.** The deleted person's email also stays in our database, a privacy residue.
- **Decided, not built.**
  - The sign-in path and the billing refresh, which both provision through `provisionFromClerk` and `ensureClerkUser`, take the existing Clerk tombstone lock, check the tombstone and provision in the same short transaction, using transaction-bound repositories. A separate preflight check still races deletion. Preserve the deletion path's lock order; provider reads happen outside the transaction and their result is revalidated under the lock. Prove both interleavings, for sign-in and for the refresh, against real Postgres. (`DrizzleDeletedClerkUserRepository.lock` and `clerk-webhook-controller.ts:257` already define that lock.)
  - An operator command, with a runbook, deletes a row whose Clerk user is confirmed gone, under the same locks as the webhook.

### 3. A Clerk user with no email gets no app row, and an unverified one is accepted (P3, depends on Clerk settings)

- **Evidence.** With no address, the sign-in path throws `INTERNAL_ERROR` (`ClerkAuthGateway.provisionFromClerk`, "User has no email address", `clerk-auth-gateway.ts:104`), and the webhook skips the user (`clerk-webhook-controller.ts:264-272`). With only an unverified address, both selectors return it, since they fall back to the first address (`clerk-user-provisioner.ts:54-64`; the webhook's `getPrimaryEmailOrNull`, `clerk-webhook-controller.ts:125`), and the row is created with it.
- **Decided.**
  - The owner confirms in the Clerk dashboard that a verified email is required for every sign-up method, in both instances ("Verify at sign-up"), and the setting is recorded here.
  - Both selectors take only a verified primary address. Checkout and add-card refuse an unverified refreshed primary, and the Billing page tells the user to verify their address, which is their recovery path.

### 4 and 5. Moved

Item 4, Clerk's rate limit, moved to DEBT-503 on 2026-10-05; item 5, payment actions that accept caller-supplied dependencies, moved to BUG-324 the same day.

### 6. Smaller items (P3)

- **No sign-in URL prop is set** on `ClerkProvider` (`components/providers.tsx:71-77`). Clerk also reads `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL` (`@clerk/nextjs/dist/cjs/utils/mergeNextClerkPropsWithEnv.js`), so source omission alone does not prove the deployed redirect. Vercel's variable names, read 2026-11-15, include neither. Decided: establish one explicit app-route configuration, then test sign-in, sign-up and the return to `/pricing?plan=…`. The reported accounts-subdomain journey is unverified.
- **A signed-out "Add a card" loses its way back:** it redirects to sign-up with no return path (`app/(app)/app/trial-payment-method-action-handler.ts:61-62`). Decided: carry a return path.
- **Deleting an account and signing up again grants a fresh 7-day trial**, because eligibility is per app row (`src/application/use-cases/create-checkout-session.ts:132`). **Won't Fix, decided 2026-11-15 by the reviewing session, at the owner's delegation.** Detecting it means keeping deleted users' emails, which contradicts the privacy policy's promise that deletion removes the user record; a new address gets around it anyway; and the trial is 7 days with no card required (`payment_method_collection: 'if_required'`).
- **The shared E2E user's seed re-points the row by email** (`tests/e2e/helpers/seed-test-user.ts:214-220`, `ON CONFLICT (email)`), the reassignment BUG-284 removed from production. So the fail-closed identity path is never exercised end to end. Decided: seed by Clerk ID.

## Verification

Criteria to meet before closing: each item shipped with red-first tests, or left as a Waiting row with its trigger in the records index.

- [ ] Item 3: the owner's Clerk setting is recorded; both selectors refuse an unverified address; checkout and add-card refuse an unverified refreshed primary; and the Billing page tells the user to verify their address.
- [ ] Item 1: a refresh, and a `user.updated`, whose address a stale owner held succeeds once Clerk confirms that owner moved, and still refuses when Clerk cannot.
- [ ] Item 2: both interleavings of provisioning and deletion leave no row, for sign-in and for the billing refresh, proven against real Postgres; the operator command and its runbook ship.
- [ ] Item 6: the sign-in URL, the add-card return path and the E2E seed ship.
- [x] Item 6: trial re-use is Won't Fix (2026-11-15).

## Related

- DEBT-501, BUG-320: the same hunt.
- DEBT-511: the notice refresh built on `ensureClerkUser`.
- BUG-078, BUG-284 and BUG-293: earlier identity decisions this builds on.

Corrected 2026-11-15: DEBT-503 item 1 shipped, so item 1's lockout narrows to checkout, trial card setup and the webhook; the webhook does not call `ensureClerkUser` but runs the provisioner's steps itself, and the resolver's three behaviors are work to do, not built; item 2's 2026-10-06 note described the decision, not code; the deadline counts real subscriptions only, not DEBT-501 item 7's refunded purchase; trial re-use is Won't Fix, decided by the reviewing session at the owner's delegation; item 3's checkout refusal and Billing prompt gained Verification lines; DEBT-511's former verified-only item moved into item 3; drifted lines corrected; moved items 4 and 5 and the finished `CONSENT_STATE_SECRET` item stripped (finished build history is in git at 34d9aea0).
