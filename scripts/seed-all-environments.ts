import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseSeedPlanOnly } from './seed/seed-options';
import { createSeedEnvironmentRuntime } from './seed-environment-runtime';
import { runNonProductionSeed } from './seed-environment-targets';

async function main(): Promise<void> {
  const planOnly = parseSeedPlanOnly(
    process.argv.slice(2),
    'Usage: pnpm db:seed:all [--plan]',
  );
  const tempDirectory = await mkdtemp(
    path.join(tmpdir(), 'seed-all-environments-'),
  );
  const runtime = createSeedEnvironmentRuntime(tempDirectory);

  try {
    await runNonProductionSeed({
      acknowledgement: process.env.DB_TARGET_ACK,
      dependencies: runtime.dependencies,
      planOnly,
    });
  } finally {
    await runtime.cleanup();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
