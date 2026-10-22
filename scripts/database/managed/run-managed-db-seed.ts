import { isMain } from '../../lib/entry-point.mts';
import { parseSeedOptions, type SeedOptions } from '../../seed/seed-options';
import {
  classifyDatabaseTarget,
  requireExplicitDatabaseUrl,
} from '../database-target';
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
  const { runSeed } = await import('../../seed');
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
  // Every caller that passes the flag (CI, the hosted Checkout smoke, the
  // local E2E plan) seeds a loopback database, and this path takes no
  // DB_TARGET_ACK, so a remote target here is a mistake (BUG-353).
  const target = classifyDatabaseTarget(databaseUrl);
  if (options.includePlaceholders && target.kind !== 'LOCAL') {
    throw new Error(
      `The managed seed adds the placeholder fixtures only to a local database, and ${target.display} is remote.`,
    );
  }
  await runManagedDatabaseCommand({
    databaseUrl,
    log,
    execute: (targetUrl) => seed(targetUrl, options),
  });
}

/* v8 ignore start */
if (isMain(import.meta.url)) {
  runManagedDbSeed({ args: process.argv.slice(2) }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
