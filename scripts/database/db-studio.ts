import { isMain } from '../lib/entry-point.mts';
import { runHumanDatabaseCommand } from './database-command';
import { runDatabaseProcess } from './database-process';

export async function runDbStudio(): Promise<void> {
  await runHumanDatabaseCommand({
    execute: (databaseUrl) =>
      runDatabaseProcess(['exec', 'drizzle-kit', 'studio'], databaseUrl),
  });
}

/* v8 ignore start */
if (isMain(import.meta.url)) {
  runDbStudio().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
