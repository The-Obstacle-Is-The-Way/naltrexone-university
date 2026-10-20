import { pathToFileURL } from 'node:url';
import { runHumanDatabaseCommand } from '../database-command';
import { parseQidCommandArgs } from '../seed/qid-command-args';
import {
  formatActivation,
  formatChanges,
  previewOrApply,
  withCommandDatabase,
} from './command-support';
import { changeHolds } from './release-holds';

type CommandIo = {
  env?: Readonly<Record<string, string | undefined>>;
  log?: (message: string) => void;
};

// DEBT-483: places, or with --lift lifts, a hold on each named question's
// live revision, or lifts exactly the hold IDs named by --hold. It records
// the decision and re-applies the active release. A dry run unless --apply.
export async function runHoldQuestions(
  argv: readonly string[] = process.argv.slice(2),
  { env = process.env, log = console.info }: CommandIo = {},
): Promise<void> {
  const { qids, holdIds, apply, lift, record, revert } = parseQidCommandArgs(
    argv,
    {
      decision: 'hold or lift',
      allowLift: true,
      allowRevert: true,
    },
  );
  await runHumanDatabaseCommand({
    env,
    log,
    execute: (databaseUrl) =>
      withCommandDatabase(databaseUrl, async (db) => {
        const summary = await previewOrApply(db, apply, (target) =>
          changeHolds(target, {
            qids,
            ...(holdIds ? { holdIds } : {}),
            record,
            lift,
            revert,
          }),
        );
        log(
          holdIds
            ? `Hold IDs: ${holdIds.join(', ')}`
            : `Hold QIDs: ${qids.join(', ')}`,
        );
        log(`Hold reason: ${record.reason} (authority: ${record.authority})`);
        log(
          `${lift ? 'Hold lift' : 'Hold'}${apply ? '' : ' (dry-run)'}: holds=${summary.holds} ${formatActivation(summary.activation)}`,
        );
        for (const line of formatChanges(summary.activation.plan)) log(line);
      }),
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runHoldQuestions().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
