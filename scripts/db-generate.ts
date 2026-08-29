import { pathToFileURL } from 'node:url';
import { runHumanDatabaseCommand } from './database-command';
import { runDatabaseProcess } from './database-process';

type DbGenerateInput = {
  env?: Readonly<Record<string, string | undefined>>;
  log?: (message: string) => void;
  runProcess?: typeof runDatabaseProcess;
};

export async function runDbGenerate({
  env = process.env,
  log = console.info,
  runProcess = runDatabaseProcess,
}: DbGenerateInput = {}): Promise<void> {
  await runHumanDatabaseCommand({
    env,
    log,
    execute: (databaseUrl) =>
      runProcess(['exec', 'drizzle-kit', 'generate'], databaseUrl),
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runDbGenerate().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
