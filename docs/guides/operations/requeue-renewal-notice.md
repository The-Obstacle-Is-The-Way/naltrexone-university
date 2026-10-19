# Requeue a Quarantined Renewal Notice

A renewal notice that the system will not send again by itself sits in `renewal_notice_deliveries` with one of two statuses:

- **`outcome_unknown`.** Resend's answer was ambiguous, or a claim was still unfinished after 15 minutes when a later run checked it. Both raise `renewal_notice_outcome_unknown`.
- **`terminal_failure`.** A provider refusal, bounce, send failure, suppression, corrupt payload or missing anniversary facts raises `renewal_notice_terminal_failure`. A late reminder raises `renewal_notice_send_by_cutoff_passed`. Intentional supersession does not alert: the old notice should no longer be sent.

Stale claims are checked only when the job runs. A late stall may therefore be discovered after the send-by cutoff; raising an alert does not guarantee time remains to recover.

The [alert runbook](../../architecture/observability.md#operational-alerts) leads here. `pnpm notice:requeue` runs `RequeueRenewalNoticeDeliveryUseCase`, preserving the operator, reason and prior status in the audit. An unknown outcome requires truthful confirmation that nothing was sent ([ADR-027](../../adr/adr-027-free-trial-renewal-consent-and-notices.md), decision 8). Never bypass this with SQL or a false confirmation. Requeue is an audited retry of the same notice, not a way to repair its immutable evidence or reconcile a previously accepted send.

## 1. Find and identify the notice

Alerts carry a count. Query the quarantined rows, for example in Neon's SQL editor:

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

Open reminders come first, soonest cutoff first; then notices without a reminder cutoff; then expired reminders. Acknowledgments have no cutoff. `material_change` and `fee_change` also have no reminder cutoff, but nothing currently schedules them.

For the selected ID, record its `attempt_count` **before** checking the provider, and inspect its `payload_snapshot` and `provider_idempotency_key` as well. The command binds your evidence to that inspected attempt count. In [Resend's email details](https://resend.com/docs/dashboard/emails/manage-emails) and [API logs](https://resend.com/docs/dashboard/logs/introduction), match the recipient, subject and full stored content, using the exact key if the provider evidence exposes it. **Recipient and time alone are insufficient:** the annual job creates both an `annual_reminder` and a `renewal_notice` in the same run. One can succeed while the other is unknown. Inspect all matching requests and their linked emails, including earlier attempts and requeues. Do not use the dashboard's resend action; it bypasses the application's audit and revalidation.

A quarantined row with a `provider_event_id` was accepted before a failure report. An `outcome_unknown` row normally has none; a missing ID is not evidence that Resend sent nothing.

## 2. Decide whether and when to retry

A retry uses the same destination, immutable content and idempotency key. [Resend retains keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys); a repeat inside that window returns the earlier response without sending another email.

- **Check the deadline first.** Dispatch refuses a reminder after `send_by`, 30 days before renewal. First selection is at 35 days, leaving at most five days to recover. The daily cron starts between 09:00 and 10:00 UTC and has a five-minute runtime limit. For that route, requeue before 09:00 on a day whose run can finish before the cutoff, allowing until 10:05 and time for failures or a backlog. If the next scheduled run is too late, use the manual run in step 4 while time remains. After the cutoff, escalate the missed notice to the owner (DEBT-414 F07); requeue cannot extend it.
- **`outcome_unknown`: establish that this notice was not sent.** Check the exact notice identified in step 1. A missing dashboard result alone, especially just after a timeout, is not proof: the gateway's ten-second timeout does not cancel the provider request. Resolve incomplete evidence with Resend before asserting `--confirmed-no-send`. Once no send is confirmed, requeue promptly; there is no reason to consume another day waiting for a send that did not occur. If a send is confirmed, do not set the flag, even if that email later failed. Leave the row quarantined and escalate reconciliation to the owner under DEBT-414 F21. That case has no supported reconciliation command today.
- **A previously accepted, failed email: let its idempotency window expire before requeue.** Use Resend's timestamp for the original accepted request, not `last_attempt_at`: the latter is the application's claim time and can also describe a later local refusal. Wait beyond 24 hours, allowing for timestamp precision; 25 hours from the provider timestamp is a conservative margin. Only then requeue, because any daily or manual run can select a queued row. If that margin would consume the last opportunity, verify the exact expiry with Resend and use the manual run after expiry and before the cutoff. Inside the window, a replay can falsely return the row to `accepted` without a new email.
- **Fix an actionable terminal cause first.** An invalid API key or sender configuration can be corrected before retry. A bounced or suppressed mailbox must be made deliverable; retrying the same address does not fix it. `payload_integrity_failure` cannot be fixed by requeue, because the evidence is immutable: escalate to the owner without editing it in SQL.
- **A changed address or superseded notice:** do not requeue an obsolete scheduled row. Dispatch refuses it again as `notice_superseded` (for example, `destination_changed`). While the window remains open, the daily or manual job can queue a replacement for the new account address. An acknowledgment is never revalidated and would still go to its stored old address; a new-address acknowledgment needs the owner. Missing anniversary facts raise an alert and need correction under DEBT-501 before an anniversary reminder can pass revalidation.

## 3. Requeue it

Set `RENEWAL_NOTICE_OPERATOR` to your name or email. Use an explicit `DATABASE_URL`; a remote target also requires the exact `DB_TARGET_ACK` JSON named by its first refusal, as in [Promote to Production](../release/promote-to-production.md). Replace the quoted placeholders with the values from your inspection and target check.

```bash
RENEWAL_NOTICE_OPERATOR="you@example.com" DATABASE_URL="<production url>" DB_TARGET_ACK='<from the first refusal>' \
  pnpm --silent notice:requeue --delivery-id "<id>" --expected-attempt-count "<inspected-attempt-count>" --reason "<what you checked and why>" --confirmed-no-send
```

Omit `--confirmed-no-send` for a terminal failure unless you have confirmed no send; its audit then records `false`. Put arguments directly after the script name: pnpm 11 passes a `--` separator through, which this parser refuses. Keep personal information out of the reason where possible; the command prints the audit text you supply.

The redacted database target goes to stderr. Stdout names the row, its `queued` status and the latest audit entry. A nonexistent ID or a row outside the two quarantine statuses is refused without a change. If another retry changed the attempt after your inspection, even before the command started, the command returns a conflict instead of applying stale confirmation or overwriting the audit. Repeat the row and provider checks for the new attempt before retrying; never just copy a newer count into the old command. New audit entries include `priorAttemptCount`; older entries can lack it. The command queues a retry; it does not itself send email.

## 4. Run dispatch and confirm delivery

If the next daily run fits the deadline, inspect the row after that run completes. For an urgent recovery, the existing authenticated POST invokes the same production job immediately:

```bash
curl --fail-with-body --silent --show-error --request POST \
  --header "Authorization: Bearer ${CRON_SECRET:?}" \
  https://addictionboards.com/api/cron/send-renewal-notices
```

Use the production cron secret. **This runs the whole job**, including other due notices and its normal maintenance, not just your row. The route permits five requests per minute; honor `Retry-After` on a 429. A non-2xx response needs investigation. A successful response reports `selected`, `dispatchFailures`, `queueFailures` and `staleUnknown`; none proves this particular row was sent. The job selects at most 80 due deliveries per run, so a backlog may require another admitted run while time remains. Do not blindly retry a request that timed out: inspect the row and provider evidence first.

For example, a failed accepted send on Monday at 09:30 UTC, with a Wednesday 08:00 cutoff, reaches the conservative 25-hour margin on Tuesday at 10:30. Requeue and a manual run on Tuesday can recover it; waiting for Wednesday's cron cannot.

Check both the row and Resend:

- The row should become `accepted`, then `delivered` when its report arrives. Inspect the email for its new `provider_event_id` and verify actual delivery.
- An email created after requeue is the new send. A recorded failure returns the row to `terminal_failure` and alerts; restart at step 1 after fixing the cause.
- An email created before requeue is a replay. If its earlier report was dropped before the row had that provider ID, the row can remain `accepted` indefinitely. A later report can still update it. Do not treat acceptance as delivery: the deadline checks count acceptance as sent, so they cannot detect this case. Escalate missing provider evidence under F21 and any missed deadline under F07.

Before relying on production delivery reports, the owner must have configured the signed Resend webhook (DEBT-414). This procedure does not establish that configuration or close F21's early-report gap.
