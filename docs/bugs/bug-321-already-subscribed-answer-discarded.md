# BUG-321: Stripe's "Already Subscribed" Answer Is Discarded for Signed-In Users

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — filed 2026-10-05; resolution decided below
**Priority:** P2
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

When Stripe already holds a subscription that our database does not, a signed-in user who presses "Start free trial" or "Subscribe" lands back on the same pricing page with no message. Stripe has refused a second Checkout, the page has ignored that answer, and the user can press again indefinitely.

If our database never learns of that subscription, the person is stuck. This happens when the success page's sync did not run and the webhook keeps failing. They may be paying, yet they have no access, the page still offers them a trial, and the only route to the billing portal (`/app/billing`) requires the access they lack.

## Evidence

- **Stripe refuses.** The gateway sees a live subscription on the customer and throws `ALREADY_SUBSCRIBED` (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts:788-823`). That check has no period-end test, while our database check does (`src/application/use-cases/create-checkout-session.ts:117-127`).
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
2. **On `ALREADY_SUBSCRIBED`, sync that customer's subscriptions from Stripe before redirecting.** This uses the existing reconcile-by-customer path. The database then reflects what Stripe holds, and the page shows the true state: access, or "Manage billing".
3. **Show a one-time "you already have a subscription" notice** carried by the action, with a portal link built from the Stripe customer.

## Resolution (decided)

Option 2, because it repairs the cause: the database learns of the subscription at the moment the user needs it. If the sync itself fails, Option 3's notice explains the state and offers the portal, so the user is never left without a message. BUG-275's protection against stale links stays.

## Verification

Criteria to meet before closing; none is met yet.

- [ ] An `ALREADY_SUBSCRIBED` refusal with no local row syncs the subscription, and the user gains access. Red first, with the fake Stripe gateway.
- [ ] A sync that fails still shows a message and a portal link.
- [ ] The test that locks in the old behaviour is replaced by tests of both outcomes.
- [ ] BUG-275's stale-link case still shows the database's state.

## Related

- [BUG-319](./bug-319-subscribe-actions-break-after-a-deploy.md), [BUG-322](./bug-322-checkout-error-hidden-behind-dialog.md), [DEBT-501](../debt/debt-501-billing-operations-resilience.md): the same hunt.
- BUG-275 (archived): the stale-return-link fix this must preserve.
