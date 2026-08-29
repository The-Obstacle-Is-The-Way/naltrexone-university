import { pathToFileURL } from 'node:url';
import { runHumanDatabaseCommand } from './database-command';
import { runDatabaseProcess } from './database-process';

type DbGenerateInput = {
  args?: readonly string[];
  env?: Readonly<Record<string, string | undefined>>;
  log?: (message: string) => void;
  runProcess?: typeof runDatabaseProcess;
};

export async function runDbGenerate({
  args = [],
  env = process.env,
  log = console.info,
  runProcess = runDatabaseProcess,
}: DbGenerateInput = {}): Promise<void> {
  await runHumanDatabaseCommand({
    env,
    log,
    execute: (databaseUrl) =>
      runProcess(['exec', 'drizzle-kit', 'generate', ...args], databaseUrl),
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runDbGenerate({ args: process.argv.slice(2) }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
