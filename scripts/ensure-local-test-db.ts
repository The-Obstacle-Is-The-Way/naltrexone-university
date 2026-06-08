import { ensureLocalTestDatabase } from './local-test-db';

ensureLocalTestDatabase()
  .then((result) => {
    console.log(`[local-e2e] Local test database ${result}.`);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
