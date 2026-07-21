import { pathToFileURL } from 'node:url';
import { requireExplicitDatabaseUrl } from '../database-target';
import { runManagedDatabaseCommand } from './database-command-managed';

export async function runManagedDbSeed(): Promise<void> {
  const databaseUrl = requireExplicitDatabaseUrl(process.env);
  await runManagedDatabaseCommand({
    databaseUrl,
    execute: async (targetUrl) => {
      const { runSeed } = await import('../seed');
      await runSeed(targetUrl);
    },
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runManagedDbSeed().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
