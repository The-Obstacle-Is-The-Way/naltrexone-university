import { pathToFileURL } from 'node:url';
import { ensureLocalTestDatabase } from './local-test-db';

type RunEnsureLocalTestDatabaseInput = {
  ensureDatabase?: typeof ensureLocalTestDatabase;
  log?: (message: string) => void;
  error?: (message: string) => void;
};

export async function runEnsureLocalTestDatabase({
  ensureDatabase = ensureLocalTestDatabase,
  log = console.log,
  error = console.error,
}: RunEnsureLocalTestDatabaseInput = {}): Promise<number> {
  try {
    const result = await ensureDatabase();
    log(`[local-e2e] Local test database ${result}.`);
    return 0;
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : String(caught);
    error(message);
    return 1;
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runEnsureLocalTestDatabase()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exitCode = 1;
    });
}
/* v8 ignore stop */
