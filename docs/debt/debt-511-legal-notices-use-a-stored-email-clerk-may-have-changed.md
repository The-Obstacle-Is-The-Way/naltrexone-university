# DEBT-511: Legal Notices Go to a Stored Email That Clerk May Have Changed

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — resolution decided below; it must ship before paid acquisition, after DEBT-505
**Priority:** P2
**Date:** 2026-10-07
**Resolved:** —
**Verification receipts:** —

---

## Summary

The legally required renewal notices and the renewal acknowledgment go to our stored copy of the user's email. No send asks Clerk, the source of truth. A change reaches the stored copy only through Clerk's `user.updated` webhook, or when the user next starts a checkout or trial card setup, which refresh it from Clerk. Clerk documents that webhook deliveries are not guaranteed.

So an annual subscriber who changed their address, and has not started a checkout or trial card setup since, can be sent a legal notice at an old address. That address may now belong to someone else.

Stripe's own renewal emails go to a third copy of the address, which is never synced and which the customer can edit in Stripe's portal.

[DEBT-503](./debt-503-clerk-backend-api-allowance-single-point-of-failure.md) item 1 widens the gap slightly. It stops refreshing the email on every signed-in page, so active users also depend on the webhook between checkouts. The gap itself exists today.

## Evidence

- **Scheduled notices** (annual, renewal, anniversary):
  - The 09:00 UTC cron reads `users.email` when it queues a notice (`src/adapters/jobs/send-due-renewal-notices.ts`, the delivery query's join).
  - It snapshots that address into `renewal_notice_deliveries.destination` and the payload (`src/application/use-cases/send-due-renewal-notices.ts`).
  - At send time, dispatch re-reads `users.email` and supersedes a notice whose address changed (`dispatch-renewal-notice-delivery.ts`). That is still our copy, not Clerk's.
- **The acknowledgment** is queued from `users.email` inside the Stripe webhook's transaction, and dispatched without a recheck (`stripe-webhook-controller.ts`).
- **Which address the law wants.** DEBT-414 F07 decided that notices go to the account's *current* email, and nothing requires the address given at consent ([DEBT-414](./debt-414-public-legal-pages-privacy-terms.md)). Counsel still holds F19d, whether email is "reasonably calculated to be seen".
- **How the stored copy changes today.**
  - Each signed-in request's `currentUser()` upsert (removed by DEBT-503 item 1).
  - The `user.updated` webhook: Svix-verified, recorded on failure and reprocessed on redelivery (`clerk-webhook-controller.ts`).
  - Provisioning.
  We have no replay of our own. Both email selectors take the primary address, or else the first, without checking verification. DEBT-502 item 3 decided "verified only".
- **What Clerk and Svix guarantee.**
  - Clerk: webhooks are not for synchronous flows, may be duplicated or out of order, and "deliveries are not guaranteed". When order matters, read current state from the Backend API ([overview](https://clerk.com/docs/guides/development/webhooks/overview), [syncing](https://clerk.com/docs/guides/development/webhooks/syncing)).
  - Svix retries for about 27 hours (immediately, then 5 s, 5 m, 30 m, 2 h, 5 h, 10 h, 10 h), and disables an endpoint that keeps failing for 5 days ([retries](https://docs.svix.com/retries)). After that, only a manual replay from the Clerk Dashboard recovers an event.
- **Stripe's copy.**
  - Set once, at `customers.create` (`stripe-customers.ts`), and never updated. There is no `customer.updated` handling.
  - The billing portal lets the customer edit it (`stripe-portal-configurations.ts`).
  - Stripe's upcoming-renewal email goes to this copy. DEBT-414 F19a lists it as a *candidate* for Massachusetts' 5–30-day notice, to be verified first.
- **Queue mechanics.**
  - **No second queuing.** The job's already-queued check ignores status, and the scheduled unique index includes the destination (`db/schema.ts`). So a notice superseded while the stored address is unchanged is never queued again.
  - **Few runs.** The window from renewal minus 35 days to renewal minus 30 days gets 4–6 runs of the daily cron (Vercel Hobby fires it within about ±59 minutes). A notice superseded on the last run is never sent.
  - **The email write can be refused.** The user upsert's `updated_at` guard can keep the old address.
- **Cost.** Clerk's Backend API allows 1,000 requests per 10 seconds in production. One lookup per user per run, shared by that user's notices, is well under that, off the request path.

## Impact

- **A stale address** can miss a legally required notice.
- **A reassigned address** can disclose the subscription to another person.
- **No one is told.** A misdirected notice is silent.
- **Timing.** The owner states the product has no real subscribers yet. DEBT-501 item 7 records no live purchase. A new subscriber's first scheduled notice is about eleven months away, and their acknowledgment uses the address checkout refreshes from Clerk. So the exposure is only existing live subscriptions, which the owner can count read-only. This must ship before whichever comes first: paid acquisition, or 35 days before the earliest existing live renewal.

## Options

1. **Webhook only, plus checkout's refresh.** Rejected: Clerk documents that deliveries are not guaranteed.
2. **A session-token email claim.** Rejected:
   - It never reaches the inactive annual subscriber who matters here.
   - The address in it is not guaranteed verified.
   - It cannot be ordered against webhook updates.
   - It puts the email in a cookie that page JavaScript can read.
3. **Look up the address in Clerk at send time** (decided). Clerk's own guidance is to read current state when it matters.
4. **A daily reconcile against Clerk** (decided, later). It catches drift and missed `user.deleted` events in bulk.

## Resolution

**Decided:** options 3 and then 4, with the webhook kept as the everyday update path.

1. **One lookup, at queue time and again at send time.**
   - A new port asks Clerk, outside any transaction, for the user's primary email whose `verification.status` is `verified`. A missing verification counts as unverified.
   - The job checks before it snapshots a notice's payload, and dispatch checks again before sending. Within one run, both checks share one lookup per user, which serves all that user's notices. A notice queued in an earlier run gets a fresh lookup in the run that dispatches it.
   - Before calling Clerk, read the deletion tombstone.
2. **Outcomes.** The deadline governs, not the lookup, so nothing is superseded for good while the user can still fix it.
   - **Address matches:** send.
   - **Address differs:** write Clerk's address through the BUG-284-safe provisioning path, and read it back. Once the stored address equals Clerk's, re-queue to it and dispatch in the same run. If the write is refused, hold the row and alert.
   - **Unverified, missing, or owned by another row:** hold the row queued, alert, and retry each run until the existing send-by cutoff (`notice_deadline_passed`). A user who verifies within the window still gets the notice. The repair paths are DEBT-502 items 1 and 3.
   - **404:** terminal only when our tombstone exists, or when a lookup of a known user (a canary) shows the key and instance are working. Otherwise treat it as "unavailable". A 404 with no tombstone alerts "Clerk user missing with an active subscription", so the deletion runs before renewal and no one is charged without notice.
   - **Unavailable** (401, 403, 429, 5xx, timeout or network): retry within the run, hold the row, and alert on the first held run, not only at the deadline.
   - **Last eligible run** (cutoff minus now under 25 hours) **with Clerk still unavailable:** send to the stored address only if Clerk confirmed that address as verified within the past 7 days, and no `user.updated` or `user.deleted` for that user is failing. Otherwise the existing missed-deadline error fires, through DEBT-505. Record each confirmation's time, so this rule can be applied, and alert whenever a notice goes out under this rule.
     - **The residual risk, accepted.** Our failure records cannot see a `user.updated` that Svix has not delivered yet. So if the user changed their address within those 7 days, and that event is still undelivered, the notice goes to the address they verified before the change. Holding it instead would make Clerk's availability decide whether a required notice goes out at all, and the missed-deadline path relies on the owner seeing an alert in time. A week-old verified address is the user's own recent mailbox, and reassignment within a week is implausible. The alert lets the owner resend if the address has changed. *Adjudicated 2026-10-08: CodeRabbit asked that this case hold the notice instead (#1426 review).*
   - **Logs and alerts** carry IDs and a reason only, never an address, with Clerk errors passed through `projectSafeErrorDiagnostics`.
   - **An address that changes after a send** within the window gets a second notice at the new address. That is existing behaviour, and acceptable.
3. **The acknowledgment.**
   - It already sends after its transaction commits, and its errors cannot fail Stripe's webhook.
   - Skip the lookup when checkout confirmed the address from Clerk within the Checkout session's lifetime. Otherwise leave the row queued for the cron rather than calling Clerk inline.
   - Counsel confirms that the cron's delay, up to about a day, is still "prompt" under New York's rule.
4. **Verified addresses only, everywhere.**
   - Both email selectors, provisioning and the webhook, take only verified addresses (DEBT-502 item 3). Checkout and add-card refuse an unverified refreshed primary.
   - The Billing page tells the user to verify their address. That is their recovery path, and under item 2 their notice then goes out.
   - Prerequisite: the owner's Clerk setting "Verify at sign-up" in both instances.
5. **Stripe's copy follows Clerk, and is never a legal channel.**
   - **One writable source.** Clerk's verified address is the only one the user maintains. Every write of it, through provisioning, the webhook, the send-time lookup and the reconcile, pushes it to the Stripe customer. `email` leaves the portal's allowed updates, so receipts and invoices track the account address instead of the sign-up address.
   - **No legal reliance.** No notice DEBT-414 requires relies on Stripe's emails. Their address was customer-editable until now, their content is not ours, and we get no per-delivery evidence. F19a's Stripe path closes, and its fallback is the recommendation: our own Massachusetts reminder about 25 days before the cancellation deadline, with a send-by limit and a missed-deadline alert. Whether the rule applies stays with the owner and counsel, as does F19c's per-charge notice.
   - The owner may instead choose a separate billing contact; that is a product decision.
6. **Daily reconcile, later (P3).**
   - Compare stored emails with Clerk for users with live subscriptions, filtering the Backend API by up to 100 user IDs per call.
   - Count a user as missing only after a canary confirms the instance.
   - Alert on drift and missing users first, and repair once the alerts run quietly.
7. **Order and prerequisites.**
   - DEBT-505's alert path comes first, because a held notice without an alert is silent.
   - DEBT-502 item 2's locked provisioning transaction comes before the write in item 2 above, and DEBT-502 item 3 before item 4.
   - Then this record. DEBT-503 item 1 may ship earlier, under the timing in Impact.

## Verification

- [ ] Dispatch and job tests, using a fake Clerk lookup, cover:
  - match, changed, unverified, conflict, a tombstoned 404 and a wrong-instance 404;
  - unavailable, and the last-run rule with and without a recent confirmation, and its alert;
  - a write refused by the `updated_at` guard.
  No branch sends to an address Clerk has not confirmed as verified within the past 7 days, and a send under the last-run rule alerts.
- [ ] A real-Postgres test shows a changed address re-queued and sent in the same run, including on the last eligible run. A held notice goes out once the user verifies.
- [ ] Both email selectors refuse unverified addresses, and checkout refuses an unverified refreshed primary.
- [ ] Clerk's address reaches the Stripe customer on every write, and the portal no longer offers an email edit.
- [ ] DEBT-414 F19a no longer relies on Stripe's emails.
- [ ] The owner records a read-only count of live subscriptions, and the earliest renewal.
- [ ] The reconcile ships with its alert, and runs clean for two weeks.
