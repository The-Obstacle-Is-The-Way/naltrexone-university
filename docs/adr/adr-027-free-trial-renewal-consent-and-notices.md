# ADR-027: Free Trial, Renewal Consent and Renewal Notices

**Status:** Proposed — until the licensed legal review in GitHub issue #902 (DEBT-414) ends. The decisions below have shipped as engineering. They are not legal sign-off, and this record claims no legal compliance.
**Date:** 2026-10-12, recording decisions of 2026-06-06 to 2026-10-10
**Decision Makers:** The owner, who confirmed the no-card trial on 2026-06-06 (DEBT-410), chose Resend on 2026-08-04, deferred price-change machinery on 2026-08-06, authorized the DEBT-414 remediation (F01–F07, F15) on 2026-09-27, and delegated the consent-copy and card-only decisions on 2026-09-28 and 2026-10-03. ADR-023 moved decisions out of records, so they are recorded here.
**Depends On:** ADR-005 (Payment Boundary), ADR-014 (Stripe Eager Sync on Checkout Success), ADR-017 (Webhook Processing Lifecycle), ADR-026 (Error Monitoring with Sentry)

---

## Context

- **The offer.** Pro Monthly costs $29 a month and Pro Annual $199 a year. Both renew automatically until cancelled ([Terms](../policies/legal/terms-of-service.md) §4). Stripe hosted Checkout takes payment, and the Stripe billing portal handles cancellation (ADR-005).
- **Automatic renewal is regulated.** DEBT-414's non-lawyer review (2026-09-16) cites ROSCA and state automatic-renewal statutes, among them California, New York, Vermont and Colorado. It lists their duties: disclosure before billing, express consent, a retainable acknowledgment, evidence retention, annual notices inside set windows, and simple online cancellation. That record states it is not legal advice.
- **Stripe fixes some mechanics.** Hosted Checkout supports only legacy free trials (`subscription_data.trial_period_days` or `trial_end`), and this app uses the day count. Stripe's newer trial offers cannot be used with Checkout (DEBT-410, quoting Stripe's documentation). The portal schedules a cancellation by setting `cancel_at`, and leaves `cancel_at_period_end` false (DEBT-414 F04).
- **A missed notice must reach a person.** The owner runs the product alone, and a log line reaches nobody (ADR-026).

## Decision

1. **A 7-day trial on a first checkout only (decided 2026-06-06; built behind a flag 2026-06-09, #409; flag removed 2026-06-11, #418).**
   - `CreateCheckoutSessionUseCase` passes `FREE_TRIAL_DAYS = 7` only when the user has no subscription row (`src/application/use-cases/create-checkout-session.ts`). A lapsed trial leaves a row, so it blocks a second trial. An unexpired blocking subscription refuses checkout with `ALREADY_SUBSCRIBED` ([R10](../product/business-rules.md)).
   - Checkout also refuses an offer whose displayed trial or disclosure version no longer matches (`expectedOffer`).
   - Reasons (DEBT-410 D1, D9): seven days suits buyers working to an exam deadline, and the existing per-user subscription row already enforces one trial.
2. **No card to start, and no charge without one (2026-06-06).**
   - Trial sessions set `payment_method_collection: 'if_required'` and `trial_settings.end_behavior.missing_payment_method: 'cancel'` (`src/adapters/gateways/stripe/stripe-checkout-sessions.ts`).
   - Reasons (DEBT-410 D2, D4): a card wall cuts trial starts, and the owner chose "try free, enter a card only to continue". `cancel` is the value Stripe's Checkout guide shows in code, and it reuses the existing deletion handling.
   - The app sends no trial reminder. DEBT-410 D8 left that to Stripe's trial-ending email. DEBT-414 records that the California and New York trial-reminder provisions cover only trials longer than a month.
3. **A trial gains its first card only through the add-card flow (2026-08-06, #742; hardened 2026-09-28 and 2026-10-03).**
   - `CreateTrialPaymentMethodSetupSessionUseCase` opens a Stripe setup-mode Session for an unexpired trial. The Session requires Terms consent, offers only cards (`payment_method_types: ['card']`, BUG-310), carries signed metadata, and names no customer.
   - The webhook attaches the card and makes it the subscription's default only after the Session matches its pending operation and Stripe reports a succeeded card setup.
   - The portal's trial profile turns payment-method updates off (`stripe-portal-configurations.ts`, F05). `CheckTrialSavedCardUseCase` then knows a trial has a card exactly when this flow saved one (BUG-308).
   - The daily job prunes abandoned setup operations 30 days after they expire.
   - Reasons: DEBT-414 §5 rejected the generic portal as the consent step. A Session that names the customer lets Stripe attach the card before our checks run. F05 found that the portal let a trial convert to paid without a consent record. BUG-310 found non-card methods on a flow whose consent says "card".
4. **Consent is a separate, unchecked opt-in to the stated terms (Terms checkbox 2026-08-06, #742; opt-in and policy 2026-09-28).**
   - Checkout requires Stripe's Terms checkbox (`consent_collection`). Both checkout and the trial add-card dialog add an unchecked native checkbox, labelled with the offer's renewal statement. The billing controller refuses a submission without `renewalOptIn: true`.
   - Each consent text quotes the Terms' cancellation and refund policy (`CANCELLATION_AND_REFUND_POLICY`, F15). Checkout texts are registered by version in `lib/checkout-disclosures.ts` and reach Stripe as a SHA-256. The webhook records consent only if the hash matches the registered text.
   - Reasons: F03 cites Vermont's separate opt-in, and one opt-in for every offer was judged simpler and stricter. F15 found that the policy was missing next to consent.
   - A change to consent text or its version changes consent evidence, so it merges only on the owner's explicit instruction (DEBT-478).
5. **Consent evidence is kept for three years, or one year after termination if that is later (2026-08-06, #743; in production 2026-08-07 through #747).**
   - Only the Stripe webhook writes `renewal_consent_records` (`db/schema.ts`, `RecordRenewalConsentUseCase`). A record holds a SHA-256 consumer reference; the Stripe customer, subscription and Session identifiers; the plan, amount, frequency, trial end, and cancellation deadline and method; the exact disclosure text and version; the Terms version and hash; and the source and acceptance time.
   - `computeRenewalConsentRetainUntil` takes the later of the two dates. The webhook and the daily reconcile start the termination clock.
   - After each Stripe webhook, `PruneRenewalConsentsUseCase` deletes up to 100 terminated records whose retention has run out. Account deletion clears the user reference (`onDelete: 'set null'`) and keeps the record.
   - Reason: DEBT-414's legal matrix reads California § 17602 as requiring verification for three years, or one year after termination, whichever is longer.
6. **An acknowledgment is queued with the consent (2026-08-07, #746; links 2026-10-01).**
   - The webhook queues the acknowledgment in the transaction that records consent, then dispatches it. The daily job retries a row that is still queued.
   - It states the accepted terms, the price, the trial end, the cancellation deadline and method, and the policy. It links Billing, support, Terms and Privacy (`send-renewal-acknowledgment.ts`).
   - Reason (DEBT-414 §7): a failure after consent must not leave consent without an acknowledgment, and a retry must not send it twice.
7. **Renewal notices go out 35 to 30 days before renewal, for both plans (2026-09-27; monthly from 2026-09-28).**
   - An annual plan gets an `annual_reminder` and a `renewal_notice`. A monthly plan gets an `anniversary_reminder` before the renewal that carries service past each twelve-month mark (`nextAnniversaryRenewalAt`).
   - The cron runs at 09:00 UTC (`vercel.json`). It selects active, renewing subscriptions 35 days out, and retries daily down to `RENEWAL_NOTICE_MINIMUM_DAYS = 30` (`src/adapters/jobs/send-due-renewal-notices.ts`; the constant is in `src/application/shared/renewal-notice-schedule.ts`).
   - Each notice says the plan renews unless cancelled. It gives the cutoff in UTC, Eastern and Pacific time, and links cancellation (F06).
   - Reasons: F01 found the earlier 15–45-day window too early or too late for some states. The code records 30–40 days as the window every covered state shares. F02 cites Colorado and Connecticut for yearly reminders on monthly plans.
   - Each notice kind has its own disclosure version (`ANNUAL_RENEWAL_NOTICE_VERSION` and `MONTHLY_ANNIVERSARY_NOTICE_VERSION` in `lib/pricing-data.ts`), separate from checkout's `disclosureVersion`. A scheduled notice is deduplicated on its version, so a shared bump would schedule a second notice for a renewal that already has one (DEBT-478).
8. **Delivery is durable, is never repeated while the outcome is unknown, and is revalidated before sending (2026-08-07, #744; revalidation 2026-09-27; delivery evidence 2026-09-30, #1262).**
   - Resend sends the email (`src/adapters/gateways/resend-transactional-email-gateway.ts`). Without `RESEND_API_KEY`, rows stay queued.
   - Each row has an immutable payload, its hash, and a provider idempotency key derived from the row's ID. Dispatch claims the row before it sends.
   - A rate-limit or quota error retries with backoff, from 15 minutes up to 24 hours. A terminal error stops. An ambiguous result, or a claim stale for 15 minutes, becomes `outcome_unknown` and is never resent automatically, because Resend keeps an idempotency key for only 24 hours (DEBT-414 §7).
   - `RequeueRenewalNoticeDeliveryUseCase` needs an operator and a reason. For an unknown outcome, it also needs confirmation that nothing was sent.
   - Before sending, dispatch supersedes a scheduled notice whose subscription is gone, inactive or cancelling, or is now on another plan or renewal date, or whose account email has changed. It refuses a reminder past its 30-day cutoff (F07).
   - Provider acceptance is stored as `accepted`, not `delivered`. Signed Resend webhooks record delivery or failure (`RecordRenewalNoticeProviderOutcomeUseCase`). A missed deadline, a refused late notice or an unknown outcome raises an [operational alert](../architecture/observability.md#operational-alerts).
9. **A scheduled cancellation keeps access to period end and stops notices ([R11](../product/business-rules.md); 2026-09-28).**
   - Both portal profiles cancel `at_period_end` with no proration. Plan changes stay off while existing-subscriber price changes are frozen (owner, 2026-08-06).
   - `stripeSubscriptionEndsByPeriodEnd` treats a `cancel_at` at or before period end as a scheduled cancellation. All three subscription writers use it (F04). Selection and revalidation then skip that subscription.
   - Email to support is a second cancellation channel (Terms §4).

## Consequences

### Positive

1. Every path to a paid subscription, a trial's first card included, takes an explicit opt-in to versioned text and keeps it as evidence.
2. A notice states the facts as they stand when it is sent, or it is not sent.
3. A notice that is missed, refused as late, or in doubt reaches the owner as an alert. An uncertain send is held, not repeated.

### Negative

1. Trial eligibility is per account, because deleting an account deletes its subscription row. The Terms' one-trial-per-person limit is therefore contractual, not technical, and §4 says so: it forbids a second account for a second trial as a breach of §2.
2. Notices and the acknowledgment go to our stored copy of the account email, which can lag Clerk (DEBT-511).
3. Notices state the configured plan amount and select subscriptions by the configured price ID. A price change would therefore misstate or skip notices (DEBT-501).
4. Known gaps, decided but not yet built: an early bounce report can be lost (F21); a trial cancelled in the portal is still offered "Add a card", which records consent and acknowledges a renewal that will not happen (F22); a card added at or after trial end is never applied (DEBT-501 item 4).
5. Delivery evidence needs the owner to configure the Resend webhook. Until then, notices stay `accepted` (DEBT-414).
6. The requeue use case is wired in `lib/container/use-cases.ts`, but no route or script calls it, so a quarantined notice cannot be requeued without a hand-written database change (DEBT-414 F23, due before the first live renewal notice).

### Mitigations

- The fixes are decided. F21 tags each send with its row ID, and F22 hides the add-card dialog once cancellation is scheduled and rechecks at completion (both 2026-10-06). DEBT-511 reads the verified address from Clerk before sending (2026-10-07). DEBT-501 stores each subscription's plan and amount, and selects and words notices by them (2026-10-10). Until then, [the price ID rule](../architecture/environments.md#stripe-price-id-rule) forbids changing a price ID while there are subscribers.
- The daily job re-checks deadlines after every dispatch, so an alert recurs while a gap stands.
- Price-change machinery is deferred, and no existing subscriber's price may change until it ships (owner, 2026-08-06). The `material_change` and `fee_change` notice kinds exist, but nothing schedules them.

## Open Questions (counsel review)

Issue #902 holds DEBT-414's questions Q1–Q7 for licensed review. The review is due before the first paid acquisition, or earlier if required.

1. **Assent:** do the opt-in, bold terms, acknowledgment and ledger make assent enforceable for physicians buying their own exam preparation? Wisconsin (F20) joins this question.
2. **Clinical disclaimer:** the wording of Terms §3.
3. **Warranties and liability:** warranties, the liability cap, and refunds.
4. **Forum:** the New York forum, and the 30-day wait before a claim.
5. **Changes:** how to reconcile feature changes, change notices and assent by continued use.
6. **Cancellation:** period-end, non-refundable cancellation nationwide, and a warning before a deletion that ends prepaid access.
7. **Sales tax:** the subscription's New York sales-tax classification. A tax adviser may answer this one.

DEBT-414 also leaves to counsel or the owner: the remedy for a missed statutory deadline (F01, F07); which renewal is the yearly one for a monthly plan (F02); Massachusetts' 5–30-day notice, per-charge notices and notice medium (F19a, F19c, F19d); and whether an emailed cancellation takes effect when received (F04).

## Alternatives Rejected

- **A card to start a trial.** A card wall cuts trial starts, and the owner chose "try free, enter a card only to continue" (DEBT-410 D2, D4).
- **Stripe's newer trial offers.** Hosted Checkout cannot use them (DEBT-410).
- **The generic billing portal for a trial's first card.** DEBT-414 §5 rejected it as the consent step, and F05 found it let a trial convert to paid without a consent record.
- **A setup Session that names the customer.** Stripe would attach the card before the app's checks run.
- **A 15–45-day notice window.** F01 found it too early or too late for some states.
- **Resending a notice whose outcome is unknown.** Resend keeps an idempotency key for only 24 hours, so a resend could deliver a second notice (DEBT-414 §7).

## Compliance

- R10 and R11 in [the business rules](../product/business-rules.md) name the tests that prove them, and `tests/rule-to-test-register.test.ts` fails when a named test is missing.
- The webhook records consent only when the Session's disclosure hash matches the text registered for its version.
- A missed notice deadline, a refused late notice or an unknown outcome raises an operational alert, and the daily job re-checks deadlines after every dispatch.

## References

- [Business rules](../product/business-rules.md): R10, R11
- [Terms of Service](../policies/legal/terms-of-service.md) §4, and the [Privacy Policy](../policies/legal/privacy-policy.md) retention table
- [Observability](../architecture/observability.md#operational-alerts) and the [Stripe integration](../architecture/integrations/stripe.md)
- `src/application/use-cases/` (checkout, trial setup, consent, acknowledgment and notice use cases), `src/adapters/jobs/send-due-renewal-notices.ts`, `db/schema.ts`
