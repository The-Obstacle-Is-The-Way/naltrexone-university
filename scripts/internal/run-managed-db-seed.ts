import { pathToFileURL } from 'node:url';
import { requireExplicitDatabaseUrl } from '../database-target';
import { parseSeedOptions, type SeedOptions } from '../seed/seed-options';
import { runManagedDatabaseCommand } from './database-command-managed';

type ManagedDbSeedInput = {
  args?: readonly string[];
  env?: Readonly<Record<string, string | undefined>>;
  log?: (message: string) => void;
  seed?: (databaseUrl: string, options: SeedOptions) => Promise<void>;
};

async function seedDatabase(
  databaseUrl: string,
  options: SeedOptions,
): Promise<void> {
  const { runSeed } = await import('../seed');
  await runSeed(databaseUrl, options);
}

export async function runManagedDbSeed({
  args = [],
  env = process.env,
  log = console.info,
  seed = seedDatabase,
}: ManagedDbSeedInput = {}): Promise<void> {
  const options = parseSeedOptions(args, env);
  const databaseUrl = requireExplicitDatabaseUrl(env);
  await runManagedDatabaseCommand({
    databaseUrl,
    log,
    execute: (targetUrl) => seed(targetUrl, options),
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runManagedDbSeed({ args: process.argv.slice(2) }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
