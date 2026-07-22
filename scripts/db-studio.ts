import { pathToFileURL } from 'node:url';
import { runHumanDatabaseCommand } from './database-command';
import { runDatabaseProcess } from './database-process';

export async function runDbStudio(): Promise<void> {
  await runHumanDatabaseCommand({
    execute: (databaseUrl) =>
      runDatabaseProcess(['exec', 'drizzle-kit', 'studio'], databaseUrl),
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runDbStudio().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
