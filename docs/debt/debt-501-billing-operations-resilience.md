# DEBT-501: Billing Operations Can Leave Payers Without Access as the Service Grows or Changes

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — decided per item; items 1 and 2 first
**Priority:** P2
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

The owner-requested adversarial hunt of the payment flows (2026-10-05) found no defect that charges an ordinary Checkout buyer without granting access. It did find gaps in billing operations. Each one can leave a payer without access, or charge someone twice, when the service grows, an operator changes something, or timing is unlucky. Each item names its trigger. Source inspection establishes the failure paths, not that no production account has encountered them. The live (non-test) purchase path has never been recorded working end to end.

## Items

### 1. The daily reconcile never reaches the tail once the table grows (P2)

- **Evidence.**
  - The all-pages sweep starts at offset 0 on every run (`src/adapters/jobs/reconcile-all-stripe-subscription-pages.ts:131`) and stops after a 40-second budget (`:12`, `:142-147`). It logs "resume at offset N", but nothing ever resumes there: the cron passes no offset (`app/api/cron/reconcile-stripe-subscriptions/route-handler.ts:220-221`).
  - Rows are never removed, so canceled subscriptions and lapsed trials count too.
- **Trigger.** Somewhere between roughly 500 and 1,000 rows (an estimate, not measured).
- **Impact.** For users past that point, a missed webhook is never repaired. A stopped-early run that overruns `maxDuration = 60` also kills the deleted-account cleanup that runs after it (BUG-262's safety net).
- **Decided.** Record each row's last reconcile attempt and process rows oldest first by one key: the last attempt, or the row's creation time (`created_at`) if it has never been attempted, then by ID. Stamp every attempt (`last_attempted_at`), and record a failed attempt's error separately, so a row that keeps failing moves to the back instead of starving the tail. New rows queue behind older ones rather than ahead of every retry, so every row is reached in turn with no cursor or run state, even under sustained inserts. A crashed or stopped-early run leaves its unstamped rows first in line, and overlapping runs only repeat idempotent work. Do not exclude a row solely because its local status is terminal: repairing stale local state is this job's purpose. Any pruning policy needs an independently justified terminal-state contract. Test the ordering, a crash mid-run, interleaved inserts and deletes, sustained inserts (earlier rows are still retried), and provider failure against real Postgres.

  *Corrected 2026-10-06: oldest-first order replaces #1410's keyset cursor with wraparound, checkpoints and run coordination, which needed more state for the same guarantee; terminal rows stay included, as #1410 decided (#1410 review).*

### 2. Only one price ID per plan is recognized (P2)

- **Evidence.** `getSubscriptionPlanFromPriceId` matches only the current environment's monthly and annual IDs (`src/adapters/config/stripe-prices.ts:15-22`). Any other ID fails:
  - webhooks return 500 (`stripe-subscription-normalizer.ts:99-105`);
  - reads throw `INTERNAL_ERROR` (`drizzle-subscription-repository.ts:44-51`), as in DEBT-310's incident;
  - reconcile rows fail;
  - the success page redirects with `unknown_plan`.
- **Trigger.** Any change of Price for new customers. DEBT-414 freezes existing subscribers' prices, and the portal disables plan changes, so a new Price plus an environment change is the expected way to change a price. That change would lock out every existing subscriber.
- **Decided.** A recognized list of legacy price IDs per plan, configured alongside the current ones. Add an operator check that refuses a price change while live subscriptions use an ID the list doesn't hold. Until this ships, the runbook must say: never change a price ID.

### 3. A subscription created outside the app's Checkout is acknowledged and dropped (P3)

- **Evidence.** The normalizer requires `subscription.metadata.user_id` (`stripe-subscription-normalizer.ts:37-55`). The controller logs `metadata_missing` and returns 200 without recording the event (`stripe-webhook-controller.ts:679-689`), although the customer's own `metadata.user_id` and the `stripe_customers` mapping could identify the user.
- **Trigger.** Support creating a subscription in the Dashboard (the natural repair for "I paid but can't get in"), a Payment Link, or a script.
- **Decided.** Fall back only to the trusted local `stripe_customers` mapping, with explicit agreement checks when subscription metadata is present. Customer metadata alone is not an ownership authority. Persist an unresolved outcome in the event ledger with a retry or operator disposition; a receipt marked handled must not make later repair impossible. Prove missing, conflicting and subsequently repaired mappings through signed-webhook integration cases.

  *Corrected 2026-10-06: the fallback is limited to the trusted `stripe_customers` mapping, with agreement checks when subscription metadata is present; customer metadata is not an ownership authority (#1410).*

### 4. A card added at or after trial end is never applied (P3)

- **Evidence.**
  - The trial is checked only when the add-card session is created (`create-trial-payment-method-setup-session.ts:57-65`).
  - The session lasts Stripe's default 24 hours (`stripe-checkout-sessions.ts:276-299`, no `expires_at`).
  - With `missing_payment_method: 'cancel'`, Stripe cancels at trial end. [Stripe documents canceled subscriptions as largely immutable](https://docs.stripe.com/api/subscriptions/cancel), allowing updates only to metadata and cancellation details. The handler's default-payment-method update can therefore fail after cancellation. Repeated webhook failure is a possible outcome; its duration has not been reproduced.
  - The billing page only says "Stripe is confirming your card".
- **Options.** Expiration alone cannot prevent a completion racing cancellation. Stripe accepts `expires_at` only 30 minutes–24 hours after creation ([API reference](https://docs.stripe.com/api/checkout/sessions/create)), so setting it to every trial end is invalid.
- **Decided.** Set expiry to the earlier of trial end and 24 hours only when at least 30 minutes remain; otherwise refuse a new setup with an explicit recovery message. Recheck the provider subscription at completion and treat a canceled trial as a terminal business outcome, without renewal consent or an acknowledgment that promises renewal. Offer paid Checkout only when the existing subscription no longer blocks it. Test the expiry bounds and completion/cancellation race through the provider contract and real-Postgres persistence.

  *Corrected 2026-10-06: the original expiry-only decision omitted Stripe's bounds and the completion race.*

### 5. The success page tells someone who paid that "Checkout failed" (P3)

- **Evidence.** Every validation failure in `app/(marketing)/checkout/success/checkout-success-sync.tsx` redirects to `?checkout=error`. That includes `user_id_mismatch` (`:190-196`): paid on account A, returned signed in to account B. B can then buy again, creating a second customer and a second charge.
- **Decided.** A specific message for a mismatched account ("This purchase belongs to another account"), and no repurchase offer on that path.

### 6. The Stripe circuit breaker also counts ordinary 4xx errors (P3)

- **Evidence.** `src/adapters/shared/circuit-breaker.ts:62-76` counts every thrown error, and one breaker is shared per instance (`stripe-retry.ts:11-16,43`). Five consecutive client errors fail every Stripe call in that instance for 60 seconds, Checkout included.
- **Decided.** Count only transient failures: network errors, 5xx and 429.

### 7. Stripe settings not recorded in the repository (P3, owner)

- Not recorded: the live webhook endpoint's event list (last recorded in DEBT-406, before the add-card flow, so `checkout.session.expired` may be missing), the live Price IDs, and the live Checkout payment-method settings.
- No live-mode purchase has been recorded working end to end. All hosted E2E tests run in test mode, and a paid monthly Checkout has none.
- **Decided.** The owner makes one live purchase followed by a refund, under DEBT-465 Part 4's QA procedures, and records the live webhook's events.

### 8. The checkout guard reads only the customer's first 10 subscriptions (P3)

- **Evidence.** `createStripeCheckoutSession` lists the customer's subscriptions with `status: 'all'` and `limit: SUBSCRIPTION_LIST_LIMIT` (10), with no paging (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts`, the blocking check before session creation). Stripe lists newest first, and `all` includes ended subscriptions.
- **Trigger.** A customer whose blocking subscription has more than ten of their other subscriptions listed ahead of it. The guard then misses it, and a second, double-billed subscription can start.
- **Not BUG-321's sync.** BUG-321's sync (2026-10-06) reads the same first page in the same order, and runs only after this guard refused. A second listing usually sees the subscription that caused the refusal, but the two calls are not a snapshot: concurrent changes can alter the first page. The sync already fails safely when it cannot find a blocker; this is not proof that it always sees the original one. Raised by CodeRabbit on #1393 and adjudicated there.
- **Decided.** Page the guard's listing with `starting_after` while `has_more`, under a stated bound, and give BUG-321's listing the same paging. If the bound is exhausted before absence is proved, refuse Checkout with a recoverable error; never treat a truncated list as no blocking subscription. The adapter-owned `FakeStripeCheckoutClient` pages Checkout sessions but not subscriptions, so its subscription list and its shared contract scenario gain paging first.

  *Corrected 2026-10-06: an exhausted bound now refuses Checkout with a recoverable error, instead of treating a truncated list as absence (#1410).*

## Verification

Criteria to meet before closing: each item shipped with red-first tests, or deferred with its trigger in the register; and item 7's live purchase recorded.

## Related

- [BUG-319](../bugs/bug-319-subscribe-actions-break-after-a-deploy.md), [BUG-320](../bugs/bug-320-first-pricing-render-user-upsert-race.md), [BUG-321](../bugs/bug-321-already-subscribed-answer-discarded.md), [BUG-322](../_archive/bugs/bug-322-checkout-error-hidden-behind-dialog.md), [DEBT-502](./debt-502-account-identity-and-action-hardening.md): the same hunt.
- DEBT-422 (archived): reconcile paging deferred, without this item's restart-at-zero starvation.
