# Requeue a Quarantined Renewal Notice

A renewal notice that the system will not send again by itself sits in `renewal_notice_deliveries` with one of two statuses:

- **`outcome_unknown`.** Resend's answer was ambiguous, or a send attempt was still unfinished 15 minutes after it started. An ambiguous answer raises the [`renewal_notice_outcome_unknown` alert](../../architecture/observability.md#operational-alerts). A stalled attempt raises none: the daily job quarantines it and reports the count only as `staleUnknown` in the cron's response, so its first alert is the missed-deadline alert, which comes after the send-by cutoff in step 2, too late for a requeue. Either way, the notice may or may not have reached the subscriber.
- **`terminal_failure`.** Resend refused the send, reported a bounce, failure or suppression, or dispatch refused the notice.

`scripts/requeue-renewal-notice.ts` (`pnpm notice:requeue`) puts one of these rows back in the queue. It runs `RequeueRenewalNoticeDeliveryUseCase`, so the operator, the reason and the prior status are kept in the row's audit fields, and an unknown outcome is refused without confirmation that nothing was sent ([ADR-027](../../adr/adr-027-free-trial-renewal-consent-and-notices.md), decision 8). Never change the row with SQL instead: that skips the audit and the confirmation.

## 1. Find the row

The alert carries only a count, and Vercel keeps the log line that names the delivery ID for an hour on Hobby. Find the row with a read-only query, such as one in Neon's SQL editor:

```sql
SELECT id, notice_kind, status, failure_class, failure_code, destination,
       provider_event_id, attempt_count, last_attempt_at, applicable_at,
       CASE WHEN notice_kind IN ('annual_reminder', 'renewal_notice', 'anniversary_reminder')
            THEN applicable_at - interval '720 hours' END AS send_by -- 30 days, as dispatch counts them
FROM renewal_notice_deliveries
WHERE status IN ('outcome_unknown', 'terminal_failure')
ORDER BY send_by NULLS LAST, last_attempt_at DESC NULLS LAST;
```

`provider_event_id` is set only on a row Resend accepted before reporting a bounce, failure or suppression. An `outcome_unknown` row has none. `send_by` is a reminder's send-by cutoff; the most urgent row comes first.

## 2. Decide whether to send it again

A requeued notice goes to the same `destination`, with the same content and the same Resend idempotency key. Resend keeps that key for 24 hours (ADR-027): a request that repeats it inside that time gets the earlier answer, and no second email.

- **Act before `send_by`.** A reminder must go out before its send-by cutoff, 30 days before renewal. A requeued row waits for the next daily run at 09:00 UTC, which Vercel may start at any time in that hour, so requeue it before the last run ahead of `send_by`. Reminders are first sent 35 days before renewal, so a quarantined reminder leaves you five days at most, and less when earlier attempts failed. After `send_by` a requeue cannot help: dispatch refuses the notice as `notice_deadline_passed`, and the missed-deadline alert recurs each day. The remedy for a missed deadline is a counsel question (DEBT-414 F07). An acknowledgment has no cutoff.
- **`outcome_unknown`: check Resend, then requeue at once.** In Resend's dashboard, look for an email to the row's `destination` near its `last_attempt_at`. If Resend shows one, the notice was sent; do not requeue it. If it shows none, requeue it with `--confirmed-no-send` straight away. Waiting adds no safety here and spends the days before `send_by`: a requeued send that reaches Resend within 24 hours of the first attempt gets the earlier answer, not a second email.
- **A row with a `provider_event_id`: wait until 24 hours after `last_attempt_at`.** Resend accepted that email, then reported it bounced, failed or suppressed. Inside the 24 hours Resend answers a requeue with that same email and sends nothing, yet the row is marked `accepted`. If the wait runs past `send_by`, the notice cannot go out again in time.
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

The next daily renewal-notice run, at 09:00 UTC (`vercel.json`), picks up the queued row, rechecks it and sends it. Then check both:

- **The row** is `accepted`, or `delivered` once Resend's delivery report arrives.
- **Resend** shows the email with the row's new `provider_event_id`, and that email was delivered.
  - For a requeued `terminal_failure`, the email must have been created after your requeue. An earlier one is Resend replaying the send that failed, and nothing new went out.
  - For a requeued `outcome_unknown`, an earlier one means the first attempt went out after all, and the row now records it.

If the row is quarantined again, start over at step 1.
