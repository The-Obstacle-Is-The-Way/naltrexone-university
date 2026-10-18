# Requeue a Quarantined Renewal Notice

A renewal notice that the system will not send again by itself sits in `renewal_notice_deliveries` with one of two statuses:

- **`outcome_unknown`.** Resend's answer was ambiguous, or a send attempt was still unfinished 15 minutes after it started, which the next daily run finds a day later. Either raises the [`renewal_notice_outcome_unknown` alert](../../architecture/observability.md#operational-alerts). The notice may or may not have reached the subscriber.
- **`terminal_failure`.** Resend refused the send, reported a bounce, failure or suppression, or dispatch refused the notice.

`scripts/requeue-renewal-notice.ts` (`pnpm notice:requeue`) puts one of these rows back in the queue. It runs `RequeueRenewalNoticeDeliveryUseCase`, so the operator, the reason and the prior status are kept in the row's audit fields, and an unknown outcome is refused without confirmation that nothing was sent ([ADR-027](../../adr/adr-027-free-trial-renewal-consent-and-notices.md), decision 8). Never change the row with SQL instead: that skips the audit and the confirmation.

## 1. Find the row

The alert carries only a count, and Vercel keeps the log line that names the delivery ID for an hour on Hobby. Find the row with a read-only query, such as one in Neon's SQL editor:

```sql
SELECT * FROM (
  SELECT id, notice_kind, status, failure_class, failure_code, destination,
         provider_event_id, attempt_count, last_attempt_at, applicable_at,
         CASE WHEN notice_kind IN ('annual_reminder', 'renewal_notice', 'anniversary_reminder')
              THEN applicable_at - interval '720 hours' END AS send_by -- 30 days, as dispatch counts them
  FROM renewal_notice_deliveries
  WHERE status IN ('outcome_unknown', 'terminal_failure')
) quarantined
ORDER BY CASE WHEN send_by > now() THEN 0 WHEN send_by IS NULL THEN 1 ELSE 2 END,
         send_by, last_attempt_at DESC NULLS LAST;
```

`provider_event_id` is set only on a row Resend accepted before reporting a bounce, failure or suppression. An `outcome_unknown` row has none. `send_by` is a reminder's send-by cutoff. Reminders still before it come first, soonest first; then acknowledgments, which have none; then reminders past it, which a requeue can no longer help.

## 2. Decide whether to send it again

A requeued notice goes to the same `destination`, with the same content and the same Resend idempotency key. Resend keeps that key for 24 hours after it receives a send, and answers a repeat inside that time with its earlier answer instead of sending again ([Resend's idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys); ADR-027).

- **Act before `send_by`.** A reminder must go out before its send-by cutoff, 30 days before renewal. A requeued row waits for the next daily run, which Vercel starts at any time between 09:00 and 10:00 UTC, so requeue it before 09:00 UTC on the last day whose run ends before `send_by`. Reminders are first sent 35 days before renewal, so a quarantined reminder leaves you five days at most, and less when earlier attempts failed or the attempt stalled. After `send_by` a requeue cannot help: dispatch refuses the notice as `notice_deadline_passed`, and the missed-deadline alert recurs each day. The remedy for a missed deadline is a counsel question (DEBT-414 F07). An acknowledgment has no cutoff.
- **`outcome_unknown`: check Resend, then requeue at once.** In Resend's dashboard, look for an email to the row's `destination` near its `last_attempt_at`. If Resend shows one, the notice was sent; do not requeue it, and if that email bounced, failed or was suppressed, treat it as the bounced address below. If it shows none, requeue it with `--confirmed-no-send` straight away; waiting 24 hours would spend days the cutoff does not leave. Your check is what prevents a second email: a requeued send more than 24 hours after the first is a new email, and the next run reaches Resend inside 24 hours only some days. When it does, Resend answers with any email you missed, and step 4 shows it.
- **A row with a `provider_event_id`: wait until 25 hours after `last_attempt_at`.** Resend accepted that email, then reported it bounced, failed or suppressed. Inside its 24 hours, which start seconds after `last_attempt_at`, Resend answers a requeue with that same email and sends nothing, yet the row is marked `accepted`. If the wait runs past `send_by`, the notice cannot go out again in time.
- **`terminal_failure`: fix the cause first.** `failure_class` and `failure_code` say why.
  - **A bounced or suppressed address fails again,** because the requeue sends to the same address.
  - **A scheduled notice whose account email changed:** do not requeue the old row. Dispatch would refuse it as `destination_changed`. While the notice window is still open, the daily job queues a new notice for the new address.
  - **An acknowledgment** (`notice_kind = 'acknowledgment'`) is never rechecked, so its requeue goes to the old address. Nothing can send it to a new address; raise that with the owner.
  - **A notice refused as superseded or late** (`notice_superseded`, `notice_deadline_passed`) is refused again, because dispatch rechecks every scheduled notice before sending it.

## 3. Requeue it

Set `RENEWAL_NOTICE_OPERATOR` to your name or email; the audit records it. The command needs an explicit `DATABASE_URL`, and a remote target is refused until `DB_TARGET_ACK` matches the JSON its first refusal names. That is the same workflow the manual seed uses in [Promote to Production](../release/promote-to-production.md).

```bash
RENEWAL_NOTICE_OPERATOR="you@example.com" DATABASE_URL="<production url>" DB_TARGET_ACK='<from the first refusal>' \
  pnpm --silent notice:requeue --delivery-id <id> --reason "<what you checked and why>" --confirmed-no-send
```

Leave out `--confirmed-no-send` for a `terminal_failure` you have not checked in Resend; the audit then records that no check was confirmed. Put the arguments straight after the script name: pnpm 11 passes a `--` separator through to the script, which refuses it.

The redacted `Database target:` line goes to stderr. On success, stdout names the row, its new `queued` status and the audit entry. A delivery ID that does not exist, or a row in any other status, is refused as not eligible, and nothing changes.

## 4. Confirm it went out

The next daily renewal-notice run, scheduled for 09:00 UTC (`vercel.json`) and started by Vercel at any time before 10:00 UTC, picks up the queued row, rechecks it and sends it. After that run, check both:

- **The row** is `accepted`, or `delivered` once Resend's delivery report arrives.
- **Resend** shows the email with the row's new `provider_event_id`, and that email was delivered.
  - An email created after your requeue is the new send. If it bounces, fails or is suppressed, Resend's report marks the row `terminal_failure` again.
  - An email created before your requeue is Resend's earlier answer. For a requeued `terminal_failure`, nothing new went out. For a requeued `outcome_unknown`, the first attempt went out after all. Its report arrived before the row had its ID, so the row stays `accepted` whatever became of that email. If it was not delivered, the notice was not given and nothing will alert, because the missed-deadline check counts `accepted` as sent: raise it with the owner (DEBT-414 F07).

If the row is quarantined again, start over at step 1.
