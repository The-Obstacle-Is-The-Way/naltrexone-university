# BUG-359: The Ledger CLI Hides Usage and Target Errors

**Status:** Open — preserve safe ledger usage/target diagnostics, red first
**Priority:** P3
**Date:** 2026-10-18

## Summary

The migration-ledger command replaces its own actionable usage and missing-target messages with a generic failure. It still exits nonzero; the defect is loss of the information needed to correct the command.

## Evidence

- `scripts/verify-migration-ledger.ts:16-21` throws a usage message for a missing or invalid phase; `:24` calls `requireExplicitDatabaseUrl`, whose explicit-URL error is defined in `scripts/database-target.ts:21-26`.
- The catch at `scripts/verify-migration-ledger.ts:54-60` prints code, message and remedy for `MigrationLedgerVerificationError`, but replaces all other errors with `Migration ledger verification failed.`
- Reproduced without a database connection: with `DATABASE_URL` absent, both `pnpm exec tsx scripts/verify-migration-ledger.ts` and `pnpm exec tsx scripts/verify-migration-ledger.ts pre` exit 1 and print only that fixed line. The first fails argument parsing and the second fails before constructing the Postgres client.

## Impact

An operator cannot distinguish invalid arguments or a missing explicit target from an infrastructure failure from this output. The command does not falsely pass.

## Options

1. Separate and report safe input-validation failures before the driver boundary, retaining sanitized unknown/driver errors and the existing typed ledger diagnostics.
2. Print every error message. Rejected: provider errors can contain sensitive connection details.

## Resolution (proposed)

Option 1, with subprocess negative controls for missing/invalid arguments and absent/invalid URLs. Do not force all scripts onto one error-printing policy to fix entry detection.

## Verification

- [ ] Safe input failures exit nonzero with actionable messages, red first.
- [ ] Unknown/driver errors remain sanitized; typed ledger failures retain their code and remedy.

## Related

- DEBT-532: the scripts audit previously embedded this defect.
- BUG-354: direct-entry detection is a separate defect.
