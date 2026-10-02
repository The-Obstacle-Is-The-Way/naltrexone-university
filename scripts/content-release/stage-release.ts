import { pathToFileURL } from 'node:url';
import { runHumanDatabaseCommand } from '../database-command';
import {
  readSeedQuestionFiles,
  type SeedSourceFile,
} from '../seed/file-reader';
import { readQidValue } from '../seed/qid-command-args';
import { previewOrApply, withCommandDatabase } from './command-support';
import { stageReleaseFromFiles } from './release-builder';

type StageIo = {
  env?: Readonly<Record<string, string | undefined>>;
  log?: (message: string) => void;
  /** The MDX bundle; by default every authored file, placeholders excluded. */
  readFiles?: () => Promise<SeedSourceFile[]>;
};

// --apply, and --remove <qid> for each live question whose file is absent on
// purpose (DEBT-489). Each flag value is checked like a QID.
export function parseStageArgs(argv: readonly string[]): {
  apply: boolean;
  remove: string[];
} {
  let apply = false;
  const remove: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply' && !apply) {
      apply = true;
    } else if (arg === '--remove') {
      remove.push(readQidValue(argv[index + 1], '--remove', remove));
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { apply, remove };
}

// DEBT-483: stages a release of the MDX bundle on the active release, writing
// nothing a learner reads, and names the activation that makes it live. A
// dry run unless --apply.
export async function runStageRelease(
  argv: readonly string[] = process.argv.slice(2),
  {
    env = process.env,
    log = console.info,
    readFiles = () => readSeedQuestionFiles(false),
  }: StageIo = {},
): Promise<void> {
  const { apply, remove } = parseStageArgs(argv);
  await runHumanDatabaseCommand({
    env,
    log,
    execute: async (databaseUrl) => {
      const files = await readFiles();
      await withCommandDatabase(databaseUrl, async (db) => {
        const staged = await previewOrApply(db, apply, (target) =>
          stageReleaseFromFiles(target, files, { remove }),
        );
        log(
          [
            `Release staging${apply ? '' : ' (dry-run)'}: release=${staged.releaseId}`,
            `parent=${staged.parentReleaseId}`,
            `reusedRelease=${staged.reusedRelease}`,
            `items=${staged.items}`,
            `inserted=${staged.inserted}`,
            `appended=${staged.appended}`,
            `reused=${staged.reused}`,
            `removals=${staged.removals}`,
            `withdrawals=${staged.withdrawals}`,
          ].join(' '),
        );
        if (apply) {
          log(
            `Preview, then activate: pnpm exec tsx scripts/content-release/activate-release.ts --release ${staged.releaseId} --expect-active ${staged.parentReleaseId}`,
          );
        }
      });
    },
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runStageRelease().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
