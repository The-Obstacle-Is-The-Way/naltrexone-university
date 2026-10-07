# DEBT-511: Legal Notices Go to a Stored Email That Clerk May Have Changed

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — resolution decided below; it must ship before paid acquisition, after DEBT-505
**Priority:** P2
**Date:** 2026-10-07
**Resolved:** —
**Verification receipts:** —

---

## Summary

The legally required renewal notices and the renewal acknowledgment go to our stored copy of the user's email. No send asks Clerk, the source of truth. A change only reaches the stored copy through Clerk's `user.updated` webhook, or through the user's next sign-in. Clerk documents that webhook deliveries are not guaranteed.

So an annual subscriber who changed their address and has not signed in since can be sent a legal notice at an old address. That address may now belong to someone else.

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
  - Svix retries for about 27 hours (immediately, then 5 s, 5 m, 30 m, 2 h, 5 h, 10 h, 10 h). It disables an endpoint that keeps failing for 5 days. It keeps payloads 90 days for a manual replay ([retries](https://docs.svix.com/retries)).
- **Stripe's copy.**
  - Set once, at `customers.create` (`stripe-customers.ts`), and never updated. There is no `customer.updated` handling.
  - The billing portal lets the customer edit it (`stripe-portal-configurations.ts`).
  - Stripe's upcoming-renewal email goes to this copy. DEBT-414 F19a lists it as a *candidate* for Massachusetts' 5–30-day notice, to be verified first.
- **Cost.** Clerk's Backend API allows 1,000 requests per 10 seconds in production. A lookup per send is about 80 per daily run plus acknowledgments, off the request path.

## Impact

- **A stale address** can miss a legally required notice.
- **A reassigned address** can disclose the subscription to another person.
- **No one is told.** A misdirected notice is silent.
- **Timing.** The product is pre-revenue, with no real subscribers yet, so this must be fixed before paid acquisition. It is not an incident today.

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

1. **Look up the address at send time.**
   - Before sending any legally required message, acknowledgments included, dispatch asks Clerk for the user's primary email whose verification status is `verified`. It calls a new port, outside any transaction.
   - **Address matches:** send.
   - **Address differs:** write it through the BUG-284-safe provisioning path, with Clerk's `updatedAt` and the tombstone lock. Then supersede the queued notice as `destination_changed`. A scheduled notice re-queues on the next run, inside its retry window. An acknowledgment re-queues at once.
   - **Clerk unavailable** (429, 5xx or timeout): do not send, keep the row queued, and alert through [DEBT-505](./debt-505-logged-only-failures-alert-nobody.md). Never fall back to the stored address, which may now be someone else's.
   - **User deleted (404), primary address unverified or missing, or the address owned by another row:** supersede with a named reason and alert. The repair paths are DEBT-502 items 1–3.
2. **Verified addresses only, everywhere.** Both email selectors, provisioning and the webhook, take only verified addresses. This is DEBT-502 item 3's decision, made a prerequisite here.
3. **Stripe's copy is the billing contact, never a legal channel.** A legal obligation is met only by a system we control and can audit: our own notice system, sending to the Clerk-verified address at send time.
   - Stripe's reminder fails all three tests: the customer can edit its address, we do not control its content, and we get no per-delivery evidence.
   - So no notice DEBT-414 requires may rely on Stripe's emails, and F19a's Stripe path closes. Its own fallback remains: our own Massachusetts reminder about 25 days before the cancellation deadline, with a send-by limit and a missed-deadline alert.
   - Stripe's copy stays the customer's billing contact for receipts and invoices, editable in the portal as a normal feature. That needs no sync and no code.
   - Whether Massachusetts' rule applies is still the owner's and counsel's decision under F19a.
4. **Daily reconcile, later (P3).**
   - A daily Backend API listing (500 per page, sorted by `updated_at`) compares stored emails with Clerk.
   - It alerts on drift and on missed deletions first, and repairs once the alert path has run quietly.
5. **Order.**
   - DEBT-505's alert path first, because a send refused without an alert is a silent missed notice.
   - Then this record.
   - DEBT-503 item 1 may ship earlier, because no real subscriber exists yet. Both must be in production before paid acquisition.

## Verification

- [ ] Dispatch tests cover every branch above, with a fake Clerk lookup: match, changed, unavailable, deleted, unverified and conflict. No branch sends to an unconfirmed address.
- [ ] A real-Postgres test shows that a changed address supersedes the queued notice, and that the next run queues to the new address.
- [ ] Both email selectors refuse unverified addresses.
- [ ] DEBT-414 F19a no longer relies on Stripe's emails, and any Massachusetts reminder is sent by our own notice system.
- [ ] The reconcile ships with its alert, and runs clean for two weeks.
