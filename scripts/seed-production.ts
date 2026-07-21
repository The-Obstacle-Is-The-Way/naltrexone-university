import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSeedEnvironmentRuntime } from './seed-environment-runtime';
import { runProductionSeed } from './seed-environment-targets';

function parsePlanOnly(args: readonly string[]): boolean {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === '--plan') return true;
  throw new Error('Usage: pnpm db:seed:prod [-- --plan]');
}

async function main(): Promise<void> {
  const planOnly = parsePlanOnly(process.argv.slice(2));
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
