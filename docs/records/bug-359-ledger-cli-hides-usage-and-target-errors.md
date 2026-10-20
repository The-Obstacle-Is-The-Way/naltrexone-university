# BUG-359: The Ledger CLI Hides Usage and Target Errors

**Status:** Verifying — promotion to main; due 2026-10-23
**Priority:** P3
**Date:** 2026-10-18

---

The Summary, Evidence and Impact describe audit baseline `0680cb2d`, before this fix; Resolution describes the implementation in this PR.

## Summary

The migration-ledger command replaces its own actionable usage, missing-target and invalid-target messages with a generic failure. It still exits nonzero; the defect is loss of the information needed to correct the command.

## Evidence

- `scripts/verify-migration-ledger.ts:14-19` throws a usage message for a missing or invalid phase; `:24` calls `requireExplicitDatabaseUrl`, whose explicit-URL error is defined in `scripts/database-target.ts:21-26`.
- The catch at `scripts/verify-migration-ledger.ts:54-60` prints code, message and remedy for `MigrationLedgerVerificationError`, but replaces all other errors with `Migration ledger verification failed.`
- Reproduced without a database connection: with `DATABASE_URL` absent, both `pnpm exec tsx scripts/verify-migration-ledger.ts` and `pnpm exec tsx scripts/verify-migration-ledger.ts pre` exit 1 and print only that fixed line. The first fails argument parsing and the second fails before constructing the Postgres client.
- Invalid targets are hidden too. `:25` calls `authorizeManagedDatabaseTargets`, which raises "The explicitly supplied DATABASE_URL is invalid." (`database-target.ts:86-97`); `DATABASE_URL='not a url' pnpm exec tsx scripts/verify-migration-ledger.ts pre` prints only the fixed line.

Corrected 2026-10-19: invalid-target errors are hidden as well.

## Impact

An operator cannot distinguish invalid arguments or a missing explicit target from an infrastructure failure from this output. The command does not falsely pass. It runs in every Vercel build (`vercel.json` `buildCommand`), so a build without a `DATABASE_URL` shows only "Migration ledger verification failed." in its log.

## Options

1. Separate and report safe input-validation failures before the driver boundary, retaining sanitized unknown/driver errors and the existing typed ledger diagnostics.
2. Print every error message. Rejected: provider errors can contain sensitive connection details.

## Resolution

Implemented option 1. A shared command runner validates argument count, phase and the explicit target before verification. Repository-owned input errors print actionable messages; typed ledger errors retain code and remedy, while arbitrary failures after the driver boundary print a fixed sanitized line. Like every strict parser since #1567, the command refuses a forwarded pnpm `--` with its usage message.

Corrected 2026-10-20: the phases no longer accept a leading separator, following #1567's merged rule.

Corrected 2026-10-19: bind reproduction claims to the audited baseline and record the red-first implementation, passing local gate and remaining final-sync verification.

## Verification

- [x] Safe input failures exit nonzero with actionable messages, red first.
- [x] Unknown/driver errors remain sanitized; typed ledger failures retain their code and remedy.

## Related

- DEBT-532: the scripts audit previously embedded this defect.
- BUG-354: direct-entry detection is a separate defect.
