import { isMain } from '../lib/entry-point.mts';
import { runHumanDatabaseCommand } from './database-command';

export async function runDbSeed(): Promise<void> {
  await runHumanDatabaseCommand({
    execute: async (databaseUrl) => {
      const { runSeed } = await import('../seed');
      await runSeed(databaseUrl);
    },
  });
}

/* v8 ignore start */
if (isMain(import.meta.url)) {
  runDbSeed().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
