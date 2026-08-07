import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  computeMigrationContentDrift,
  computeMissingMigrations,
  formatSchemaDriftMessage,
  type MigrationLedgerQuery,
  type MigrationLedgerRow,
  verifyMigrationLedger,
  verifyMigrationLedgerBeforeMigration,
} from '@/scripts/migration-ledger';

function createMigrationLedgerSql(
  query: () => Promise<MigrationLedgerRow[]>,
): MigrationLedgerQuery {
  return { readAppliedMigrations: vi.fn(query) };
}

describe('migration ledger schema-drift preflight', () => {
  const hashA =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const hashB =
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const hashC =
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

  const journalEntries = [
    {
      idx: 0,
      tag: '0000_jazzy_vermin',
      when: 1769893923091,
      hash: hashA,
    },
    {
      idx: 1,
      tag: '0001_attempts_selected_choice_not_null',
      when: 1769942859252,
      hash: hashB,
    },
    {
      idx: 2,
      tag: '0002_curious_firelord',
      when: 1770067162278,
      hash: hashC,
    },
  ] as const;

  it('passes through silently when every journal migration exists in the ledger', async () => {
    expect(
      computeMissingMigrations(journalEntries, [
        1769893923091,
        '1769942859252',
        1770067162278n,
      ]),
    ).toEqual([]);

    const sql = createMigrationLedgerSql(async () => [
      { createdAt: 1769893923091, hash: hashA },
      { createdAt: '1769942859252', hash: hashB },
      { createdAt: 1770067162278n, hash: hashC },
    ]);

    await expect(
      verifyMigrationLedger(sql, journalEntries),
    ).resolves.toBeUndefined();
  });

  it('allows expected pending journal entries before migration', async () => {
    const sql = createMigrationLedgerSql(async () => [
      { createdAt: 1769893923091, hash: hashA },
    ]);

    await expect(
      verifyMigrationLedgerBeforeMigration(sql, journalEntries),
    ).resolves.toBeUndefined();
  });

  it('rejects ledger-only rows before migration', async () => {
    const sql = createMigrationLedgerSql(async () => [
      { createdAt: 1769893923091, hash: hashA },
      {
        createdAt: 1999999999999,
        hash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      },
    ]);

    await expect(
      verifyMigrationLedgerBeforeMigration(sql, journalEntries),
    ).rejects.toMatchObject({
      code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATION_CONTENT',
      message: expect.stringContaining('Ledger-only migrations detected: 1'),
    });
  });

  it('rejects applied-row content drift before migration', async () => {
    const sql = createMigrationLedgerSql(async () => [
      {
        createdAt: 1769893923091,
        hash: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      },
    ]);

    await expect(
      verifyMigrationLedgerBeforeMigration(sql, journalEntries),
    ).rejects.toMatchObject({
      code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATION_CONTENT',
      message: expect.stringContaining('Content drift: 0000_jazzy_vermin'),
    });
  });

  it('throws the content-drift code when a ledger row hash differs from the local migration file hash', async () => {
    const sql = createMigrationLedgerSql(async () => [
      { createdAt: 1769893923091, hash: hashA },
      {
        createdAt: '1769942859252',
        hash: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      },
      { createdAt: 1770067162278n, hash: hashC },
    ]);

    await expect(
      verifyMigrationLedger(sql, journalEntries),
    ).rejects.toMatchObject({
      code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATION_CONTENT',
      message: expect.stringContaining(
        'Content drift: 0001_attempts_selected_choice_not_null',
      ),
      fix: expect.stringContaining('Do not amend applied migrations'),
    });
  });

  it('throws the content-drift code when the ledger contains a migration unknown to the local journal', async () => {
    const sql = createMigrationLedgerSql(async () => [
      { createdAt: 1769893923091, hash: hashA },
      { createdAt: '1769942859252', hash: hashB },
      { createdAt: 1770067162278n, hash: hashC },
      {
        createdAt: 1999999999999,
        hash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      },
    ]);

    await expect(
      verifyMigrationLedger(sql, journalEntries),
    ).rejects.toMatchObject({
      code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATION_CONTENT',
      message: expect.stringContaining('Ledger-only migrations detected: 1'),
    });
  });

  it('allows the measured legacy 0027 dev hash repaired by 0028', async () => {
    const measuredEarly0027Hash =
      '15124dc7eab8b5ab3e239d13ee1011ea515b96567771270658b47de84b9faf3c';
    const current0027Hash =
      '983c3458e8aadd6acaddbce0b514321f0cec4f0a2767b3a74b6442e9f0d4d35d';
    const sql = createMigrationLedgerSql(async () => [
      {
        createdAt: 1783355955875,
        hash: measuredEarly0027Hash,
      },
    ]);

    await expect(
      verifyMigrationLedger(sql, [
        {
          idx: 27,
          tag: '0027_early_wallow',
          when: 1783355955875,
          hash: current0027Hash,
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('allows the measured Preview 0033 hash repaired by generated 0034', async () => {
    const appliedUnsafe0033Hash =
      'd3cefbfc623b5a0c8b9b8a58555daab98ac8dde8007aa7bffb1ff6f4dddc8608';
    const currentBackfilled0033Hash =
      'd465645a2e64ad9dbae398d8256ed02c73ec60bd4439a66480c47210b4478d2c';
    const sql = createMigrationLedgerSql(async () => [
      {
        createdAt: 1786051636812,
        hash: appliedUnsafe0033Hash,
      },
    ]);

    await expect(
      verifyMigrationLedgerBeforeMigration(sql, [
        {
          idx: 33,
          tag: '0033_small_wrecker',
          when: 1786051636812,
          hash: currentBackfilled0033Hash,
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('reads local migration file hashes when journal entries do not inject fixture hashes', async () => {
    const migrationTag = '0000_jazzy_vermin';
    const migrationHash = createHash('sha256')
      .update(readFileSync(`db/migrations/${migrationTag}.sql`, 'utf8'))
      .digest('hex');
    const sql = createMigrationLedgerSql(async () => [
      { createdAt: 1769893923091, hash: migrationHash },
    ]);

    await expect(
      verifyMigrationLedger(sql, [
        {
          idx: 0,
          tag: migrationTag,
          when: 1769893923091,
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('formats content-drift failures without leaking secrets, hostnames, or full hashes', async () => {
    const appliedHash =
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
    const databaseUrl =
      'postgresql://e2e_owner:super-secret-password@ep-private-host.neon.tech/addiction_boards';
    const sql = createMigrationLedgerSql(async () => [
      { createdAt: 1769893923091, hash: appliedHash },
      { createdAt: '1769942859252', hash: hashB },
      { createdAt: 1770067162278n, hash: hashC },
    ]);

    try {
      await verifyMigrationLedger(sql, journalEntries);
      throw new Error('Expected verifyMigrationLedger to reject');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATION_CONTENT',
      });
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('expected aaaaaaaaaaaaaaaa');
      expect(message).toContain('applied dddddddddddddddd');
      expect(message).not.toContain(databaseUrl);
      expect(message).not.toContain('ep-private-host.neon.tech');
      expect(message).not.toContain('super-secret-password');
      expect(message).not.toContain(hashA);
      expect(message).not.toContain(appliedHash);
    }
  });

  it('computes content drift from local hashes and applied ledger rows', () => {
    expect(
      computeMigrationContentDrift(journalEntries, [
        { createdAt: 1769893923091, hash: hashA },
        {
          createdAt: 1769942859252,
          hash: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        },
        { createdAt: 1770067162278, hash: hashC },
        {
          createdAt: 1999999999999,
          hash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        },
      ]),
    ).toEqual([
      {
        kind: 'hash-mismatch',
        tag: '0001_attempts_selected_choice_not_null',
        expectedHashPrefix: 'bbbbbbbbbbbbbbbb',
        appliedHashPrefix: 'dddddddddddddddd',
      },
      {
        kind: 'ledger-only',
        createdAt: '1999999999999',
      },
    ]);
  });

  it('reports a missing applied ledger hash as content drift', () => {
    expect(
      computeMigrationContentDrift(
        [
          {
            idx: 0,
            tag: '0000_jazzy_vermin',
            when: 1769893923091,
            hash: hashA,
          },
        ],
        [{ createdAt: 1769893923091, hash: null }],
      ),
    ).toEqual([
      {
        kind: 'hash-mismatch',
        tag: '0000_jazzy_vermin',
        expectedHashPrefix: 'aaaaaaaaaaaaaaaa',
        appliedHashPrefix: 'missing',
      },
    ]);
  });

  it('throws the schema-drift code when one or more journal migrations are absent from the ledger', async () => {
    expect(computeMissingMigrations(journalEntries, [1769893923091])).toEqual([
      '0001_attempts_selected_choice_not_null',
      '0002_curious_firelord',
    ]);

    const sql = createMigrationLedgerSql(async () => [
      { createdAt: 1769893923091, hash: hashA },
    ]);

    await expect(
      verifyMigrationLedger(sql, journalEntries),
    ).rejects.toMatchObject({
      code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATIONS',
      message:
        'The migration ledger is behind the repo journal. Missing migrations: 0001_attempts_selected_choice_not_null, 0002_curious_firelord.',
      fix: expect.stringContaining('checked-in migration command'),
    });
  });

  it('treats an absent drizzle schema as schema drift with all journal migrations missing', async () => {
    const missingSchemaError = Object.assign(
      new Error('schema "drizzle" does not exist'),
      { code: '3F000' },
    );
    const sql = createMigrationLedgerSql(async () => {
      throw missingSchemaError;
    });

    await expect(
      verifyMigrationLedger(sql, journalEntries),
    ).rejects.toMatchObject({
      code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATIONS',
      message:
        'The migration ledger is behind the repo journal. Missing migrations: 0000_jazzy_vermin, 0001_attempts_selected_choice_not_null, 0002_curious_firelord.',
    });
  });

  it('treats an absent drizzle migration table as schema drift with all journal migrations missing', async () => {
    const missingTableError = Object.assign(
      new Error('relation "drizzle.__drizzle_migrations" does not exist'),
      { code: '42P01' },
    );
    const sql = createMigrationLedgerSql(async () => {
      throw missingTableError;
    });

    await expect(
      verifyMigrationLedger(sql, journalEntries),
    ).rejects.toMatchObject({
      code: 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATIONS',
      message:
        'The migration ledger is behind the repo journal. Missing migrations: 0000_jazzy_vermin, 0001_attempts_selected_choice_not_null, 0002_curious_firelord.',
    });
  });

  it('formats missing migration messages without leaking secrets, hostnames, passwords, or Drizzle hashes', () => {
    const databaseUrl =
      'postgresql://e2e_owner:super-secret-password@ep-private-host.neon.tech/addiction_boards';
    const drizzleHash =
      'bd3f2c7ad0212ddc9fbb7c2c07bdc4c7b4f9cce34638f93af18c0218cdd7e4e5';
    const message = formatSchemaDriftMessage([
      '0019_illegal_warbound',
      '0020_fat_ironclad',
    ]);

    expect(message).toContain(
      'Missing migrations: 0019_illegal_warbound, 0020_fat_ironclad.',
    );
    expect(message).not.toContain(databaseUrl);
    expect(message).not.toContain('ep-private-host.neon.tech');
    expect(message).not.toContain('super-secret-password');
    expect(message).not.toContain(drizzleHash);
  });
});
