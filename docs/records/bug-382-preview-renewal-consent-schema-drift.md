# BUG-382: Preview checkout cannot persist renewal consent on the draft 0033 schema

**Status:** Verifying — owner's preview test card (QA 10a), then production's ledger records 0055 after promotion; due 2026-11-20
**Priority:** P1
**Date:** 2026-11-19

---

## Summary

The shared preview database applied the first version of migration 0033 from #743. Migration 0034 removes the temporary cancellation-method default. It leaves three logical differences in the renewal consent table. The migration verifier accepts that draft's hash even when those differences persist.

## Evidence

- The original 0033 in #743 hashes to `d3cefbfc623b5a0c`. Its final version hashes to `d465645a2e64ad9d`. Preview records the former and production the latter.
- Before 0055 on November 19, a verified read-only transaction on the shared preview measured 0 total rows in `public.renewal_consent_records` and 0 rows with `consent_source = 'application'`. The second count bounds the legacy rows that could fail the new validated check.
- In verified read-only transactions, preview lacked the nullable `application_source_id varchar(255)` column and its partial unique index. Its source-session check omitted the application-source conditions. Production matched the final 0033 for all three definitions.
- A test-mode subscription Checkout completion on November 19 returned HTTP 500. The preview webhook log and the event's persisted error both identify PostgreSQL `42703`. The controller passes an explicit null application source to the consent repository, which names the column in its insert and return projection. Read-only EXPLAIN of that generated statement names the missing column on preview and succeeds on production.

## Impact

Preview cannot record consent through that insert or queue its acknowledgment, and it never could. The schema #743 merged on August 6 already declared the column, and Drizzle's insert names every column of the table, so every consent write on the preview has failed since.

On November 20, a verified read-only transaction on the shared preview found nine `checkout.session.completed` events stored unprocessed with SQLSTATE `42703`, dated August 12 to November 19.
- Stripe still returns the eight newest. All eight come from manual QA accounts, including the permanent QA account: six subscription checkouts and two card saves.
- The August event is past Stripe's 30-day event retention.
- Stripe retries a sandbox delivery only three times over a few hours, so it will not deliver the seven older events again.
- The only delete path prunes a record a year after its subscription ends, so the table is empty because of these failures, not a removal.

Those accounts have no consent or acknowledgment on the preview. Do not resend their events: a replayed card save re-checks its subscription, and if that subscription has moved on, the handler ends the setup and detaches the card.

The billing QA screens passed throughout, because Stripe creates the subscription and saves the card even when the webhook fails. Production has the required objects.

## Options

- An owner-operated one-time repair can unblock this preview. Each other database with the draft hash would need independent discovery, repair and verification.
- A forward migration can repair installations bearing the draft and preserve both historical hashes. The canonical installation should require no application-table DDL. Verify both migration paths before authorizing deployment.

## Resolution (decided)

Migration 0055 repairs the measured draft in one transaction. On the canonical path it leaves the consent table untouched. A legacy application consent lacking a recoverable source ID stops validation and rolls back. The ledger checks the repair timestamp and hash. The integration suite replays each allowlisted draft against the canonical SQL and compares column, constraint, index and enum definitions at its claimed repair. Billing & Entitlement now checks, read-only, that each Checkout step's webhook was processed and recorded its consent and acknowledgment.

Corrected 2026-11-19: the failed review build contained the regenerated SQL. The earlier successful preview contained the draft. The source establishes which bytes each built.

## Verification

- [x] Disposable PostgreSQL reproduced the old verifier’s false acceptance and the three differences after 0034. Both paths converge after 0055. A managed rehearsal preserved the canonical index and constraint identities and rolled back an incompatible legacy row.
- [x] After the approved preview repair, a read-only comparison matched the column, validated check and valid unique partial index to production. The ledger kept all 55 earlier entries and appended the checked-in 0055 hash. The previously failing consent insert passed EXPLAIN.
- [ ] On the repaired preview, the owner saves test card `4242 4242 4242 4242` through **Add a card to keep access** (QA step 10a). Its `checkout.session.completed` event is processed with no `error`, `renewal_consent_records` holds the `stripe_setup` row for its `setup_session_id`, and `renewal_notice_deliveries` holds that row's `acknowledgment`. Billing QA resumes only after this check.
- [ ] After promotion, production's ledger records 0055, and its column, validated check and unique partial index are unchanged.

## Related

#743 introduced the consent schema. Migration 0028 is the precedent for repairing an already-applied draft.
