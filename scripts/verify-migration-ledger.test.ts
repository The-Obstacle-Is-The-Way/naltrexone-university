import { describe, expect, it } from 'vitest';
import { parseMigrationLedgerVerificationPhase } from './verify-migration-ledger';

describe('migration ledger verification CLI', () => {
  it.each([
    ['pre', 'pre'],
    ['post', 'post'],
  ] as const)('accepts the %s phase', (input, expected) => {
    expect(parseMigrationLedgerVerificationPhase(input)).toBe(expected);
  });

  it.each([undefined, '', 'managed', '--pre'])(
    'rejects unsupported phase %s',
    (input) => {
      expect(() => parseMigrationLedgerVerificationPhase(input)).toThrow(
        'Usage: verify-migration-ledger.ts <pre|post>',
      );
    },
  );
});
