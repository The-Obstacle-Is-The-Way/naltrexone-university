# BUG-343: A Second Checkout Can Leave a Hidden Second Subscription

**Status:** Open — an independent audit of this record comes first; the fix follows the documentation pull requests' promotion; due 2026-10-20
**Priority:** P2
**Date:** 2026-10-13

---

## Summary

One user can end up with two live Stripe subscriptions. The sequence: two Checkout pages exist, and one completes while the request that opened the other is still running. The app keeps one subscription and reports nothing about the other. The only cleanup is a daily job, which cancels the extra subscription without a refund and logs a warning.

BUG-245's fix (2026-06-13) treated Stripe's Dashboard setting "limit customers to one subscription" as the guard that would reject the second completion. Stripe documents that setting differently:
- it redirects a customer who already holds a subscription away from the Checkout page;
- it counts only `active`, `past_due`, `unpaid` and `paused`, not `trialing`;
- Stripe does not describe it as a check at completion.

This app opens a 7-day free trial on a first checkout.

No live subscription exists yet. The window is short and needs a payment completed while another tab's request is in flight. A returning customer can be charged twice; a first-time customer gets two trials.

## Evidence

Line references are at `a57f5c0f` (`dev` after #1482) unless a line says otherwise. Stripe's behaviour is quoted from its documentation, read on 2026-10-13. Nothing here was reproduced against Stripe; the test-mode reproduction is a verification step below.

### The create path checks once, before it creates

- **The use case reads only our database.** `CreateCheckoutSessionUseCase.execute` refuses with `ALREADY_SUBSCRIBED` when the user's stored subscription is current and in a blocking status (`src/application/use-cases/create-checkout-session.ts:120-130`).
  - The trial depends only on whether a row exists: `const trialPeriodDays = subscription === null ? FREE_TRIAL_DAYS : undefined;` (`:132`, with `FREE_TRIAL_DAYS = 7` at `:25`).
  - Two concurrent first checkouts therefore both carry a trial.
- **The adapter's check is one Stripe list, before anything else** (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts:793-826`).
  - It lists the customer's subscriptions with `status: 'all'`, up to `SUBSCRIPTION_LIST_LIMIT` (10, `:24`).
  - It refuses with `ALREADY_SUBSCRIBED` if one is in `BLOCKING_SUBSCRIPTION_STATUSES`: `active`, `trialing`, `past_due`, `unpaid`, `incomplete` and `paused` (`:54-61`).
  - Nothing in the request checks subscriptions again after this list.
- **It then handles at most one open Session.**
  - It lists the customer's open Sessions with `limit: 1` (`:832-838`).
  - When that Session's price or terms differ from the request, it expires it (`expire_checkout_session:` key, `:977`).
  - An expire that fails with a message matching `'already complete'`, `'already expired'` or `'cannot be expired'` (`:65-69`) counts as success, and creation continues (`:985-997`). The comment there reads "Stripe already considers the session terminal, so the adapter can safely continue with fresh checkout creation".
- **It creates a Session keyed per plan.** The idempotency key is `checkout_session:${userId}:${plan}`, plus a trial suffix (`:492`). Two plans never share a key. The use case's own client key does not reach Stripe (the gateway ignores its options argument).
- **After the create, it reconciles open Sessions** (`reconcileOpenCheckoutSessionsAfterCreate`, `:625-695`).
  - It lists up to `OPEN_CHECKOUT_SESSION_RECONCILE_LIMIT` (10) open Sessions (`:645-646`).
  - It keeps the newest still-active one that carries renewal metadata (`:673`), and expires the other active ones (`:683`).
  - An already-terminal expire again counts as success (`:600`).
- **No lock is held.** No database or advisory lock spans these Stripe calls; the file takes none.
- **Sessions use Stripe's default lifetime.** The create parameters (`:1036-1070`) set no `expires_at`. Stripe's default is 24 hours after creation, and the allowed range is 30 minutes to 24 hours ([Stripe: expire a Session](https://docs.stripe.com/api/checkout/sessions/expire)).
- **Trial Sessions collect a card only if required.** They set `payment_method_collection: 'if_required'`, `trial_period_days` and `missing_payment_method: 'cancel'` (`:1059-1065`).

### Two completed Sessions are not prevented at completion

- **Stripe's setting.** "You can redirect customers that already have an active subscription to the customer portal or your website to manage their subscription."
  - Stripe detects such a customer "either [by] the Customer object (if you provide it in the Checkout Session) or the email address".
  - "Active subscriptions have the following four statuses: Active, PastDue, Unpaid, Paused." `trialing` is not among them.
  - The page describes no check when a Session completes ([Stripe: limit customers to one subscription](https://docs.stripe.com/payments/checkout/limit-subscriptions.md?payment-ui=stripe-hosted)).
- **What the repository says about it.** No code reads or sets the setting.
  - BUG-245 asked the owner to enable it (line 64 of its record).
  - At `a57f5c0f` no live document mentions it.
  - The lessons pull request, #1487 (not yet merged), adds to `docs/architecture/integrations/stripe.md` that the owner turned it on in live mode.
  - The live Dashboard state is not verified here: only the owner can see it.
- **BUG-245's premise.** Its record, readable at `63a8f220324b`, says:
  - "so completion of the second session is rejected even if a second session is created" (option 3, line 49);
  - "This is the completion-time-proof guard if more than one checkout URL ever exists" (line 64).
  - Its manual check, "two-tab monthly+annual repro yields one live subscription after the fix", was never ticked (line 71).
  - BUG-245 closed as Resolved on 2026-06-13 (`docs/records/closed.md:236`).
- **The one documented redirect covers a page opened later.** A page opened after the first purchase completed is redirected only if that subscription is not `trialing`. A page already open is not affected.

### The race

Two tabs, A and B, possibly for different plans. B's request passes its subscription list, because A is not complete yet. A then completes:
- after B's open-Session list, which therefore does not see A; or
- after that list, but before B's expire reaches A, which then fails as "already complete" and counts as success.

B's request creates and returns a completable Session. B's reconcile no longer sees A as open, so it keeps B.

From then on, every new checkout stops at `ALREADY_SUBSCRIBED`, so nothing expires B, and it stays completable until Stripe's 24-hour default lifetime ends. Completing B creates a second subscription.

**The window** runs from B's subscription list to B's handling of A: a few Stripe calls, which is usually well under two seconds. The file's own planning bounds allow the create and recovery path up to about 14 to 20 seconds when calls are retried (`:25-46`).

**Same-plan tabs** collapse onto one Session only while it is open. Once A is complete, B's create replays an inactive Session, and the recovery path creates a fresh one (`:526`, `:533`). This is per the code, not reproduced.

### The second subscription is invisible

- **One row per user.** `stripe_subscriptions` has a unique index on `user_id` (`db/schema.ts:256`).
- **The upsert.** It locks the user's row (`drizzle-subscription-repository.ts:119`) and asks the write guard. It returns `{ persisted: false, reason: 'write_guard_rejected' }` when the stored subscription should win (`:145`), and otherwise overwrites the row (`onConflictDoUpdate`, `:165`).
- **The write guard** (`src/domain/services/subscription-write-guard.ts:23-47`). A stored subscription that is current and entitled is replaced only by one that ranks first.
  - The ranking (`src/domain/services/subscription-canonicalization.ts:21-43`): entitled first, then the later `currentPeriodEnd`, then subscription identity.
  - So of two trials, the later-ending one owns the row, and an annual plan outranks a monthly one.
- **The webhook, on a rejected write** (`src/adapters/controllers/stripe-webhook-controller.ts:587-623`):
  - it skips the Stripe customer mapping and the initial consent record;
  - it marks the event processed.
  - The reason `write_guard_rejected` is not logged or alerted anywhere; outside tests it appears only where it is returned (`drizzle-subscription-repository.ts:145`) and in the port's type.
- **The success page** shows the stored subscription when its write is rejected (`app/(marketing)/checkout/success/checkout-success-sync.tsx:409`). It never lists the customer's subscriptions.
- **The daily reconcile** is the only code that finds a duplicate (`src/adapters/jobs/reconcile-stripe-subscriptions.ts`).
  - For each customer with a local row, it lists their subscriptions (`:118`) and keeps the blocking ones (`:129`).
  - It cancels all but the canonical one with Stripe's `subscriptions.cancel` (`:78-79`, `:305-306`). That is an immediate cancel: nothing in the job refunds or credits.
  - It logs a warning, "Canceled duplicate Stripe subscriptions" (`:328-350`). It raises no alert for a duplicate.
  - It runs at 08:00 UTC each day (`vercel.json:11-12`). It reaches only customers with a local row, and DEBT-501 item 1 records that it may not reach the tail of a growing table.

### Rules and tests

- **ADR-002** states "One subscription per user (enforced at adapter level)" (`docs/adr/adr-002-domain-model.md:131`).
- **R10** in `docs/product/business-rules.md:136` is proved by use-case tests against fakes. It reads: "A first checkout carries a 7-day trial; anyone who has had a subscription gets none; a subscription still current refuses a second checkout". No rule says a customer holds at most one live Stripe subscription, or what happens to a duplicate.
- **The concurrency tests** (`src/adapters/gateways/stripe/stripe-checkout-sessions-concurrency.test.ts:58`, `:86`) prove that same-plan creates collapse and that different-plan creates leave one completable Session. Neither test completes a Session, or adds a subscription, while a request is in flight.
- **The duplicate tests** (`src/adapters/jobs/reconcile-stripe-subscriptions-duplicates.test.ts:81-292`, eight cases) prove the cron's cancellation against fakes.
- **Not covered by any test:**
  - an expire answered "already complete";
  - a Postgres write of a second entitled subscription for the same user;
  - the webhook receiving a second subscription;
  - two completed Sessions in Stripe test mode.

## Impact

- **A returning customer** (no trial) can be charged for two subscriptions. The cron cancels one within a day, if it reaches the customer, without a refund. The owner learns of it only from Stripe or the customer.
- **A first-time customer** gets two trialing subscriptions, and so two trials.
  - A card added later is set as the default payment method of the locally stored subscription only (`src/adapters/gateways/stripe-payment-gateway.ts:165-169`).
  - The other trial has no payment method, and `missing_payment_method: 'cancel'` should end it when its trial ends, without a charge. That is an inference from Stripe's documented trial behaviour, not observed.
- **Consent.** The losing subscription's initial consent and acknowledgment are not recorded.
- **Likelihood.** Low. A purchase must be completed in one tab while another tab's checkout request is still running. A trial page needs no payment details, so it can be completed in one click.

## Options

1. **Rely on Stripe's setting.** Rejected: it does not count `trialing`, and Stripe does not describe it as a check at completion.
2. **Close the create window.**
   - Hold a per-user lock across the check, the create and the reconcile.
   - Treat an expire answered "already complete" as a sign that a subscription now exists: re-check, and refuse.
   - After the create, list subscriptions again, and expire our own Session if a blocking subscription appeared.
   - This does not cover a Session completed after the request ends.
3. **Sweep when a Checkout completes.** On `checkout.session.completed`, expire the customer's other open Sessions. That ends B's 24-hour tail seconds after A completes.
4. **Correct a duplicate within seconds.** On `customer.subscription.created`, list the customer's subscriptions. If another live one exists, cancel the one the canonical ranking puts second, refund it if charged (see Owner Decisions), record it, and alert. The daily cron stays as the backstop.
5. **Make it visible.** Alert when the write guard rejects a competing entitled subscription, and when the cron cancels a duplicate (DEBT-505's alert path).
6. **Shorten Session lifetime** with `expires_at` (30 minutes at least). This narrows the stale-page tail, and a learner who leaves a page open longer must start again.
7. **Make the app the only writer of subscriptions.** Collect the card with a setup-mode Checkout, then create the subscription from the server under the per-user lock. This closes the race completely, but it changes the purchase page, the disclosures and the consent flow.

## Resolution

Not decided. This record is audited before any choice, and no code changes until the documentation pull requests in flight are merged and promoted.

The proposal for review: options 2 to 5 together, each layer for the case the one before cannot close. Option 6 as a separate decision, and option 7 not now.

## Owner Decisions

- [ ] When a duplicate subscription is cancelled, refund any charge on it automatically? The proposal is yes: a full refund of the duplicate's charge, because the product never intends a second subscription.
- [ ] Shorten Checkout Session lifetime (option 6)?

## Verification

- [ ] An independent audit confirms every statement above against the code at `a57f5c0f` and Stripe's documentation, and the record is corrected where it is wrong.
- [ ] In Stripe test mode, a two-tab reproduction shows the race (or shows a guard this record missed), for a trial and for a returning customer, using a disposable test customer rather than the shared E2E customer.
- [ ] Tests fail first for each chosen option: an expire answered "already complete", a subscription created while a request is in flight, the completion sweep, the webhook's cancellation, and the alert.
- [ ] A business rule states that a customer holds at most one live subscription, and what happens to a duplicate, with its proving tests.
- [ ] After the fix ships, the test-mode reproduction ends with one live subscription.

## Related

- BUG-245: the two-tab duplicate whose fix this record re-examines.
- BUG-244: scheduling the reconcile that cancels duplicates.
- BUG-321: syncing a subscription Stripe holds and our database does not.
- DEBT-501 item 1: the reconcile may not reach the table's tail.
- DEBT-505: the alert path for logged-only failures.
- ADR-002: one subscription per user.
