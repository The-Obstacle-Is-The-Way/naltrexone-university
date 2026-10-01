import { pathToFileURL } from 'node:url';
import { runHumanDatabaseCommand } from '../database-command';
import {
  formatActivation,
  previewOrApply,
  withCommandDatabase,
} from './command-support';
import { bootstrapRelease } from './release-activation';

type CommandIo = {
  env?: Readonly<Record<string, string | undefined>>;
  log?: (message: string) => void;
};

export function parseBootstrapArgs(argv: readonly string[]): {
  apply: boolean;
} {
  let apply = false;
  for (const arg of argv) {
    if (arg === '--apply' && !apply) {
      apply = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { apply };
}

// DEBT-483: the first activation adopts what is live as a release with no
// parent. Afterwards the direct seed refuses this database, and content
// changes only through releases. A dry run unless --apply.
export async function runBootstrapRelease(
  argv: readonly string[] = process.argv.slice(2),
  { env = process.env, log = console.info }: CommandIo = {},
): Promise<void> {
  const { apply } = parseBootstrapArgs(argv);
  await runHumanDatabaseCommand({
    env,
    log,
    execute: (databaseUrl) =>
      withCommandDatabase(databaseUrl, async (db) => {
        const summary = await previewOrApply(db, apply, bootstrapRelease);
        log(
          `Release bootstrap${apply ? '' : ' (dry-run)'}: ${formatActivation(summary)}`,
        );
      }),
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runBootstrapRelease().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
