# DEBT-501: Billing Operations Can Leave Payers Without Access as the Service Grows or Changes

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — quick wins built (items 1's timeout, 2's runbook line, 5 and 6); next, alerts for its silent conditions, then the pre-sale items
**Priority:** P2
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

The owner-requested adversarial hunt of the payment flows (2026-10-05) found no defect that charges an ordinary Checkout buyer without granting access. It did find gaps in billing operations. Each one can leave a payer without access, or charge someone twice, when the service grows, an operator changes something, or timing is unlucky. Each item names its trigger. Source inspection establishes the failure paths, not that no production account has encountered them. The live (non-test) purchase path has never been recorded working end to end.

## Items

**Decided 2026-10-08 (AUDIT-015): order.** Quick wins first: item 1's Stripe timeout, item 2's runbook line, items 5 and 6. Then operational alerts (DEBT-505) for a reconcile run that stops early and for an unknown price ID, so items 1 and 2 announce their own triggers; once that alert exists, item 1's oldest-first reconcile waits for it. Before the first live sale: item 2's legacy price-ID list, item 4's add-card recheck (with DEBT-414 F22), and the owner's item 7.

### 1. The daily reconcile never reaches the tail once the table grows (P2)

- **Evidence.**
  - The all-pages sweep starts at offset 0 on every run (`src/adapters/jobs/reconcile-all-stripe-subscription-pages.ts:131`) and stops after a 40-second budget (`:12`, `:142-147`). It logs "resume at offset N", but nothing ever resumes there: the cron passes no offset (`app/api/cron/reconcile-stripe-subscriptions/route-handler.ts:220-221`).
  - Rows are never removed, so canceled subscriptions and lapsed trials count too.
- **Trigger.** Somewhere between roughly 500 and 1,000 rows (an estimate, not measured).
- **Impact.** For users past that point, a missed webhook is never repaired. A stopped-early run that overruns `maxDuration = 60` also kills the deleted-account cleanup that runs after it (BUG-262's safety net).
- **Decided.**
  - **Order.** Record each row's last reconcile attempt and process rows oldest first by one key: the last attempt, or the row's creation time (`created_at`) if it has never been attempted, then by ID. New rows queue behind older ones rather than ahead of every retry, so every row is reached in turn with no cursor or run state, even under sustained inserts.
  - **Claims.** Claim each row before its Stripe call with one committed statement: `update … set last_attempted_at = clock_timestamp() where id = $1 and coalesce(last_attempted_at, created_at) < $start returning id`. Not `now()`, which is when its transaction began and can precede the run's start. A claim that returns no row was deleted or taken by an overlapping run, and is skipped; a row whose claim fails is left out of the run's remaining pages. Record the outcome or error after the Stripe call. A row that keeps failing, or whose attempt kills the run, then moves to the back instead of starving the tail, and a crashed or stopped-early run leaves its unclaimed rows first in line. Claims and outcome records change neither `version` nor `updated_at`.
  - **Pages.** Each page reads afresh from the head of that order, after the previous page's claims have settled, taking only rows whose key is earlier than the run's start (`$start`, read from the same clock before the first page). Every claim this run writes is later than that start, so a claimed row leaves the selection and no row is attempted twice in a run, provided the database clock does not step backwards. The run ends when none remain or its time budget or page cap is spent.
  - **Budget.** Check the time budget before each claim, not only between pages, and give the job's Stripe calls a request timeout that fits the time left. The client sets none, so Stripe's 80-second default applies (`lib/stripe.ts:11-25`), beyond `maxDuration = 60`. An attempt in flight then cannot push the deleted-account cleanup that follows past the limit.
  - **Manual pages.** Remove the `offset` parameter, which means nothing in an order that moves as rows are claimed: `scope=page` takes the next `limit` rows in this order.
  - **Overlapping runs.** Two runs can write the same Stripe snapshot to a row. Each write passes BUG-287's observation-version check, and every persisted write raises the version, an unchanged one too: the raise tells a writer holding an older Stripe read that a fresher one was committed, so skipping it would let that older read overwrite. A run writes each row at most once, so each overlapping run costs another writer of that row at most one of its three version-conflict attempts. The cron route allows five calls a minute (`src/adapters/shared/rate-limits.ts:109-112`), so reconcile runs alone exhaust a writer only when three of them overlap it. Every other writer handles exhaustion as it does today; a reconcile attempt's error is recorded and its row moves to the back.
  - **Scope.** Do not exclude a row solely because its local status is terminal: repairing stale local state is this job's purpose. Any pruning policy needs an independently justified terminal-state contract.
  - **Tests**, against real Postgres: the ordering, a crash mid-run, interleaved inserts and deletes, sustained inserts (earlier rows are still retried), each row attempted at most once per run (including a claim written in a transaction begun before the run's start was read), a deleted or concurrently claimed row, a failed claim, the budget checked before each claim, two overlapping runs, and provider failure.

- **Request timeout done 2026-10-09 (quick-wins pull request).** The reconcile route gives the job's subscriptions client a 5-second timeout and one network retry (`limitStripeSubscriptionRequests`), in place of the SDK's 80 seconds and two retries. The timeout is the socket's idle limit per try, and our retry wrapper can still repeat a 5xx or 429 call. This was proven through the real SDK, and the cron route's integration test checks the time limit on every subscriptions request it sees. Still open: the drain's customer deletes in the same function keep the SDK's defaults, and checking the time budget before each claim, which bounds a whole page, comes with the oldest-first order.

  *Corrected 2026-10-06: oldest-first order replaces #1410's keyset cursor with wraparound, checkpoints and run coordination, which needed more state for the same guarantee; terminal rows stay included, as #1410 decided (#1410 review).*

### 2. Only one price ID per plan is recognized (P2)

- **Evidence.** `getSubscriptionPlanFromPriceId` matches only the current environment's monthly and annual IDs (`src/adapters/config/stripe-prices.ts:15-22`). Any other ID fails:
  - webhooks return 500 (`stripe-subscription-normalizer.ts:99-105`);
  - reads throw `INTERNAL_ERROR` (`drizzle-subscription-repository.ts:44-51`), as in DEBT-310's incident;
  - reconcile rows fail;
  - the success page redirects with `unknown_plan`.
- **Trigger.** Any change of Price for new customers. DEBT-414 freezes existing subscribers' prices, and the portal disables plan changes, so a new Price plus an environment change is the expected way to change a price. That change would lock out every existing subscriber.
- **Decided.** A recognized list of legacy price IDs per plan, configured alongside the current ones. Add an operator check that refuses a price change while live subscriptions use an ID the list doesn't hold. Until this ships, the runbook must say: never change a price ID.
- **Runbook line done 2026-10-09 (quick-wins pull request):** [deployment-environments.md](../dev/deployment-environments.md#stripe-price-id-rule) says never to change either price ID where there are subscribers, and why. The legacy list and the operator check remain.

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
- **Done 2026-10-09 (quick-wins pull request).** The success page no longer redirects this case to `?checkout=error`. The sync returns it as a purchase on another account before anything is written, and logs a warning with the reason. The page says "This purchase belongs to another account" and tells the person to sign in with the account they paid with. It offers its own Sign out, which then opens sign-in, because the page has no account menu (found by the pre-review). It also offers Contact support, but no dashboard link and no plan. The pricing page is unchanged, so its offer still comes from the database alone (BUG-275). Test-first for the sync and the page. It is not seen in a browser: reaching it needs a Checkout paid on one account and returned to on another.
- **Done 2026-10-10 (BUG-330's pull request), from #1440's review.** Sign out says "Signing out…" and is disabled while Clerk works. If Clerk's sign-out fails, the button no longer goes quiet with the person still on the wrong account. A message offers another try and points to Contact support beside it. Browser-tested, test-first, including a rejected sign-out.

### 6. The Stripe circuit breaker also counts ordinary 4xx errors (P3)

- **Evidence.** `src/adapters/shared/circuit-breaker.ts:62-76` counts every thrown error, and one breaker is shared per instance (`stripe-retry.ts:11-16,43`). Five consecutive client errors fail every Stripe call in that instance for 60 seconds, Checkout included.
- **Decided.** Count only transient failures: network errors, 5xx and 429.
- **Done 2026-10-09 (quick-wins pull request).** `CircuitBreaker` takes a rule for which errors count. Any other error is the service answering, so it closes the circuit and restarts the count, in a half-open probe too. The Stripe breaker counts `isStripeOutage`: network errors, 5xx and 429, plus the SDK's outage classes, which would otherwise have stopped counting:
  - `StripeConnectionError`, which carries neither a code nor a status;
  - `StripeAPIError`, only when it has no status, as when a 5xx body is not JSON or a body is cut off. The SDK also raises it for a 409 conflict with another request, which is Stripe answering and does not count (#1440 review);
  - `StripeRateLimitError`, which Stripe can send as a 400.

  The classes were added after the pre-review. Test-first; four mutation checks each fail a test.

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
