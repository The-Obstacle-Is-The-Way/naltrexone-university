import { isMain } from '../../lib/entry-point.mts';
import { runDatabaseProcess } from '../database-process';
import { requireExplicitDatabaseUrl } from '../database-target';
import {
  type MigrationLedgerVerificationPhase,
  runMigrationLedgerCommand,
} from '../verify-migration-ledger';
import { runManagedDatabaseCommand } from './database-command-managed';

export async function runManagedDbMigrate(): Promise<void> {
  const databaseUrl = requireExplicitDatabaseUrl(process.env);
  await runManagedDatabaseCommand({
    databaseUrl,
    execute: async (targetUrl) => {
      await checkLedger('pre', targetUrl);
      await runDatabaseProcess(['exec', 'drizzle-kit', 'migrate'], targetUrl);
      await checkLedger('post', targetUrl);
    },
  });
}

async function checkLedger(
  phase: MigrationLedgerVerificationPhase,
  databaseUrl: string,
): Promise<void> {
  // Reuse the typed/sanitized ledger diagnostics on every managed caller.
  const code = await runMigrationLedgerCommand({
    args: [phase],
    env: { DATABASE_URL: databaseUrl },
  });
  if (code !== 0)
    throw new Error(`Managed migration stopped at ledger ${phase}check.`);
}

/* v8 ignore start */
if (isMain(import.meta.url)) {
  runManagedDbMigrate().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
