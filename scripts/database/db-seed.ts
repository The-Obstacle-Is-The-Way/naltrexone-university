import { isMain } from '../lib/entry-point.mts';
import { parseSeedOptions, type SeedOptions } from '../seed/seed-options';
import { runHumanDatabaseCommand } from './database-command';
import {
  classifyDatabaseTarget,
  requireExplicitDatabaseUrl,
} from './database-target';

type DbSeedInput = {
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

export async function runDbSeed({
  args = [],
  env = process.env,
  log = console.info,
  seed = seedDatabase,
}: DbSeedInput = {}): Promise<void> {
  const options = parseSeedOptions(args, env);
  // The fixtures are test data, and DB_TARGET_ACK proves which host was meant,
  // not that it is not production, so no acknowledgment admits them to a
  // remote target (BUG-353). This refusal comes first because the
  // acknowledgment's refusal prints the code that would admit the target.
  if (options.includePlaceholders) {
    const target = classifyDatabaseTarget(requireExplicitDatabaseUrl(env));
    if (target.kind !== 'LOCAL') {
      throw new Error(
        `db:seed adds the placeholder fixtures only to a local database, and ${target.display} is remote.`,
      );
    }
  }
  await runHumanDatabaseCommand({
    env,
    log,
    execute: (databaseUrl) => seed(databaseUrl, options),
  });
}

/* v8 ignore start */
if (isMain(import.meta.url)) {
  runDbSeed({ args: process.argv.slice(2) }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
