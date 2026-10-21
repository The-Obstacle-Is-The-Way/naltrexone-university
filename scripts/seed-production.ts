import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseSeedPlanOnly } from './seed/seed-options';
import { createSeedEnvironmentRuntime } from './seed-environment-runtime';
import { runProductionSeed } from './seed-environment-targets';

async function main(): Promise<void> {
  const planOnly = parseSeedPlanOnly(
    process.argv.slice(2),
    'Usage: pnpm db:seed:prod [--plan]',
  );
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'seed-production-'));
  const runtime = createSeedEnvironmentRuntime(tempDirectory);

  try {
    await runProductionSeed({
      acknowledgement: process.env.DB_TARGET_ACK,
      dependencies: runtime.dependencies,
      env: process.env,
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
