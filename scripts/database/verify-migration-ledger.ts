import postgres from 'postgres';
import { stripPnpmSeparator } from '../lib/command-args';
import { isMain } from '../lib/entry-point.mts';
import {
  DatabaseTargetInputError,
  requireExplicitDatabaseUrl,
} from './database-target';
import { authorizeManagedDatabaseTargets } from './managed/database-target-managed';
import {
  createPostgresMigrationLedgerQuery,
  MigrationLedgerVerificationError,
  verifyMigrationLedger,
  verifyMigrationLedgerBeforeMigration,
} from './migration-ledger';

export type MigrationLedgerVerificationPhase = 'pre' | 'post';

class LedgerUsageError extends Error {}
const LEDGER_USAGE = 'Usage: verify-migration-ledger.ts <pre|post>';

export function parseMigrationLedgerVerificationPhase(
  value: string | undefined,
): MigrationLedgerVerificationPhase {
  if (value === 'pre' || value === 'post') return value;
  throw new LedgerUsageError(LEDGER_USAGE);
}

export async function runMigrationLedgerVerification(
  phase: MigrationLedgerVerificationPhase,
  databaseUrl: string,
): Promise<void> {
  authorizeManagedDatabaseTargets([databaseUrl]);
  const sql = postgres(databaseUrl, { max: 1 });
  const query = createPostgresMigrationLedgerQuery(sql);

  try {
    if (phase === 'pre') {
      await verifyMigrationLedgerBeforeMigration(query);
      return;
    }

    await verifyMigrationLedger(query);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

type LedgerCommand = {
  args: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  output?: Pick<Console, 'log' | 'error'>;
  verify?: typeof runMigrationLedgerVerification;
};

export async function runMigrationLedgerCommand({
  args,
  env,
  output = console,
  verify = runMigrationLedgerVerification,
}: LedgerCommand): Promise<number> {
  let phase: MigrationLedgerVerificationPhase;
  let databaseUrl: string;
  try {
    const normalized = stripPnpmSeparator(args);
    if (normalized.length !== 1) throw new LedgerUsageError(LEDGER_USAGE);
    phase = parseMigrationLedgerVerificationPhase(normalized[0]);
    databaseUrl = requireExplicitDatabaseUrl(env);
    authorizeManagedDatabaseTargets([databaseUrl]);
  } catch (error) {
    output.error(
      error instanceof LedgerUsageError ||
        error instanceof DatabaseTargetInputError
        ? error.message
        : 'Migration ledger verification failed.',
    );
    return 1;
  }

  try {
    await verify(phase, databaseUrl);
    output.log(
      phase === 'pre'
        ? '[migration-ledger:pre] Applied migrations match accepted hashes; pending journal entries are allowed.'
        : '[migration-ledger:post] Every journal entry is applied and matches an accepted hash.',
    );
    return 0;
  } catch (error) {
    output.error(
      error instanceof MigrationLedgerVerificationError
        ? `[${error.code}] ${error.message}\nFix: ${error.fix}`
        : 'Migration ledger verification failed.',
    );
    return 1;
  }
}

if (isMain(import.meta.url)) {
  void runMigrationLedgerCommand({
    args: process.argv.slice(2),
    env: process.env,
  }).then((code) => {
    process.exitCode = code;
  });
}
