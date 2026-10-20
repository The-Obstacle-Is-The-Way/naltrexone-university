import { spawnSync } from 'node:child_process';
import { stripPnpmSeparator } from '../lib/command-args';
import { isMain } from '../lib/entry-point.mts';

// Drizzle generation is offline. Keep only pnpm's separator normalization;
// the connected-command target guard belongs to migrate, studio and seed.
export function runDbGenerate(args: readonly string[] = []): number {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'drizzle-kit',
      'generate',
      '--config=drizzle.generate.config.ts',
      ...stripPnpmSeparator(args),
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = runDbGenerate(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
