# BUG-321: Stripe's "Already Subscribed" Answer Is Discarded for Signed-In Users

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — the fix is in production; a Stripe test-mode E2E of the refused checkout remains
**Priority:** P2
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

When Stripe already holds a subscription that our database does not, a signed-in user who presses "Start free trial" or "Subscribe" lands back on the same pricing page with no message. Our Stripe adapter has refused to create a second Checkout, the page has ignored that answer, and the user can press again indefinitely.

If our database never learns of that subscription, the person is stuck. This happens when the success page's sync did not run and the webhook keeps failing. They may be paying, yet they have no access, the page still offers them a trial, and the only route to the billing portal (`/app/billing`) requires the access they lack.

## Evidence

All line references in this section are at `9ee53ea9`, before the fix. The shipped flow is described under Progress; it was promoted through #1394 (`71964450`), assigned to production at 2026-10-06T08:37:25.065Z.

- **The adapter refuses.** The gateway sees a live subscription on the customer and throws `ALREADY_SUBSCRIBED` (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts:788-823`). That check has no period-end test, while our database check does (`src/application/use-cases/create-checkout-session.ts:117-127`).
- **The page ignores the refusal.** The action redirects to `/pricing?reason=manage_billing` (`app/pricing/subscribe-action.ts:42-44`). For signed-in users the page uses the database's reason and drops the URL's: `effectiveReason = pricingData.isAuthenticated ? (pricingData.reason ?? undefined) : (reason ?? undefined)` (`app/pricing/page.tsx:198-200`).
- **A test locks this in.** `app/pricing/page-trial.test.tsx:198-226` asserts that a signed-in user with no local row and `?reason=manage_billing` sees the trial button and no "Manage billing". The behaviour came from BUG-275's fix (`cb58133a`), which rightly stopped stale return links from overriding the real state. But it also discards a fresh refusal from Stripe.
- **When the database is behind Stripe:**
  - A first-time subscriber whose success-page sync did not run and whose webhook is slow or failing. The daily reconcile walks only existing rows (`reconcile-stripe-subscriptions.ts:70`), so a subscription never recorded is never repaired.
  - A trial converting with a saved card. For seconds, until the webhook lands, the database still shows the trial past its period end while Stripe says `active`.
  - A renewal whose webhook was missed, until the next daily reconcile.

## Impact

In the usual case, the page loops with no explanation for seconds or minutes. In the worst case, a paying subscriber has no access and no way to manage billing, until someone repairs the record by hand.

## Options

1. **Honor the URL's `reason` again.** Rejected: it reintroduces BUG-275's stale-link problem.
2. **On `ALREADY_SUBSCRIBED`, sync that customer's subscriptions from Stripe before redirecting.** The database then reflects what Stripe holds, and the page shows the true state: access, or "Manage billing". (Corrected 2026-10-06: the record first said this "uses the existing reconcile-by-customer path". No such path exists. The daily reconcile lists a customer's subscriptions only for a customer it reached through an existing row, and it also cancels duplicates, which must never run on a user's request. So the sync has to be built.)
3. **Show a one-time "you already have a subscription" notice** carried by the action, with a portal link built from the Stripe customer.

## Resolution (decided)

Option 2, because it repairs the cause: the database learns of the subscription at the moment the user needs it. If the sync itself fails, Option 3's notice explains the state and offers the portal, so the user is never left without a message. BUG-275's protection against stale links stays.

**Design (2026-10-06, from a read-only design review of the current code):**
- **Only the Stripe adapter's refusal triggers it.** `CreateCheckoutSessionUseCase` catches the gateway's `ALREADY_SUBSCRIBED`, syncs, then rethrows the original error.
  - The database's own refusal never reaches the gateway, so a subscriber who is already recorded triggers no sync.
  - Checkout errors are not cached under the idempotency key, so a retry runs the use case again.
- **A new port method, `PaymentGateway.listBlockingCustomerSubscriptions`.** The gateway's refusal knows only a subscription's ID and status. And a webhook could write between that listing and our version read. So the sync fetches each subscription afresh, after reading the version.
  - The Stripe adapter lists the customer's subscriptions and keeps those the refusal treats as blocking.
  - It retrieves and normalizes each one through the existing path, which requires `metadata.user_id`.
  - It only reads: it never cancels or changes a subscription.
- **A new helper, `syncCustomerSubscriptionFromProvider`, in `src/application/shared/`.**
  - It picks the canonical subscription with the existing comparator.
  - It persists it through `persistSubscriptionObservation`, with the version fence and the per-user write lock that every writer uses.
  - It refuses any subscription whose `user_id` or customer is not the signed-in user's.
- **Security.** The customer ID comes only from our own mapping for the signed-in user; the action takes no customer ID.
- **The page.**
  - The action redirects to `/pricing?checkout=already_subscribed`. The page still takes its state from the database.
  - A synced subscriber sees access or "Manage billing".
  - Only a signed-in user who is still not entitled, and has no billing-recovery reason, also sees a notice with a "Manage billing" button.
- **Why this does not reopen BUG-275.** The new parameter is never put into a sign-up return link. A stale copy of it can only add a notice; it never changes what the page offers. `reason=manage_billing` stays ignored for signed-in users.

## Progress

**2026-10-06, the fix.** Tests were written red first, in this order.
1. **The port and the fake.** `PaymentGateway.listBlockingCustomerSubscriptions` returns `SubscriptionObservation`s, the type the webhook already produced. `FakePaymentGateway` gains a canned checkout error and canned listings; the test-double register re-adjudicates its waiver.
2. **The sync** (`src/application/shared/sync-customer-subscription.ts`).
   - It records the canonical blocking subscription through `persistSubscriptionObservation`.
   - It writes nothing when a listed subscription names another user or customer, and fails when none is listed.
   - It keeps a row the write guard prefers.
3. **The trigger** (`create-checkout-session.ts`).
   - Only the gateway's `ALREADY_SUBSCRIBED` runs the sync, then the original refusal is rethrown.
   - A failed sync is logged as `Could not record the subscription Stripe holds for a refused checkout`.
   - The database's own refusal, and any other checkout failure, run no sync.
4. **The Stripe adapter** (`stripe-customer-subscriptions.ts`).
   - It lists with the same blocking statuses as the refusal, and retrieves and normalizes each subscription.
   - It refuses a subscription without `metadata.user_id`, one that another E2E run owns, or one under another customer.
   - It is tested over the contracted `FakeStripeCheckoutClient`.
5. **The page.**
   - The action redirects to `/pricing?checkout=already_subscribed`.
   - The page shows the database's state: access once the sync recorded it, or the billing card for a record that needs attention.
   - It adds a notice with a Manage billing button, beside the plans, only for a signed-in user who is still not entitled and has no billing-recovery reason.
   - A signed-out visitor sees nothing.
6. **Docs.** ADR-014 gains a dated amendment, and the subscription write-lock comment names this writer. The upsert takes the lock in its own transaction.

**2026-10-06, the independent review's findings** (same pull request). It found no P0 to P2 issue; the fixes are below.
- **The failure log names the app's reason,** its own error message, so each failure can be explained. Logging cannot change the refusal.
- **The notice states only what happened.** "Stripe reported an existing subscription on your account when you tried to check out." A stale URL can show it, and the sync can also succeed for a subscription whose period has ended.
- **It now says "view or cancel" and names support.** With no local row the billing portal opens in its trial profile, which does not let a person update a card.
- **The new Stripe read records its worst-case cost.** A refusal that carries an idempotency key is tested.

## Verification

- [x] An `ALREADY_SUBSCRIBED` refusal from Stripe with no local row syncs the subscription, and the page then shows the user as subscribed. This is covered by the use case, sync and page tests, red first, with the fake Stripe gateway.
- [x] A sync that fails still shows a message and a portal link: the notice and its Manage billing button. The portal lets the person view or cancel; the notice names support for a card update.
- [x] The old test is kept as BUG-275's guard, because the new flow uses its own parameter, and new tests cover both outcomes.
- [x] BUG-275's stale-link case still shows the database's state.
- [ ] Engineering, by 2026-10-20: a Stripe test-mode E2E reproduces the case end to end. A test customer holds a live subscription with no local row; pressing Subscribe syncs it and the page shows the person as subscribed. A run whose sync fails shows the notice and the portal link. The tests above use the fake gateway, so only a real-provider run proves Stripe's list response and the sync together.
- **Known limit.** A failed sync in production is visible for an hour at most: it goes only to pino, Vercel Hobby keeps runtime logs for one hour, and nothing forwards it to Sentry. Production outcomes of this path therefore cannot close this record; [DEBT-505](../debt/debt-505-logged-only-failures-alert-nobody.md) makes such failures visible.

*Corrected 2026-10-06 (#1410 review): the one-hour production capture had no exit, because the case is rare; replaced by a reproducible test-mode run.*

*Corrected 2026-10-06: the two-week log check was not observable. The account API confirms Vercel Hobby, whose [runtime logs](https://vercel.com/docs/logs/runtime) retain one hour. `lib/logger.ts` writes pino to stdout; `instrumentation.ts` does not forward those lines to Sentry. The caught sync failure logs but is not thrown to `onRequestError`.*

## Related

- [BUG-319](./bug-319-subscribe-actions-break-after-a-deploy.md), [BUG-322](../_archive/bugs/bug-322-checkout-error-hidden-behind-dialog.md), [DEBT-501](../debt/debt-501-billing-operations-resilience.md): the same hunt.
- BUG-275 (archived): the stale-return-link fix this must preserve.
