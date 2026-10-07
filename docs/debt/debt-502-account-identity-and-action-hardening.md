# DEBT-502: Rare Account States Can Lock a Person Out, and Payment Actions Expose Test Seams

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — decided per item
**Priority:** P3
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

The same hunt (2026-10-05) found account-lifecycle states that can lock a person out of the app, and therefore out of subscribing, or that leave no way to repair them. It also found hardening gaps on the payment actions. Each needs a rare precondition, a scale threshold, or a Clerk setting. None is known to have happened.

## Items

### 1. An email change to an address a stale row holds locks the person out (P3)

- **Evidence.** `ensureClerkUser` validates before it resolves (`src/adapters/gateways/clerk-user-provisioner.ts:309-310`). It refuses as soon as the incoming Clerk user already has a row (`:110-120`, `blocked_incoming_identity_already_exists`), even when Clerk proves the stale owner has moved to another address. The webhook does the same (`clerk-webhook-controller.ts:305-311`). `clerk-auth-gateway.test.ts:356-405` locks this in.
- **Impact.** Every signed-in page errors, the marketing navigation included (`components/auth-nav.tsx:49`). The person cannot change their email back in the app. Once [DEBT-503](./debt-503-clerk-backend-api-allowance-single-point-of-failure.md) item 1 ships, signed-in pages read the person's own row by Clerk ID, so the lockout narrows to the billing refresh (checkout and trial card setup) and the webhook.
- **Decided.** When Clerk confirms the stale owner's current email differs, move that owner's row first, as the new-user path already does, then continue. The refusal stays for an owner that Clerk cannot confirm.

### 2. A row whose Clerk user no longer exists blocks its email permanently, and nothing repairs it (P3)

- **Evidence.** Re-signing up with the same email hits Clerk's 404 for the old ID and is refused on every request (`clerk-user-provisioner.ts:155-165`, BUG-284's fail-closed design). Such a row arises in three ways:
  1. a sign-in render whose upsert commits after the deletion. The sign-in path never reads the `deleted_clerk_users` tombstones; only the webhook does.
  2. a `user.deleted` webhook whose retries ran out;
  3. a Clerk instance switch, which is what happened in BUG-078.
- **Impact.** The deleted person's email also stays in our database, a privacy residue.
- **Decided.**
  - The sign-in path takes the existing Clerk tombstone lock, checks the tombstone and provisions in the same short transaction, using transaction-bound repositories. A separate preflight check still races deletion. Preserve the deletion path's lock order; provider reads happen outside the transaction and their result is revalidated under the lock. Prove both interleavings against real Postgres. (`DrizzleDeletedClerkUserRepository.lock` and `clerk-webhook-controller.ts` already define that lock.)
  - An operator command, with a runbook, deletes a row whose Clerk user is confirmed gone, under the same locks as the webhook.

  *Corrected 2026-10-06: the tombstone check and provisioning now share one transaction under the existing lock; a separate preflight check still raced deletion (#1410).*

### 3. A Clerk user with no email can never get an app row (P3, depends on Clerk settings)

- **Evidence.** The sign-in path throws `INTERNAL_ERROR` (`clerk-auth-gateway.ts:36-39`), and the webhook skips the user (`clerk-webhook-controller.ts:264-272`). The fallback to `emailAddresses[0]` can pick an unverified address (`clerk-user-provisioner.ts:54-64`).
- **Decided.** The owner confirms in the Clerk dashboard that a verified email is required for every sign-up method. Record the setting, and use only verified addresses.

### 4. Clerk's rate limit is a single point of failure for signed-in traffic (moved to DEBT-503 on 2026-10-05)

- **Evidence.** Every signed-in render and action calls `currentUser()`, one Clerk Backend API call (`lib/container.ts:61-65`), and Checkout makes two. Clerk documents 1,000 requests per 10 seconds in production.
- **Decided.** Read identity from the session token's claims where they suffice, and call the Backend API only for provisioning. *Moved 2026-10-05 to [DEBT-503](./debt-503-clerk-backend-api-allowance-single-point-of-failure.md), at P2 and without waiting for the traffic trigger: BUG-323 showed the allowance can be spent from outside.*

### 5. Exported payment server actions accept caller-supplied dependencies (moved to BUG-324 on 2026-10-05)

- **Evidence.** `subscribeMonthlyAction(formData, deps?)` and `subscribeAnnualAction` (`app/pricing/subscribe-actions.ts:82-94`) take an optional `deps` used for test injection. A client calls a server action with arguments of its choosing. React decodes them only as data, or as references to registered server actions, never arbitrary code. So a crafted `deps` can only fail the caller's own request, or call actions the caller could call anyway.
- **Decided.** Exported actions take only their form data and delegate to an internal function that tests inject into. Check the other `'use server'` modules for the same seam. *Moved 2026-10-05 to [BUG-324](../_archive/bugs/bug-324-server-actions-accept-caller-supplied-dependencies.md), at P1: the seam reaches every controller action, and one request can run many actions.*

### 6. Smaller items (P3)

- **`CONSENT_STATE_SECRET` is optional** in the production schema (`lib/env.ts:52`), yet "Add a card" fails without it. It is set in Production and Preview (names checked 2026-10-05). Decided: require it in production.
- **No sign-in URL prop is set** on `ClerkProvider` (`components/providers.tsx:71-77`). Clerk also reads `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL` (`@clerk/nextjs/dist/cjs/utils/mergeNextClerkPropsWithEnv.js`), so source omission alone does not prove the deployed redirect. Decided: establish one explicit app-route configuration, check the deployed environment by presence only, then test sign-in, sign-up and the return to `/pricing?plan=…`. The project environment API, read without decryption on 2026-10-06, lists neither URL variable. The reported accounts-subdomain journey remains unverified in this audit. *Corrected 2026-10-06: Clerk also reads the sign-in and sign-up URL environment variables, so a missing prop alone does not show the deployed behavior (#1410).*
- **A signed-out "Add a card" loses its way back** (`app/(app)/app/trial-payment-method-action-handler.ts:60-62`). Decided: carry a return path.
- **Deleting an account and signing up again grants a fresh 7-day trial**, because eligibility is per app row. Decided: owner's call whether to key trial eligibility on the email's history.
- **The shared E2E user's seed re-points the row by email** (`tests/e2e/helpers/seed-test-user.ts:166-168`), the reassignment BUG-284 removed from production. So the fail-closed identity path is never exercised end to end. Decided: seed by Clerk ID.

## Verification

Criteria to meet before closing: each item shipped with red-first tests, or deferred with its trigger in the register.

## Related

- [DEBT-501](./debt-501-billing-operations-resilience.md), [BUG-320](../bugs/bug-320-first-pricing-render-user-upsert-race.md): the same hunt.
- BUG-078, BUG-284 and BUG-293 (archived): earlier identity decisions this builds on.
