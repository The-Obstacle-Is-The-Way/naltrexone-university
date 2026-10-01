import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { runHumanDatabaseCommand } from '../database-command';
import {
  formatActivation,
  previewOrApply,
  withCommandDatabase,
} from './command-support';
import { activateRelease } from './release-activation';

type CommandIo = {
  env?: Readonly<Record<string, string | undefined>>;
  log?: (message: string) => void;
};

const releaseIdSchema = z.guid();

function releaseIdArg(value: string | undefined, message: string): string {
  const parsed = releaseIdSchema.safeParse(value);
  if (!parsed.success) throw new Error(message);
  return parsed.data;
}

export function parseActivateArgs(argv: readonly string[]): {
  releaseId: string;
  expectedActiveReleaseId: string | null;
  apply: boolean;
} {
  let releaseId: string | undefined;
  let expectedActiveReleaseId: string | null | undefined;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === '--apply' && !apply) {
      apply = true;
    } else if (arg === '--release' && releaseId === undefined) {
      releaseId = releaseIdArg(value, '--release needs a release id');
      index += 1;
    } else if (
      arg === '--expect-active' &&
      expectedActiveReleaseId === undefined
    ) {
      expectedActiveReleaseId =
        value === 'none'
          ? null
          : releaseIdArg(value, '--expect-active needs a release id, or none');
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (releaseId === undefined) {
    throw new Error('--release is required: the release to activate');
  }
  if (expectedActiveReleaseId === undefined) {
    throw new Error(
      '--expect-active is required: the release you expect to be active, or none',
    );
  }
  return { releaseId, expectedActiveReleaseId, apply };
}

// DEBT-483: activates a staged release, or rolls back by activating an
// earlier one. The release you name as active must be active, or nothing
// changes. A dry run unless --apply.
export async function runActivateRelease(
  argv: readonly string[] = process.argv.slice(2),
  { env = process.env, log = console.info }: CommandIo = {},
): Promise<void> {
  const { apply, ...input } = parseActivateArgs(argv);
  await runHumanDatabaseCommand({
    env,
    log,
    execute: (databaseUrl) =>
      withCommandDatabase(databaseUrl, async (db) => {
        const summary = await previewOrApply(db, apply, (target) =>
          activateRelease(target, input),
        );
        log(
          `Release activation${apply ? '' : ' (dry-run)'}: ${formatActivation(summary)}`,
        );
      }),
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runActivateRelease().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
