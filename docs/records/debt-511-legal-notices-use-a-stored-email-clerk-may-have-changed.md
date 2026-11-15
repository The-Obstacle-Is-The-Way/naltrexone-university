# DEBT-511: Legal Notices Go to a Stored Email That Clerk May Have Changed

**Status:** Open — refresh before queuing (option B), after DEBT-502 items 3 and 2; ships 39 days before the first real renewal or anniversary, dated from the owner's count
**Priority:** P2
**Date:** 2026-10-07

---

## Summary

The legally required renewal notices and the renewal acknowledgment go to our stored copy of the user's email. No send asks Clerk, the source of truth. A change reaches the stored copy only through Clerk's `user.updated` webhook, when the user next starts a checkout or trial card setup, which refresh it from Clerk, or through BUG-284's stale-owner resolver. Clerk documents that webhook deliveries are not guaranteed.

So an annual subscriber who changed their address, and has not started a checkout or trial card setup since, can be sent a legal notice at an old address. That address may now belong to someone else.

Stripe's own renewal emails go to a third copy of the address, which is never synced and which the customer can edit in Stripe's portal.

DEBT-503 item 1 (released 2026-10-08) widened the gap slightly. It stopped refreshing the email on every signed-in page, so active users also depend on the webhook between checkouts.

## Evidence

- **Scheduled notices** (annual, renewal, and the monthly plan's anniversary):
  - The 09:00 UTC cron reads `users.email` when it queues a notice (`src/adapters/jobs/send-due-renewal-notices.ts:90`, `:215`).
  - It snapshots that address into `renewal_notice_deliveries.destination` and the payload (`src/application/use-cases/send-due-renewal-notices.ts`).
  - At send time, dispatch re-reads `users.email` and supersedes a notice whose address changed (`dispatch-renewal-notice-delivery.ts:194`, `destination_changed`). That is still our copy, not Clerk's.
- **The acknowledgment** is queued from `users.email` inside the Stripe webhook's transaction, and always sent, without a recheck (`stripe-webhook-controller.ts:108-133`; `dispatch-renewal-notice-delivery.ts:137-139`). Both of its call sites, trial card setup (`:448`) and checkout (`:692`), complete a Stripe session whose creation refreshed the address from Clerk (`billing-controller.ts:161`, called at `:186` and `:236`).
- **Which address the law wants.** DEBT-414 F07 decided that notices go to the account's *current* email, and nothing requires the address given at consent (DEBT-414). Counsel still holds F19d, whether email is "reasonably calculated to be seen".
- **How the stored copy changes,** since DEBT-503 item 1. Before it, every signed-in request's `currentUser()` upsert also wrote it.
  - The `user.updated` webhook: Svix-verified, recorded on failure and reprocessed on redelivery (`clerk-webhook-controller.ts`).
  - The refresh when the user starts a checkout or trial card setup, through `ensureClerkUser` (`src/adapters/gateways/clerk-user-provisioner.ts:296`).
  - Provisioning, and BUG-284's stale-owner resolver.
  We have no replay of our own. Both email selectors take the primary address, or else the first, without checking verification; DEBT-502 item 3 owns "verified only".
- **What Clerk and Svix guarantee.**
  - Clerk: webhooks are not for synchronous flows, may be duplicated or out of order, and "deliveries are not guaranteed". When order matters, read current state from the Backend API ([overview](https://clerk.com/docs/guides/development/webhooks/overview), [syncing](https://clerk.com/docs/guides/development/webhooks/syncing)).
  - Svix retries for about 27 hours (immediately, then 5 s, 5 m, 30 m, 2 h, 5 h, 10 h, 10 h), and disables an endpoint that keeps failing for 5 days ([retries](https://docs.svix.com/retries)). After that, only a manual replay from the Clerk Dashboard recovers an event.
- **Stripe's copy.**
  - Set once, at `customers.create` (`stripe-customers.ts`), and never updated. There is no `customer.updated` handling.
  - The billing portal lets the customer edit it (`stripe-portal-configurations.ts:29`).
  - Stripe's upcoming-renewal email goes to this copy. DEBT-414 F19a listed it as a candidate for Massachusetts' 5–30-day notice; that path closed on 2026-10-07 (Resolution, item 4).
- **Queue mechanics.**
  - **No second queuing.** The job's already-queued check ignores status and matches the destination to `users.email` (`send-due-renewal-notices.ts:121`, `:144`), and the scheduled unique index includes the destination (`db/schema.ts`). So a notice superseded while the stored address is unchanged is never queued again, while a changed stored address is queued afresh.
  - **Few runs.** The window from renewal minus 39 days to renewal minus 30 days gets 8–10 runs of the daily cron (Vercel Hobby fires it within about ±59 minutes). A notice not queued by the last run before its send-by cutoff (`renewalNoticeSendByCutoff`, `src/application/shared/renewal-notice-schedule.ts:8`) is never sent.
  - **The email write can be refused.** The upsert's `updated_at` guard keeps the stored address when its observation is not older than the incoming one (`drizzle-user-repository.ts:190`).
- **Cost.** Clerk's Backend API allows 1,000 requests per 10 seconds in production. One lookup per due subscriber per run is well under that, off the request path.

## Impact

- **A stale address** can miss a legally required notice.
- **A reassigned address** can disclose the subscription to another person.
- **No one is told.** A misdirected notice is silent.
- **Timing.** The owner states the product has no real subscribers yet; DEBT-501 item 7's live purchase is the owner's own check, refunded, with no renewal. A new subscriber's first scheduled notice is about eleven months away, and their acknowledgment uses the address checkout refreshes from Clerk. So the fix ships 39 days before the earliest annual renewal or monthly anniversary of a real live subscription, from the owner's read-only count. The portal-email item can ship earlier, but nothing makes it due before paid acquisition (AUDIT-015).

## Options

1. **Webhook only, plus checkout's refresh.** Rejected: Clerk documents that deliveries are not guaranteed.
2. **A session-token email claim.** Rejected: it never reaches the inactive annual subscriber who matters here; its address is not guaranteed verified; it cannot be ordered against webhook updates; and it puts the email in a cookie page JavaScript can read.
3. **Option A: a new lookup port, rechecked at queue and send time, with a 7-day confirmation rule and a daily reconcile.** Decided 2026-10-08; replaced on 2026-11-15 by the owner's choice of option B. Its design is in git at 34d9aea0.
4. **Option B: refresh the stored address from Clerk before queuing** (decided).

## Resolution (decided)

**Option B, the owner, 2026-11-15.** Before queuing a notice, the renewal job refreshes the user's email from Clerk through `ensureClerkUser`. If the refresh fails, it holds the notice and alerts; on the last eligible run it sends to the stored address and alerts. The webhook stays the everyday update path. No new port, migration or job.

1. **One shared refresh.** Move the billing refresh (`ClerkAuthGateway.refreshFromClerk` and `provisionFromClerk`, `src/adapters/gateways/clerk-auth-gateway.ts:79-137`: tombstone check, Clerk lookup with retry, email selection, `ensureClerkUser` with the deadlock retry) into one exported function beside `ensureClerkUser` in `clerk-user-provisioner.ts`. The gateway calls it unchanged. With DEBT-502 items 3 and 2 it takes only a verified primary address and writes under the tombstone lock.
2. **The renewal job refreshes before it queues** (`src/adapters/jobs/send-due-renewal-notices.ts`, wired in `app/api/cron/send-renewal-notices/route.ts:40` with the container's `getClerkUserById`, which alerts on Clerk's 429).
   - The due-subscription reads (`:86-92`, `:210-217`) also return the user's Clerk ID. After them and before `sendDueRenewalNotices.execute` (`:463`), refresh each due user once per run, shared by all their notices.
   - **Refreshed, and the stored address equals Clerk's:** queue to it, as today.
   - **Otherwise** (Clerk unavailable, a 404 or tombstone, no verified primary, an ownership conflict, or the guard keeping the old address): hold that user's notices unqueued for this run, and raise an operational alert through DEBT-505's path (a kind in `src/application/ports/operational-alerts.ts`, with its runbook row in `docs/architecture/observability.md`). The next run tries again.
   - **On a notice's last eligible run** (its send-by cutoff under 25 hours away): queue it to the stored address, and raise a second kind, so the owner can check that address.
   - Logs and alerts carry IDs and a reason only, never an address, with Clerk errors passed through `projectSafeErrorDiagnostics`.
   - Red first in `src/adapters/jobs/send-due-renewal-notices.test.ts`, with a stubbed Clerk lookup: match; changed; each refusal held and alerted; each refusal on the last run queued to the stored address and alerted. Then `tests/integration/send-renewal-notices-job.integration.test.ts`: a changed address stored, queued and sent in one run, and a held notice queued on a later run once Clerk confirms.
3. **The acknowledgment stays off the refresh.** It is queued inside the Stripe webhook's transaction, sent after commit, and its errors cannot fail Stripe's webhook. Both call sites follow a session whose creation refreshed the address (Evidence).
   - **Residual, accepted.** The webhook can run well after the session: Stripe retries a failed event for up to 3 days, and an operator can resend one within 30 days (`docs/architecture/integrations/stripe.md:255-256`); unresolved events are kept until then (`stripe-webhook-controller.ts:98-100`). The upsert's guard can also have kept the old address at session creation. So an address changed in that gap, with its `user.updated` missed, gets the acknowledgment at the old one.
   - **Why accepted.** A late delivery needs our webhook to have failed first, and the address was refreshed from Clerk when the session was created. A refresh here would put a Clerk call inside, or after, the webhook's transaction and rewrite a queued row that is immutable by design, for that rare case.
4. **Stripe's copy follows Clerk, and is never a legal channel.**
   - **One writable source.** Clerk's verified address is the only one the user maintains. Every write of it, through provisioning, the billing refresh, the webhook and the renewal job's refresh, pushes it to the Stripe customer. `email` leaves the portal's allowed updates, so receipts and invoices track the account address instead of the sign-up address.
   - **No legal reliance.** No notice DEBT-414 requires relies on Stripe's emails. Their address is customer-editable until this item removes it from the portal, their content is not ours, and we get no per-delivery evidence. F19a's Stripe path closes, and its fallback is the recommendation: our own Massachusetts reminder about 25 days before the cancellation deadline, with a send-by limit and a missed-deadline alert. Whether the rule applies stays with the owner and counsel, as does F19c's per-charge notice.
   - The owner may instead choose a separate billing contact; that is a product decision.
5. **The daily reconcile is declined** (the owner, 2026-11-15). The refresh before queuing covers the notices; a row left by a missed `user.deleted` stays DEBT-502 item 2's operator command.
6. **Order.** DEBT-502 items 3 and 2 first: the refresh must take only a verified address and must not race a deletion. Ownership conflicts need no prerequisite: until DEBT-502 item 1 automates the repair, the owner replays the stale owner's `user.updated` from the Clerk Dashboard ([runbook](../architecture/environments.md#a-missed-clerk-webhook-leaves-a-stale-email-or-a-deleted-users-row)), which moves that owner's address, and the held notice goes out on the next run.

**Done when** the job tests and the integration test above pass, the billing refresh's tests (`clerk-auth-gateway-session.test.ts`, `billing-controller-current-email.test.ts`) pass unchanged on the shared function, and item 4 ships.

## Verification

- [ ] The job's unit and integration tests cover a match, a change, each refusal held and alerted, and the last-run send to the stored address with its alert.
- [ ] DEBT-502 items 3 and 2 have shipped.
- [ ] Clerk's address reaches the Stripe customer on every write, and the portal no longer offers an email edit.
- [x] DEBT-414 F19a no longer relies on Stripe's emails (2026-10-07: its Stripe path is recorded as closed).
- [ ] The owner records a read-only count of real live subscriptions, and the earliest annual renewal or monthly anniversary; that date minus 39 days becomes this record's due date.

## Related

- DEBT-502: the identity work this builds on, and verified-only addresses (item 3).
- DEBT-505: the alert path a held notice uses.
- DEBT-414: F07, F19a and F19d.

Corrected 2026-11-15: the 2026-10-08 design (a lookup port, send-time rechecks, the 7-day rule and a daily reconcile) is replaced by option B, the owner's choice, and the reconcile is declined; the Resolution is rewritten as builder steps; the acknowledgment stays as it is, with its late-delivery residual accepted; the deadline counts real subscriptions only, not DEBT-501 item 7's refunded purchase; the verified-only item became a prerequisite (DEBT-502 item 3), so Stripe's copy is now item 4; DEBT-503 item 1 is released; evidence lines gained their line numbers.
