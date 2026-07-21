import { pathToFileURL } from 'node:url';
import { runDatabaseProcess } from '../database-process';
import { requireExplicitDatabaseUrl } from '../database-target';
import { runManagedDatabaseCommand } from './database-command-managed';

export async function runManagedDbMigrate(): Promise<void> {
  const databaseUrl = requireExplicitDatabaseUrl(process.env);
  await runManagedDatabaseCommand({
    databaseUrl,
    execute: (targetUrl) =>
      runDatabaseProcess(['exec', 'drizzle-kit', 'migrate'], targetUrl),
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runManagedDbMigrate().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
