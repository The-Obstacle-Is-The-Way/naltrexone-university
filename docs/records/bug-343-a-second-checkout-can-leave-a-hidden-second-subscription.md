# BUG-343: A Second Checkout Can Leave a Hidden Second Subscription

**Status:** Open — an independent audit of this record comes first; the fix follows the documentation pull requests' promotion; due 2026-10-20
**Priority:** P2
**Date:** 2026-10-13

---

## Summary

One user can end up with two live Stripe subscriptions. The sequence: one Checkout page is open, and it is completed while another tab's checkout request is still running. That request then hands back a second page, which stays completable for up to 24 hours. The app keeps one subscription and reports nothing about the other. The only code that acts on a duplicate is a daily job, which cancels it without a refund and logs a warning.

BUG-245 (2026-06-13) named Stripe's Dashboard setting "limit customers to one subscription" as a completion-time-proof backstop outside its fix. Its status line says the owner configured it live, with the customer-portal redirect. Stripe documents the setting as a redirect for a customer who already holds a subscription:
- it counts only `active`, `past_due`, `unpaid` and `paused` subscriptions, not `trialing`;
- Stripe does not describe it as a check at completion.

In this race the second page is first loaded after the first purchase completed. A returning customer is therefore likely redirected, if the setting is on. A first checkout carries a 7-day trial, though, and a trialing subscription is not counted, so the first-time path is unguarded.

No live-mode customer exists yet. The window is a few Stripe calls long.

## Evidence

Line references are at `a57f5c0f` (`dev` after #1482) unless a line says otherwise. Stripe's behaviour is quoted from its documentation, read on 2026-10-13. Nothing here was reproduced against Stripe; the test-mode reproduction is a verification step below.

### The create path checks once, before it creates

- **The use case reads only our database.** `CreateCheckoutSessionUseCase.execute` refuses with `ALREADY_SUBSCRIBED` when the user's stored subscription is current and in a blocking status (`src/application/use-cases/create-checkout-session.ts:120-130`).
  - The trial depends only on whether a row exists: `const trialPeriodDays = subscription === null ? FREE_TRIAL_DAYS : undefined;` (`:132`, with `FREE_TRIAL_DAYS = 7` at `:25`).
  - Two concurrent first checkouts therefore both carry a trial.
- **The adapter's subscription check is one Stripe list, before anything else** (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts:793-828`).
  - It lists the customer's subscriptions with `status: 'all'`, up to `SUBSCRIPTION_LIST_LIMIT` (10, `:24`).
  - It refuses with `ALREADY_SUBSCRIBED` if one is in `BLOCKING_SUBSCRIPTION_STATUSES`: `active`, `trialing`, `past_due`, `unpaid`, `incomplete` and `paused` (`:54-61`).
  - Nothing in the request lists subscriptions again.
- **It then handles at most one open Session** (`:832-838`, `limit: 1`).
  - It retrieves that Session with its line items.
  - If the Session matches the request but is already inactive, it creates a fresh one.
  - If the Session is for a different plan, it expires it whatever the retrieved status (`:933-953`, key `expire_checkout_session:` at `:977`). A failure there is fatal (`expireFailureIsFatal = true`, `:940-941`), so the request fails with `STRIPE_ERROR` (`:1008-1011`).
  - **The exception: an error the adapter calls terminal.** `isAlreadyTerminalSessionError` (`:420-438`) requires Stripe's `rawType` `invalid_request_error`, and then either the code `resource_missing` (`:62-64`), or a message containing `'already complete'`, `'already expired'` or `'cannot be expired'` (`:65-69`). Such an error counts as success, and creation continues (`:985-997`).
  - After a failed inspection, an expire failure is not fatal either (`:954-969`).
- **Stripe does not document the error text.** It says only: "Returns an error if the Checkout Session has already expired or isn't in an expireable state" ([Stripe: expire a Session](https://docs.stripe.com/api/checkout/sessions/expire)). The unit tests use only texts for an expired or missing Session (`stripe-checkout-sessions.test.ts:398-461`). Whether expiring a completed Session matches the terminal patterns is unverified.
- **It creates a Session keyed per plan.** The idempotency key is `checkout_session:${userId}:${plan}`, plus a trial suffix (`:492`). Two plans never share a key. The use case's client key does not reach Stripe, because the gateway ignores its options argument (`src/adapters/gateways/stripe-payment-gateway.ts:66`).
- **After the create, it reconciles open Sessions** (`reconcileOpenCheckoutSessionsAfterCreate`, `:625-692`).
  - It lists up to `OPEN_CHECKOUT_SESSION_RECONCILE_LIMIT` (10) open Sessions (`:645-646`).
  - It keeps the newest still-active one that carries renewal metadata (`:673`) and expires the other active ones (`:683`).
  - A terminal expire again counts as success (`:600`).
- **No lock spans these Stripe calls.** None would help with this race: a completion happens on Stripe's page, not in a request we serialize.
- **Sessions use Stripe's default lifetime.** The create parameters (`:1036-1070`) set no `expires_at`. Stripe: "It can be anywhere from 30 minutes to 24 hours after Checkout Session creation. By default, this value is 24 hours from creation" ([Stripe: create a Session, `expires_at`](https://docs.stripe.com/api/checkout/sessions/create?query=expires_at)).
- **The Session names the customer** (`customer`, `:1039`) and requires the terms checkbox (`consent_collection: { terms_of_service: 'required' }`, `:1043`).
- **Trial Sessions collect a card only if required.** They set `payment_method_collection: 'if_required'`, `trial_period_days` and `missing_payment_method: 'cancel'` (`:1059-1065`).

### The race

Two tabs, A and B. Tab A's Checkout page is open. B's request passes its subscription list, because A is not yet complete. A is then completed at one of three moments:
1. **Before B's open-Session list.** The list no longer returns A, because it is not open. B creates a fresh Session.
2. **After that list returned A and B's retrieve found it inactive.** This happens when A matches B's request (the same plan and terms). B creates a fresh Session.
3. **After the list, for a different plan, before B's expire reaches A.** B's expire fails.
   - If Stripe's error matches the terminal patterns, which is unverified, creation continues.
   - Otherwise B's request fails with `STRIPE_ERROR`, and this interleaving closes.

B's reconcile no longer sees A as open, so it keeps B, and B's request returns B's URL.

**The window** runs from B's subscription list to B's handling of A. That is at most three Stripe calls (the open-Session list, the retrieve, and the expire), each retried by `callStripeWithRetry`. The planning bounds at `:25-46` cover the later recovery path, not this window.

**The tail.** B stays completable until Stripe's 24-hour default ends. Every later checkout stops at `ALREADY_SUBSCRIBED` before reaching the Session code, so nothing expires B.

**Whether B can be completed** depends on Stripe's setting.
- B's page is first loaded after A completed. Stripe: "You can redirect customers that already have an active subscription to the customer portal or your website to manage their subscription." It detects them "either [by] the Customer object (if you provide it in the Checkout Session) or the email address", and "Active subscriptions have the following four statuses: Active, PastDue, Unpaid, Paused" ([Stripe: limit customers to one subscription](https://docs.stripe.com/payments/checkout/limit-subscriptions.md?payment-ui=stripe-hosted)).
- **A returning customer** (no trial): with the setting on and A `active`, B's page should redirect. Stripe does not say when it checks, and the redirect is unverified here.
- **A first-time customer**: A is `trialing`, which the setting does not count. B is completable, and completing it creates a second subscription.
- **The setting has a precondition.** Stripe: "You need to keep the login link for the customer portal enabled to keep this feature enabled. Disabling the login link disables this feature, which means that customers can create multiple subscriptions."

### What the repository says about the setting

- No code reads or sets it.
- BUG-245's record, readable at `63a8f220324b`, says:
  - its status line, line 3: "The Stripe 'limit customers to 1 subscription' → Customer portal Dashboard backstop is configured live (owner)";
  - option 3, line 49: "so completion of the second session is rejected even if a second session is created";
  - line 62 lists the setting under "Backstops remain outside this PR", and line 64 calls it "the completion-time-proof guard if more than one checkout URL ever exists";
  - its manual check, line 71, was never ticked: "two-tab monthly+annual repro yields one live subscription after the fix".
- BUG-245 closed as Resolved on 2026-06-13 (`docs/records/closed.md:236`).
- At `a57f5c0f` no live document mentions the setting. The lessons pull request, #1487 (not yet merged), adds a description of it to `docs/architecture/integrations/stripe.md`.
- The live Dashboard state is not verified here: only the owner can see it.

### The second subscription is invisible

- **One row per user.** `stripe_subscriptions` has a unique index on `user_id` (`db/schema.ts:256`).
- **The upsert** (`src/adapters/repositories/drizzle-subscription-repository.ts`):
  - it takes the per-user advisory lock, `acquireSubscriptionWriteLock` (`:113`), then locks the row `FOR UPDATE` (`:119`), and asks the write guard;
  - it returns `{ persisted: false, reason: 'write_guard_rejected' }` when the stored subscription should win (`:145`);
  - otherwise it overwrites the row (`onConflictDoUpdate`, `:165`).
- **The write guard** (`src/domain/services/subscription-write-guard.ts:23-48`). A stored subscription that is current and entitled is replaced only by one that ranks first. The ranking (`src/domain/services/subscription-canonicalization.ts:21-43`): entitled first, then the later `currentPeriodEnd`, then subscription identity.
  - Two 7-day trials rank by trial end, so the later one, B, replaces A, and the first purchase becomes the hidden one.
  - Among paid subscriptions the later period end wins, so an annual plan outranks a monthly one.
- **The webhook, on a rejected write** (`src/adapters/controllers/stripe-webhook-controller.ts:587-623`):
  - it skips the Stripe customer mapping (`:591-597`) and the initial consent and acknowledgment (`:599-610`), and marks the event processed (`:623`);
  - `stripe-webhook-controller-subscription-writes.test.ts:231` pins the consent skip as intended;
  - the reason `write_guard_rejected` is not logged or alerted anywhere: outside tests it appears only where it is returned (`:145`) and in the port's type.
- **The success page** shows the stored subscription when its write is rejected (`app/(marketing)/checkout/success/checkout-success-sync.tsx:409`). It never lists the customer's subscriptions.
- **BUG-321's sync** runs when a checkout is refused. It lists every blocking subscription on the customer, records the canonical one, and reports nothing about the rest (`src/adapters/gateways/stripe/stripe-customer-subscriptions.ts:38-69`; `src/application/shared/sync-customer-subscription.ts:46-59`).
- **The daily reconcile** is the only code that acts on a duplicate (`src/adapters/jobs/reconcile-stripe-subscriptions.ts`).
  - For each customer with a local row, it lists their subscriptions (`:118`) and keeps the blocking ones (`:129`), `trialing` included (`:22-29`).
  - It cancels all but the canonical one with Stripe's `subscriptions.cancel` (`:78-79`, `:305-306`).
  - It logs a warning, "Canceled duplicate Stripe subscriptions" (`:328-352`), and raises no alert for a duplicate.
  - It runs at 08:00 UTC each day with `dryRun=false` (`vercel.json:11-12`). DEBT-501 item 1 records that it may not reach the tail of a growing table.
  - It marks consent terminated only for the canonical subscription (`:279-284`).
- **What Stripe's cancel does** ([Stripe: cancel a subscription](https://docs.stripe.com/api/subscriptions/cancel)). "Cancels a customer's subscription immediately."
  - `invoice_now` and `prorate` both default to `false`, so nothing is credited or refunded; a refund needs the Refunds API.
  - "By default, upon subscription cancellation, Stripe stops automatic collection of all finalized invoices for the customer." The reconcile passes no option that changes this. So cancelling a duplicate also stops collection of any finalized, unpaid invoice on the subscription it keeps.

### Rules and tests

- **ADR-002** states "One subscription per user (enforced at adapter level)" (`docs/adr/adr-002-domain-model.md:131`).
- **R10** in `docs/product/business-rules.md:136` reads: "A first checkout carries a 7-day trial; anyone who has had a subscription gets none; a subscription still current refuses a second checkout". It is proved by use-case tests against fakes. No rule says a customer holds at most one live Stripe subscription, or what happens to a duplicate.
- **The concurrency tests** (`src/adapters/gateways/stripe/stripe-checkout-sessions-concurrency.test.ts:58`, `:86`) prove that same-plan creates collapse, and that different-plan creates leave one completable Session.
- **The webhook tests** cover a rejected Checkout completion (`stripe-webhook-controller-subscription-writes.test.ts:231`) and a second canceled or unpaid subscription (`:248`, `:258`).
- **The duplicate tests** (`src/adapters/jobs/reconcile-stripe-subscriptions-duplicates.test.ts:81-315`, eight cases) prove the cron's cancellation against fakes.
- **The maintained fake diverges from Stripe.** `FakeStripeCheckoutClient.expire` marks any Session expired, a completed one included, without an error (`src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client.ts:422-431`). Stripe refuses to expire a Session that is not `open`. The divergence is not listed in `docs/guides/testing/fake-contracts.md`. No unit test built on the fake can observe interleaving 3.
- **Not covered by any test:**
  - a Session completed while a checkout request is in flight;
  - an expire refused because the Session is complete;
  - a second *entitled* subscription arriving at the webhook, or written to Postgres for the same user;
  - the Dashboard redirect;
  - two completed Sessions in Stripe test mode.

## Impact

- **A first-time customer**, the unguarded path, can get two trialing subscriptions.
  - Access comes from one row, so this grants no extra time: it is two Stripe objects, and the first one is hidden.
  - The daily reconcile counts `trialing` and should cancel the hidden one within a day, if it reaches the customer.
  - If it does not, the hidden trial has no payment method. A card added later is attached to the customer (`src/adapters/gateways/stripe-payment-gateway.ts:111-122`), but is set as the default only on the stored subscription (`src/application/use-cases/create-trial-payment-method-setup-session.ts:67-68`, through the gateway at `:165-169`).
  - Stripe checks "`default_source` and `default_payment_method` on the subscription and customer" ([Stripe: free trials](https://docs.stripe.com/billing/subscriptions/trials/free-trials)), so `missing_payment_method: 'cancel'` should end the hidden trial at its end, without a charge. That is an inference, not observed.
- **A returning customer** is charged twice only if Stripe's redirect does not stop B: the setting is off, the portal login link is off, or A is not in a counted status.
  - Then the cron cancels one within a day, if it reaches the customer, without a refund.
  - Per Stripe's default, that cancel also stops collection of finalized invoices on the kept subscription.
  - The owner learns of it only from Stripe or the customer.
- **Consent.**
  - A rejected write skips the initial consent and acknowledgment. That happens when a lower-ranked completion arrives after a higher-ranked one is stored: a monthly after an annual, or webhooks delivered out of order. For two trials completed in order, B is accepted, and both consents are recorded.
  - The hidden subscription's consent record is never marked terminated when it is cancelled. The webhook marks termination only on a persisted write (`stripe-webhook-controller.ts:612-621`), and the reconcile only for the canonical subscription.
- **Likelihood.** Low. A purchase must be completed in one tab while another tab's checkout request is still running. A trial page needs the terms checkbox and one click, and no payment details.

## Options

1. **Rely on Stripe's setting.** Rejected as the guard: it does not count `trialing`, and Stripe does not describe it as a check at completion. It stays on, with its portal login link, for returning customers.
2. **Re-check after the create.**
   - After the create and the reconcile, list the customer's subscriptions again. If a blocking one appeared, expire our new Session and refuse with `ALREADY_SUBSCRIBED`.
   - On any expire failure, retrieve the Session and act on its status (`complete` means refuse) instead of on Stripe's error text.
   - This covers interleavings 1 to 3. A per-user lock adds nothing for this race: the completion happens on Stripe's page, and the reconcile already handles two concurrent creates.
3. **Sweep when a Checkout completes.** On `checkout.session.completed`, expire the customer's other open subscription-mode Sessions. This ends the 24-hour tail when B already exists. When B is created after A's webhook, option 2's re-check catches it.
4. **Correct a duplicate within seconds.** On `customer.subscription.created`, list the customer's subscriptions. If another live one exists:
   - cancel the one the canonical ranking puts second;
   - refund it through the Refunds API if it was charged (see Owner Decisions);
   - mark its consent terminated, and alert.
   - Stripe's cancel stops collection of the customer's finalized invoices, so the cancel must not leave the kept subscription's invoices uncollected.
   - The daily reconcile stays as the backstop, with the same cancellation fixes.
5. **Make it visible.** Alert when the write guard rejects a competing entitled subscription, when BUG-321's sync sees more than one blocking subscription, and when the cron cancels a duplicate (DEBT-505's alert path).
6. **Correct the fake.** Make `FakeStripeCheckoutClient.expire` refuse a Session that is not `open`, as Stripe does, and record the correction in the fake-contract register, so tests can observe the race.
7. **Shorten Session lifetime** with `expires_at`, 30 minutes at least. This narrows the tail, but a learner who leaves a page open longer must start again.
8. **Make the app the only writer of subscriptions.** Collect the card with a setup-mode Checkout, then create the subscription from the server. This closes the race completely, but it changes the purchase page, the disclosures and the consent flow.

## Resolution

Not decided. This record is audited before any choice, and no code changes until the documentation pull requests in flight are merged and promoted.

The proposal for review: options 2 to 6 together, each layer for the case the one before cannot close. Option 7 as a separate decision, and option 8 not now.

## Owner Decisions

- [ ] When a duplicate subscription is cancelled, refund any charge on it automatically? The proposal is yes: a full refund of the duplicate's charge, because the product never intends a second subscription.
- [ ] Shorten Checkout Session lifetime (option 7)?
- [ ] Confirm in the live Dashboard that "limit customers to one subscription" is on, and that the customer portal's login link is enabled.

## Verification

- [x] An independent audit checked every statement against the code at `a57f5c0f` and Stripe's documentation (2026-10-13): 18 findings, four substantive, all folded into this text.
- [ ] A second audit of this corrected text finds nothing material.
- [ ] In Stripe test mode, with a disposable test customer (not the shared E2E customer), a two-tab reproduction:
  - captures Stripe's actual error for expiring a completed Session;
  - shows whether the redirect stops B with the setting on;
  - shows the race, or a guard this record missed, for a trial and for a returning customer.
- [ ] Tests fail first for each chosen option: a Session completed in flight, an expire refused for a completed Session, the completion sweep, the webhook's correction and its collection handling, and the alerts.
- [ ] A business rule states that a customer holds at most one live subscription, and what happens to a duplicate, with its proving tests.
- [ ] After the fix ships, the test-mode reproduction ends with one live subscription.

## Related

- BUG-245: the two-tab duplicate whose backstop this record re-examines.
- BUG-244: scheduling the reconcile that cancels duplicates.
- BUG-321: syncing a subscription Stripe holds and our database does not.
- DEBT-501 item 1: the reconcile may not reach the table's tail.
- DEBT-505: the alert path for logged-only failures.
- ADR-002: one subscription per user.
