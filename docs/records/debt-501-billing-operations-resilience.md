# DEBT-501: Billing Operations Can Leave Payers Without Access as the Service Grows or Changes

**Status:** Open — build item 9's reconcile watch (not built; no session holds it); then item 7's owner session; due 2026-11-22
**Priority:** P2
**Date:** 2026-10-05

---

## Summary

The owner-requested adversarial hunt of the payment flows (2026-10-05) found no defect that charges an ordinary Checkout buyer without granting access. It did find gaps in billing operations. Each can leave a payer without access, or charge someone twice, when the service grows, an operator changes something, or timing is unlucky. Each item names its trigger. No live purchase has been recorded working end to end.

## Items

Items 5 and 6 are done (2026-10-09), and item 4's completion recheck shipped with BUG-364. **Before the first live sale** (decided 2026-10-08 and 2026-10-30): item 9, then item 7. Items 1, 2 and 3 wait for their triggers and become Waiting rows when this record closes. Item 4's expiry bound is declined and item 8 is Won't Fix.

**Shared billing contract (adopted 2026-10-17, DEBT-524).** The first implementation of item 2, or of BUG-343's option 4a if the Waiting row BUG-343 leaves at closing revives it, defines it before extracting code: fact authority, the observation-version fence, deletion lock order, and each caller's consent and cancellation permissions. ADR-014's read-only refused-checkout sync and ADR-027's webhook consent evidence stay unless those ADRs are amended. ADR-002's single local row does not prevent two provider subscriptions.
- Share observation and persistence policy only where those changes need it; keep SDK normalization and retries in adapters, and preserve each caller's side effects.
- A broader import guard requires a demonstrated invariant first.
- Not a separate refactor gate: it is part of the work that first needs it.

### 1. The daily reconcile never reaches the tail once the table grows (P2) — waits for its trigger

- **Evidence.** The all-pages sweep starts at offset 0 on every run (`src/adapters/jobs/reconcile-all-stripe-subscription-pages.ts:132`) and stops after a 40-second budget (`:13`). It logs "resume at offset N", but the cron passes no offset (`app/api/cron/reconcile-stripe-subscriptions/route-handler.ts:232-233`). Rows are never removed. A stopped-early run that overruns `maxDuration = 60` also kills the deleted-account cleanup after it (BUG-262's safety net).
- **Trigger.** The cron raises `stripe_reconcile_stopped_early` (built 2026-10-10), an estimated 500 to 1,000 rows from now. Item 9 makes sure the cron runs at all.
- **Decided: oldest-first order, no cursor.**
  - Record each row's last attempt and process rows oldest first by `coalesce(last_attempted_at, created_at)`, then ID. Claim each row before its Stripe call with one committed `update … set last_attempted_at = clock_timestamp() where id = $1 and coalesce(last_attempted_at, created_at) < $start returning id`; skip a row whose claim returns nothing. Claims change neither `version` nor `updated_at`.
  - `$start` is read from the same database clock before the first page. The claim uses `clock_timestamp()`, not `now()`, because `now()` is when its transaction began and can precede the run's start.
  - A row whose claim fails is left out of the run's remaining pages. Record the outcome or error after the Stripe call, so a row that keeps failing moves to the back instead of starving the tail.
  - One run at a time: a run holds a Postgres advisory lock for its whole length, and a run that cannot take it exits without claiming or canceling anything, so two runs never claim the same row or cancel each other's choices.
  - Each page reads afresh from the head of that order, taking only rows earlier than the run's start, so no row is attempted twice in a run. Remove the `offset` parameter; `scope=page` takes the next `limit` rows.
  - Check time before each claim, and reserve a cleanup budget inside `maxDuration`. Bound the drain's customer deletes and their retries to the remaining cleanup time. Prove that slow reconciliation cannot consume cleanup's reserved time; separate `try` blocks alone do not.
  - Keep terminal rows: repairing stale local state is the job's purpose. Any pruning policy needs an independently justified terminal-state contract.
  - Before shipping, specify discovery for customers with no local subscription row, which the local-row scan cannot reach (`src/adapters/jobs/reconcile-stripe-subscriptions.ts:70`), and name the residual for absent customer mappings. Do not mark coverage complete from a local-row scan.
  - Tests against real Postgres: the order, a crash mid-run, interleaved and sustained inserts, at most one attempt per row per run (including a claim written in a transaction begun before the run's start was read), a concurrently claimed or deleted row, a failed claim, the budget, two overlapping runs (the second exits without claiming) and provider failure.

### 2. Only one price ID per plan is recognized (P2) — waits for its trigger

- **Evidence.** `getSubscriptionPlanFromPriceId` matches only the current environment's monthly and annual IDs (`src/adapters/config/stripe-prices.ts:15-22`). Any other ID fails: webhooks return 500 (`stripe-subscription-normalizer.ts:100-105`), reads throw `INTERNAL_ERROR` (`drizzle-subscription-repository.ts:44-51`), as in DEBT-310's incident, reconcile rows fail, and the success page redirects with `unknown_plan`. The renewal job also selects subscribers by today's price IDs and states today's configured amounts (`src/adapters/jobs/send-due-renewal-notices.ts:77`, `:208`, `:280`, `:449`, `:618`), so after a price change existing subscribers would get no notice, or one stating the wrong amount.
- **Who it locks out today.** Production already holds subscription rows: by the owner's account (2026-10-13), real people took live trials, and a row is removed only with its user (`db/schema.ts:230-232`). A changed price ID would make every read of those rows throw and the reconcile fail them. The price-ID rule in `docs/architecture/environments.md` (done 2026-10-09) is the only guard, and it is in force.
- **Moved to Waiting** by the owner, 2026-11-15, and removed from the pre-sale list. Trigger: a change of either price ID is planned, in any environment; the rule forbids making it first. Item 7's live purchase confirms that today's live Prices charge what the consent text states.
- **Decided 2026-10-10: a subscription's plan is a recorded fact.**
  1. When the webhook, the reconcile or the success sync learns of a subscription, take the plan from Stripe's Price (`recurring.interval`, accepted only for our product) and store plan, amount and currency, in nullable columns filled by every write and by the reconcile. Reads fall back to today's mapping until production has no empty row; a second migration then makes them required and removes the fallback.
  2. Reads use the stored plan. Only Checkout creation reads the configured price IDs.
  3. Renewal notices and reminders select by stored plan, and state the stored amount and currency.
  4. An unknown product or interval refuses the write, leaves the event retryable, and raises an unknown-price alert through DEBT-505's path.
  5. Checkout refuses a configured price whose Stripe amount or interval differs from `lib/pricing-data.ts`, and alerts.

### 3. A subscription created outside the app's Checkout is acknowledged and dropped (P3) — waits for its trigger

- **Evidence.** The normalizer requires `subscription.metadata.user_id` (`stripe-subscription-normalizer.ts:38-52`). The controller logs `metadata_missing` and returns 200 without recording the event (`stripe-webhook-controller.ts:830-840`).
- **Trigger.** Support or the owner plans to create a subscription in the Dashboard, a Payment Link or a script, for example to repair "I paid but can't get in".
- **Decided.** Fall back only to the trusted `stripe_customers` mapping, with agreement checks when subscription metadata is present; customer metadata is not an ownership authority. Persist an unresolved outcome in the event ledger with a retry or operator disposition. Prove missing, conflicting and repaired mappings through signed-webhook integration cases.

### 4. A card added at or after trial end is never applied (P3) — expiry bound declined

- **Shipped with BUG-364.** Completion of an add-card Session checks the stored subscription before calling Stripe and again when recording consent (`checkSetupSubscription`, `src/adapters/controllers/stripe-webhook-controller.ts:246-278`). A trial whose stored row is no longer entitled ends the setup as `subscription_inactive`: the card is detached, and no consent or acknowledgment is recorded. Billing's return notice reads the stored row, not the detach: it says the card was not saved while an in-trial cancellation is scheduled, and otherwise that Stripe is confirming the card (`app/(app)/app/billing/page.tsx:183-198`, `:286-287`).
- **The gap left.** The add-card Session still uses Stripe's 24-hour default (`createStripeTrialPaymentMethodSetupSession`, `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:254-300`, no `expires_at`). A completion processed after Stripe canceled the trial but before the cancellation webhook updates the stored row passes the check, attaches the card (controller `:364-377`), and then fails to set it as the subscription's default (`:387-398`, through `src/adapters/gateways/stripe-payment-gateway.ts:232-249`), since Stripe allows only metadata and cancellation details to change on a canceled subscription. The delivery fails until the cancellation webhook is processed; then the check ends it as `subscription_inactive`. No provider test covers this path.
- **Declined** by the reviewing session, 2026-11-15, at the owner's delegation: the expiry bound (the earlier of trial end and 24 hours). Its outcome holds once the setup's completion is processed: that path detaches the card, and nothing is charged, since the trial is no longer entitled. Until then the card stays attached to a trial that will not charge it.

### 7. Live Stripe settings and the live purchase (P3, owner)

- **Done.** The live webhook endpoint's events were recorded and fixed on 2026-10-11; since 2026-11-13 the only enabled live endpoint is the Endive one, subscribed to all 13 handled events (`docs/architecture/integrations/stripe.md`). The live default payment-method configuration had card available and on (census, 2026-10-13). Live price IDs stay out of the repository by design (`docs/architecture/environments.md`).
- **Remaining, before the first live sale:**
  - The owner makes one live purchase, refunds it, and records that it worked end to end and charged the amount the consent text stated. The billing QA procedure is test-mode only (`docs/guides/qa/billing-and-entitlement.md:6`), so this is the owner's own check; DEBT-465 runs that procedure in test mode first.
  - **Link on Checkout.** Stripe pre-ticks "Save my information with Link for faster checkout" in both flows; seen in TEST mode, expected live. A Link-funded card reports brand `link`; the app reads no card details, so nothing breaks. The owner decides, on the live Checkout page, whether to keep Link or turn it off in the Dashboard. If Link stays, the add-card consent says "card" while Link can fund renewals from a bank account, which goes to counsel with DEBT-414's questions, and a hosted journey that pays through Link is added. The hosted smoke always unticks it (`tests/e2e/helpers/stripe-hosted-checkout.ts:108-112`).

### 8. The checkout guard reads only the customer's first 10 subscriptions (P3) — Won't Fix

- **Evidence.** `createStripeCheckoutSession` lists the customer's subscriptions with `status: 'all'` and `limit: SUBSCRIPTION_LIST_LIMIT` (10), with no paging (`stripe-checkout-sessions.ts:855-860`); BUG-321's sync lists the same page (`stripe-customer-subscriptions.ts:43-47`).
- **Won't Fix,** decided by the reviewing session, 2026-11-15, at the owner's delegation. Stripe lists newest first, and the guard refuses every checkout while a blocking subscription is among the customer's ten newest. Every subscription the app makes comes from a Checkout the guard passed, so pushing a blocking one past those ten needs ten escapes of BUG-343's seconds-wide race, or subscriptions made outside the app, which item 3 covers. The daily reconcile lists up to 100 per customer (`reconcile-stripe-subscriptions.ts:21`), so it still sees such a duplicate for a customer it reaches; it reaches none without a local subscription row (item 1).

### 9. Nothing notices when the daily reconcile stops running (P3)

- **Evidence.** The renewal job checks in with Sentry's cron monitor, and the watcher opens an issue when it misses 25 hours. The reconcile route has no monitor, and its one alert comes only from a run. A firewall rule or failed deployment can stop a run before the handler, and a `CRON_SECRET` mismatch answers 401; each leaves an hour of Vercel logs and no record.
- **Impact.** Webhooks still sync each subscription, so this is the repair path going quiet: drift and BUG-343's duplicate cancellation stop without a signal.
- **Decided 2026-10-30: option 2.** Each scheduled full run (`dryRun=false&scope=all`, the cron's own query) records its start, once `CRON_SECRET` passes, and its finish only when reconciliation returns with no failed row (the result's `failed`, `src/adapters/jobs/reconcile-all-stripe-subscription-pages.ts:182`). So a run whose reconciliation throws (the route answers 500, `app/api/cron/reconcile-stripe-subscriptions/route-handler.ts:239-247`, `:289-294`) or returns failed rows (the route still answers 200, `:296-299`, so a run whose every Stripe lookup failed would otherwise look finished) is reported like a killed one, and a row that fails every day raises the alert every day, since that customer is never repaired; a diagnostic dry or single-page run records neither, so it cannot mask a stopped one. The monitored renewal job raises a new kind, `stripe_reconcile_stopped`, as it already watches GitHub's schedules (`checkScheduledChecksRunning`, `src/adapters/jobs/scheduled-checks.ts:117`), when no run has started in the past 24 hours, or any run started more than the route's `maxDuration` (60 seconds, `app/api/cron/reconcile-stripe-subscriptions/route.ts:16`) ago has no finish recorded and has not been reported yet; raising the alert marks those runs reported (start, finish and report sit on one row per run). Every unreported start is checked, not only the latest or a fixed window: Hobby fires each cron anywhere in its hour, so the 08:00 reconcile can still be running when the 09:00 watch reads it, and a later watch then catches it if it was killed, even when a later run succeeded or a day's watch was missed. Its red-first tests cover a killed run, a run whose reconciliation throws, repeated runs that return failed rows, and a killed run first seen after a missed watch. Option 1, a second Sentry cron monitor, needs a paid Sentry plan.
- **Rejected** by the reviewing session, 2026-11-15: reading the start from the cron's rate-limiter row. It gives the limiter's table a second meaning that a limiter change could silently break, and it cannot see a killed run.
- **Not built,** and no session holds it: it missed 2026-11-13. Due 2026-11-22.

## Verification

Before closing: item 9 built with red-first tests; item 7's live purchase and Link decision recorded; items 1, 2 and 3 as Waiting rows with their triggers.

Corrected 2026-11-15: items 5 and 6, item 4's completion recheck (BUG-364) and item 7's endpoint census are done, so their build history is in git at 34d9aea0. Line references drifted and are corrected. Item 7's live purchase is the owner's own check, not the test-mode QA procedure's, and live price IDs stay out of the repository. Item 2 moved to Waiting (owner); its premise is corrected, since the former live trials' rows already exist. Item 3 moves to Waiting; item 4's expiry bound is declined, with the path it leaves stated; item 8 is Won't Fix; item 9 keeps option 2 and is re-dated (all by the reviewing session). Item 1's decided design and the shared contract's scope limits are restored.

## Related

- BUG-321, BUG-343, DEBT-502: the same hunt.
- BUG-364: shipped item 4's completion recheck.
- DEBT-465: runs the billing QA procedure in test mode before the first live sale.
- DEBT-530: the commercial terms that item 2's step 5 checks against Stripe.
