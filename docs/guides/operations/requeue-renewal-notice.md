# Requeue a Quarantined Renewal Notice

A renewal notice that the system will not send again by itself sits in `renewal_notice_deliveries` with one of two statuses:

- **`outcome_unknown`.** Resend's answer was ambiguous, or a send attempt was still unfinished 15 minutes after it started. An ambiguous answer raises the [`renewal_notice_outcome_unknown` alert](../../architecture/observability.md#operational-alerts). A stalled attempt raises none: the daily job quarantines it and reports the count only as `staleUnknown` in the cron's response. Either way, the notice may or may not have reached the subscriber.
- **`terminal_failure`.** Resend refused the send, reported a bounce, failure or suppression, or dispatch refused the notice.

`scripts/requeue-renewal-notice.ts` (`pnpm notice:requeue`) puts one of these rows back in the queue. It runs `RequeueRenewalNoticeDeliveryUseCase`, so the operator, the reason and the prior status are kept in the row's audit fields, and an unknown outcome is refused without confirmation that nothing was sent ([ADR-027](../../adr/adr-027-free-trial-renewal-consent-and-notices.md), decision 8). Never change the row with SQL instead: that skips the audit and the confirmation.

## 1. Find the row

The alert carries only a count, and Vercel keeps the log line that names the delivery ID for an hour on Hobby. Find the row with a read-only query, such as one in Neon's SQL editor:

```sql
SELECT id, notice_kind, status, failure_class, failure_code,
       attempt_count, last_attempt_at, applicable_at
FROM renewal_notice_deliveries
WHERE status IN ('outcome_unknown', 'terminal_failure')
ORDER BY last_attempt_at DESC NULLS LAST;
```

## 2. Decide whether to send it again

- **`outcome_unknown`: check Resend first.** In Resend's dashboard, look for an email to the row's `destination` near its `last_attempt_at`. A send reuses the row's provider idempotency key. Resend honors that key for only 24 hours (ADR-027), so after that a requeued notice is always a new email. If Resend shows the email, do not requeue it; the notice was sent. Requeue only when you are sure nothing went out, and pass `--confirmed-no-send`.
- **`terminal_failure`: fix the cause first.** `failure_class` and `failure_code` say why. A bounced or suppressed address fails again until the address changes. A notice refused as superseded (`notice_superseded`) or late (`notice_deadline_passed`) is refused again, because dispatch rechecks every scheduled notice before sending it.

## 3. Requeue it

Set `RENEWAL_NOTICE_OPERATOR` to your name or email; the audit records it. The command needs an explicit `DATABASE_URL`, and a remote target is refused until `DB_TARGET_ACK` matches the JSON its first refusal names. That is the same workflow the manual seed uses in [Promote to Production](../release/promote-to-production.md).

```bash
RENEWAL_NOTICE_OPERATOR="you@example.com" DATABASE_URL="<production url>" DB_TARGET_ACK='<from the first refusal>' \
  pnpm --silent notice:requeue --delivery-id <id> --reason "<what you checked and why>" --confirmed-no-send
```

Leave out `--confirmed-no-send` for a `terminal_failure` you have not checked in Resend; the audit then records that no check was confirmed. Put the arguments straight after the script name: pnpm 11 passes a `--` separator through to the script, which refuses it.

The redacted `Database target:` line goes to stderr. On success, stdout names the row, its new `queued` status and the audit entry. A delivery ID that does not exist, or a row in any other status, is refused as not eligible, and nothing changes.

## 4. Confirm it went out

The next daily renewal-notice run, at 09:00 UTC (`vercel.json`), picks up the queued row, rechecks it and sends it. Afterwards the row should be `accepted`, or `delivered` once Resend's delivery report arrives. If it is quarantined again, start over at step 1.
