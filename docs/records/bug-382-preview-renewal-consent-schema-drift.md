# BUG-382: Preview checkout cannot persist renewal consent on the draft 0033 schema

**Status:** Blocked — the repository owner must approve the shared preview repair and verify a test-mode consent delivery; due 2026-11-20
**Priority:** P1
**Date:** 2026-11-19

---

## Summary

The shared preview database applied the first version of migration 0033 from #743. Migration 0034 removes the temporary cancellation-method default. It leaves three differences in the renewal consent table. The migration verifier accepts that draft's hash even when those differences persist.

## Evidence

- The original 0033 in #743 hashes to `d3cefbfc623b5a0c`. Its final version hashes to `d465645a2e64ad9d`. Preview records the former and production the latter.
- In verified read-only transactions, preview lacked the nullable `application_source_id varchar(255)` column and its partial unique index. Its source-session check omitted the application-source conditions. Production matched the final 0033 for all three definitions.
- A test-mode subscription Checkout completion on November 19 returned HTTP 500. The preview webhook log and the event's persisted error both identify PostgreSQL `42703`. The controller passes an explicit null application source to the consent repository, which names the column in its insert and return projection.

## Impact

Preview cannot record consent through that insert or queue its acknowledgment. The current table contents do not establish how many historical writes failed. Production has the required objects.

## Options

- An owner-operated one-time repair can unblock this preview. Each other database with the draft hash would need independent discovery, repair and verification.
- A forward migration can repair installations bearing the draft and preserve both historical hashes. The canonical installation should require no application-table DDL. Verify both migration paths before authorizing deployment.

## Resolution (decided)

Keep applied migrations immutable. Require evidence that each accepted legacy path reaches the expected catalog. The owner controls the shared database write.

## Verification

- [ ] Prove that a missing repair fails verification and that both historical paths can reach the expected catalog in disposable PostgreSQL.
- [ ] After the approved repair, compare the column, validated check and valid unique partial index to the canonical definitions. Preserve ledger history.
- [ ] Verify a test-mode checkout delivery and its committed consent and acknowledgment on the repaired preview before resuming billing QA.

## Related

#743 introduced the consent schema. Migration 0028 is the precedent for repairing an already-applied draft.
