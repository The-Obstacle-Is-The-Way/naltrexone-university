import { pathToFileURL } from 'node:url';
import { runHumanDatabaseCommand } from '../database-command';
import { readQidValue } from '../seed/qid-command-args';
import {
  formatChanges,
  formatRevertArgs,
  previewOrApply,
  withCommandDatabase,
} from './command-support';
import { CORPUS_COMMIT_PATTERN } from './release-manifest';
import { stageReleaseFromCommit } from './release-source';

type StageIo = {
  env?: Readonly<Record<string, string | undefined>>;
  log?: (message: string) => void;
};

// --apply, --remove <qid> for each live question whose file is absent on
// purpose (DEBT-489), and --revert <qid> for each question the bundle moves
// back to an earlier revision on purpose (DEBT-492). Each flag value is
// checked like a QID. --baseline <commit>, only on the first release after
// the bootstrap, names the commit the owner verified against live content
// (BUG-351).
export function parseStageArgs(argv: readonly string[]): {
  apply: boolean;
  repository: string;
  commit: string;
  baseline?: string;
  draft: string[];
  archive: string[];
  remove: string[];
  revert: string[];
} {
  let apply = false;
  let repository: string | undefined;
  let commit: string | undefined;
  let baseline: string | undefined;
  const draft: string[] = [];
  const archive: string[] = [];
  const remove: string[] = [];
  const revert: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo' && repository === undefined) {
      repository = argv[++index];
      if (!repository || repository.startsWith('--'))
        throw new Error('--repo needs a repository path');
    } else if (arg === '--commit' && commit === undefined) {
      commit = argv[++index];
      if (!commit || !CORPUS_COMMIT_PATTERN.test(commit))
        throw new Error('--commit needs a full lowercase commit ID');
    } else if (arg === '--baseline' && baseline === undefined) {
      baseline = argv[++index];
      if (!baseline || !CORPUS_COMMIT_PATTERN.test(baseline))
        throw new Error('--baseline needs a full lowercase commit ID');
    } else if (arg === '--apply' && !apply) {
      apply = true;
    } else if (arg === '--draft' || arg === '--archive') {
      const target = arg === '--draft' ? draft : archive;
      target.push(readQidValue(argv[index + 1], arg, target));
      index += 1;
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
  if (!repository || !commit)
    throw new Error('--repo and --commit are required');
  if (draft.some((qid) => archive.includes(qid)))
    throw new Error('Each source question may have only one disposition');
  return {
    apply,
    repository,
    commit,
    ...(baseline ? { baseline } : {}),
    draft,
    archive,
    remove,
    revert,
  };
}

// Stages a release of the archived content commit on the active release, writing
// nothing a learner reads, and names the activation that makes it live. A
// dry run unless --apply.
export async function runStageRelease(
  argv: readonly string[] = process.argv.slice(2),
  { env = process.env, log = console.info }: StageIo = {},
): Promise<void> {
  const {
    apply,
    repository,
    commit,
    baseline,
    draft,
    archive,
    remove,
    revert,
  } = parseStageArgs(argv);
  await runHumanDatabaseCommand({
    env,
    log,
    execute: async (databaseUrl) => {
      await withCommandDatabase(databaseUrl, async (db) => {
        const staged = await previewOrApply(db, apply, (target) =>
          stageReleaseFromCommit(
            target,
            { repository, commit },
            { remove, revert, draft, archive, baseline },
          ),
        );
        log(
          [
            `Release staging${apply ? '' : ' (dry-run)'}: release=${staged.releaseId}`,
            `parent=${staged.parentReleaseId}`,
            `reusedRelease=${staged.reusedRelease}`,
            `source=${commit}`,
            ...(baseline ? [`baseline=${baseline}`] : []),
            `items=${staged.items}`,
            `inserted=${staged.inserted}`,
            `appended=${staged.appended}`,
            `reused=${staged.reused}`,
            `removals=${staged.removals}`,
            `withdrawals=${staged.withdrawals}`,
          ].join(' '),
        );
        for (const line of formatChanges(staged.changes)) log(line);
        if (apply) {
          log(
            // DEBT-492: activation requires the decision (DEBT-490).
            `Preview, then activate: pnpm exec tsx scripts/content-release/activate-release.ts --repo '${repository.replaceAll("'", "'\\''")}' --release ${staged.releaseId} --expect-active ${staged.parentReleaseId}${formatRevertArgs(staged.changes.answerKeyReturn)} --reason "<why>" --authority "<who>"`,
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
