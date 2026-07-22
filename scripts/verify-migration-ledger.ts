import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { requireExplicitDatabaseUrl } from './database-target';
import { authorizeManagedDatabaseTargets } from './internal/database-target-managed';
import {
  createPostgresMigrationLedgerQuery,
  MigrationLedgerVerificationError,
  verifyMigrationLedger,
  verifyMigrationLedgerBeforeMigration,
} from './migration-ledger';

export type MigrationLedgerVerificationPhase = 'pre' | 'post';

export function parseMigrationLedgerVerificationPhase(
  value: string | undefined,
): MigrationLedgerVerificationPhase {
  if (value === 'pre' || value === 'post') return value;
  throw new Error('Usage: verify-migration-ledger.ts <pre|post>');
}

export async function runMigrationLedgerVerification(
  phase: MigrationLedgerVerificationPhase,
): Promise<void> {
  const databaseUrl = requireExplicitDatabaseUrl(process.env);
  authorizeManagedDatabaseTargets([databaseUrl]);
  const sql = postgres(databaseUrl, { max: 1 });
  const query = createPostgresMigrationLedgerQuery(sql);

  try {
    if (phase === 'pre') {
      await verifyMigrationLedgerBeforeMigration(query);
      console.info(
        '[migration-ledger:pre] Applied migration content matches the checkout; pending journal entries are allowed.',
      );
      return;
    }

    await verifyMigrationLedger(query);
    console.info(
      '[migration-ledger:post] Ledger and migration content exactly match the checkout.',
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
async function main(): Promise<void> {
  try {
    const phase = parseMigrationLedgerVerificationPhase(process.argv[2]);
    await runMigrationLedgerVerification(phase);
  } catch (error) {
    if (error instanceof MigrationLedgerVerificationError) {
      console.error(`[${error.code}] ${error.message}\nFix: ${error.fix}`);
    } else {
      console.error('Migration ledger verification failed.');
    }
    process.exitCode = 1;
  }
}

if (import.meta.url === executedPath) {
  void main();
}
/* v8 ignore stop */
