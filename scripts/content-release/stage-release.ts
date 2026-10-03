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

// --apply, --remove <qid> for each live question whose file is absent on
// purpose (DEBT-489), and --revert <qid> for each question the bundle moves
// back to an earlier revision on purpose (DEBT-492). Each flag value is
// checked like a QID.
export function parseStageArgs(argv: readonly string[]): {
  apply: boolean;
  remove: string[];
  revert: string[];
} {
  let apply = false;
  const remove: string[] = [];
  const revert: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply' && !apply) {
      apply = true;
    } else if (arg === '--remove') {
      remove.push(readQidValue(argv[index + 1], '--remove', remove));
      index += 1;
    } else if (arg === '--revert') {
      revert.push(readQidValue(argv[index + 1], '--revert', revert));
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { apply, remove, revert };
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
  const { apply, remove, revert } = parseStageArgs(argv);
  await runHumanDatabaseCommand({
    env,
    log,
    execute: async (databaseUrl) => {
      const files = await readFiles();
      await withCommandDatabase(databaseUrl, async (db) => {
        const staged = await previewOrApply(db, apply, (target) =>
          stageReleaseFromFiles(target, files, { remove, revert }),
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
            // DEBT-492: activation requires the decision (DEBT-490).
            `Preview, then activate: pnpm exec tsx scripts/content-release/activate-release.ts --release ${staged.releaseId} --expect-active ${staged.parentReleaseId} --reason "<why>" --authority "<who>"`,
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
