import { pathToFileURL } from 'node:url';
import { runHumanDatabaseCommand } from './database-command';

export async function runDbSeed(): Promise<void> {
  await runHumanDatabaseCommand({
    execute: async (databaseUrl) => {
      const { runSeed } = await import('./seed');
      await runSeed(databaseUrl);
    },
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runDbSeed().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
