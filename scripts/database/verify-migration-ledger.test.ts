import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { MigrationLedgerVerificationError } from './migration-ledger';
import {
  parseMigrationLedgerVerificationPhase,
  runMigrationLedgerCommand,
} from './verify-migration-ledger';

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

function outputBuffer() {
  const errors: string[] = [];
  const lines: string[] = [];
  return {
    errors,
    lines,
    error: (message: string) => {
      errors.push(message);
    },
    log: (message: string) => {
      lines.push(message);
    },
  };
}

describe('ledger command diagnostics before connection', () => {
  it.each([
    [[], undefined, /Usage:/],
    [['bad-phase'], undefined, /Usage:/],
    [['pre', 'extra'], undefined, /Usage:/],
    [['pre'], undefined, /explicit DATABASE_URL is required/],
    [['--', 'pre'], undefined, /Usage:/],
    [
      ['post'],
      'https://synthetic-user:synthetic-password@invalid.example/db',
      /DATABASE_URL is invalid/,
    ],
  ] as const)(
    'rejects invalid inputs with an actionable message: %j',
    (args, url, expected) => {
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          'scripts/database/verify-migration-ledger.ts',
          ...args,
        ],
        {
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            NODE_ENV: 'test',
            ...(url ? { DATABASE_URL: url } : {}),
          },
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(expected);
      expect(result.stderr).not.toContain('synthetic-password');
    },
  );

  it('preserves a typed ledger diagnostic and remedy', async () => {
    const output = outputBuffer();
    const code = await runMigrationLedgerCommand({
      args: ['post'],
      env: { DATABASE_URL: 'postgres://test:test@localhost:1/ledger_test' },
      output,
      // Shape-only failure translation; no query or adapter behavior is modeled.
      verify: async () => {
        throw new MigrationLedgerVerificationError(
          'E2E_PREFLIGHT:LEDGER_DRIFT',
          'Ledger mismatch.',
          'Inspect the ledger.',
        );
      },
    });
    expect(code).toBe(1);
    expect(output.errors).toEqual([
      '[E2E_PREFLIGHT:LEDGER_DRIFT] Ledger mismatch.\nFix: Inspect the ledger.',
    ]);
  });

  it('sanitizes an unexpected verification failure', async () => {
    const output = outputBuffer();
    const code = await runMigrationLedgerCommand({
      args: ['pre'],
      env: { DATABASE_URL: 'postgres://test:test@localhost:1/ledger_test' },
      output,
      verify: async () => {
        throw new Error('driver includes synthetic-password');
      },
    });
    expect(code).toBe(1);
    expect(output.errors).toEqual(['Migration ledger verification failed.']);
    expect(output.lines).toEqual([]);
  });
});
