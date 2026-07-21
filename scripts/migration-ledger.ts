import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type postgres from 'postgres';
import migrationJournal from '@/db/migrations/meta/_journal.json';

export type MigrationJournalEntry = {
  idx: number;
  tag: string;
  when: number;
  hash?: string;
};

type MigrationLedgerCreatedAt = number | string | bigint | null | undefined;
type MigrationLedgerHash = string | null | undefined;
type MigrationLedgerRow = {
  createdAt: MigrationLedgerCreatedAt;
  hash: MigrationLedgerHash;
};
type MigrationJournalHashEntry = MigrationJournalEntry & { hash: string };
type KnownLegacyMigrationHashDrift = {
  tag: string;
  when: number;
  expectedHash: string;
  appliedHash: string;
  repairMigrationTag: string;
};
type MigrationContentDrift =
  | {
      kind: 'hash-mismatch';
      tag: string;
      expectedHashPrefix: string;
      appliedHashPrefix: string;
    }
  | {
      kind: 'ledger-only';
      createdAt: string;
    };

const SCHEMA_DRIFT_MIGRATIONS_CODE = 'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATIONS';
const SCHEMA_DRIFT_MIGRATIONS_FIX =
  'Run the checked-in migration command against the explicitly verified target, then repeat the exact ledger check.';
const SCHEMA_DRIFT_MIGRATION_CONTENT_CODE =
  'E2E_PREFLIGHT:SCHEMA_DRIFT_MIGRATION_CONTENT';
const SCHEMA_DRIFT_MIGRATION_CONTENT_FIX =
  'Do not amend applied migrations. Restore the migration file to the applied content or add a new forward repair migration; update the legacy allowlist only for a measured repaired drift.';
const HASH_PREFIX_LENGTH = 16;

const KNOWN_LEGACY_MIGRATION_HASH_DRIFTS: readonly KnownLegacyMigrationHashDrift[] =
  [
    {
      tag: '0027_early_wallow',
      when: 1783355955875,
      expectedHash:
        '983c3458e8aadd6acaddbce0b514321f0cec4f0a2767b3a74b6442e9f0d4d35d',
      appliedHash:
        '15124dc7eab8b5ab3e239d13ee1011ea515b96567771270658b47de84b9faf3c',
      repairMigrationTag: '0028_repair_attempts_selected_choice_index',
    },
  ] as const;

const MIGRATION_JOURNAL_ENTRIES: readonly MigrationJournalEntry[] =
  migrationJournal.entries.map(({ idx, tag, when }) => ({ idx, tag, when }));

export class MigrationLedgerVerificationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fix: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MigrationLedgerVerificationError';
  }
}

export function computeMissingMigrations(
  journalEntries: readonly MigrationJournalEntry[],
  appliedCreatedAt: readonly MigrationLedgerCreatedAt[],
): string[] {
  const appliedMigrationTimes = new Set(
    appliedCreatedAt
      .map((createdAt) => Number(createdAt))
      .filter((createdAt) => Number.isFinite(createdAt)),
  );

  return journalEntries
    .filter((entry) => !appliedMigrationTimes.has(entry.when))
    .map((entry) => entry.tag);
}

export function formatSchemaDriftMessage(
  missingMigrationTags: readonly string[],
): string {
  return `The migration ledger is behind the repo journal. Missing migrations: ${missingMigrationTags.join(', ')}.`;
}

function hashPrefix(hash: MigrationLedgerHash): string {
  return typeof hash === 'string' && hash.length > 0
    ? hash.slice(0, HASH_PREFIX_LENGTH)
    : 'missing';
}

export function formatMigrationContentDriftMessage(
  contentDrifts: readonly MigrationContentDrift[],
): string {
  const hashMismatches = contentDrifts
    .filter((drift) => drift.kind === 'hash-mismatch')
    .map(
      (drift) =>
        `${drift.tag} (expected ${drift.expectedHashPrefix}, applied ${drift.appliedHashPrefix})`,
    );
  const ledgerOnlyRows = contentDrifts
    .filter((drift) => drift.kind === 'ledger-only')
    .map((drift) => drift.createdAt);

  const parts = [];
  if (hashMismatches.length > 0) {
    parts.push(`Content drift: ${hashMismatches.join(', ')}.`);
  }
  if (ledgerOnlyRows.length > 0) {
    parts.push(`Ledger-only migrations: ${ledgerOnlyRows.join(', ')}.`);
  }

  return `The migration ledger has content drift. ${parts.join(' ')}`;
}

function createMigrationContentDriftError(
  contentDrifts: readonly MigrationContentDrift[],
): MigrationLedgerVerificationError {
  return new MigrationLedgerVerificationError(
    SCHEMA_DRIFT_MIGRATION_CONTENT_CODE,
    formatMigrationContentDriftMessage(contentDrifts),
    SCHEMA_DRIFT_MIGRATION_CONTENT_FIX,
  );
}

function createSchemaDriftMigrationsError(
  missingMigrationTags: readonly string[],
  options?: ErrorOptions,
): MigrationLedgerVerificationError {
  return new MigrationLedgerVerificationError(
    SCHEMA_DRIFT_MIGRATIONS_CODE,
    formatSchemaDriftMessage(missingMigrationTags),
    SCHEMA_DRIFT_MIGRATIONS_FIX,
    options,
  );
}

function isMissingMigrationLedgerError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === '3F000' || code === '42P01';
}

function readMigrationFileHash(entry: MigrationJournalEntry): string {
  if (typeof entry.hash === 'string') return entry.hash;

  const migrationPath = join(
    process.cwd(),
    'db',
    'migrations',
    `${entry.tag}.sql`,
  );
  const query = readFileSync(migrationPath, 'utf8');
  return createHash('sha256').update(query).digest('hex');
}

function withMigrationFileHashes(
  journalEntries: readonly MigrationJournalEntry[],
): MigrationJournalHashEntry[] {
  return journalEntries.map((entry) => ({
    ...entry,
    hash: readMigrationFileHash(entry),
  }));
}

function isAllowedLegacyMigrationHashDrift(
  journalEntry: MigrationJournalHashEntry,
  appliedHash: MigrationLedgerHash,
  allowlist: readonly KnownLegacyMigrationHashDrift[],
): boolean {
  if (typeof appliedHash !== 'string') return false;

  return allowlist.some(
    (allowed) =>
      allowed.tag === journalEntry.tag &&
      allowed.when === journalEntry.when &&
      allowed.expectedHash === journalEntry.hash &&
      allowed.appliedHash === appliedHash,
  );
}

export function computeMigrationContentDrift(
  journalEntries: readonly MigrationJournalHashEntry[],
  appliedMigrations: readonly MigrationLedgerRow[],
  allowlist: readonly KnownLegacyMigrationHashDrift[] = KNOWN_LEGACY_MIGRATION_HASH_DRIFTS,
): MigrationContentDrift[] {
  const journalByCreatedAt = new Map(
    journalEntries.map((entry) => [String(entry.when), entry]),
  );
  const contentDrifts: MigrationContentDrift[] = [];

  for (const migration of appliedMigrations) {
    const createdAt = String(migration.createdAt);
    const journalEntry = journalByCreatedAt.get(createdAt);

    if (!journalEntry) {
      contentDrifts.push({ kind: 'ledger-only', createdAt });
      continue;
    }

    if (journalEntry.hash === migration.hash) continue;
    if (
      isAllowedLegacyMigrationHashDrift(journalEntry, migration.hash, allowlist)
    ) {
      continue;
    }

    contentDrifts.push({
      kind: 'hash-mismatch',
      tag: journalEntry.tag,
      expectedHashPrefix: hashPrefix(journalEntry.hash),
      appliedHashPrefix: hashPrefix(migration.hash),
    });
  }

  return contentDrifts;
}

export async function verifyMigrationLedgerBeforeMigration(
  sql: postgres.Sql,
  journalEntries: readonly MigrationJournalEntry[] = MIGRATION_JOURNAL_ENTRIES,
): Promise<void> {
  const appliedMigrations = await readAppliedMigrations(
    sql,
    journalEntries,
    true,
  );
  verifyAppliedMigrationContent(journalEntries, appliedMigrations);
}

export async function verifyMigrationLedger(
  sql: postgres.Sql,
  journalEntries: readonly MigrationJournalEntry[] = MIGRATION_JOURNAL_ENTRIES,
): Promise<void> {
  const appliedMigrations = await readAppliedMigrations(
    sql,
    journalEntries,
    false,
  );
  const missingMigrationTags = computeMissingMigrations(
    journalEntries,
    appliedMigrations.map((migration) => migration.createdAt),
  );
  if (missingMigrationTags.length > 0) {
    throw createSchemaDriftMigrationsError(missingMigrationTags);
  }
  verifyAppliedMigrationContent(journalEntries, appliedMigrations);
}

async function readAppliedMigrations(
  sql: postgres.Sql,
  journalEntries: readonly MigrationJournalEntry[],
  allowMissingLedger: boolean,
): Promise<MigrationLedgerRow[]> {
  try {
    return await sql<MigrationLedgerRow[]>`
      SELECT created_at AS "createdAt", hash
      FROM drizzle.__drizzle_migrations
    `;
  } catch (error) {
    if (isMissingMigrationLedgerError(error)) {
      if (allowMissingLedger) return [];
      throw createSchemaDriftMigrationsError(
        journalEntries.map((entry) => entry.tag),
        { cause: error instanceof Error ? error : undefined },
      );
    }

    throw new MigrationLedgerVerificationError(
      SCHEMA_DRIFT_MIGRATIONS_CODE,
      'Unable to verify the Drizzle migration ledger.',
      SCHEMA_DRIFT_MIGRATIONS_FIX,
      { cause: error instanceof Error ? error : undefined },
    );
  }
}

function verifyAppliedMigrationContent(
  journalEntries: readonly MigrationJournalEntry[],
  appliedMigrations: readonly MigrationLedgerRow[],
): void {
  const contentDrifts = computeMigrationContentDrift(
    withMigrationFileHashes(journalEntries),
    appliedMigrations,
  );
  if (contentDrifts.length > 0) {
    throw createMigrationContentDriftError(contentDrifts);
  }
}
