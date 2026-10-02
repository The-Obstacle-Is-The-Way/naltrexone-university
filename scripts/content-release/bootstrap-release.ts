import { pathToFileURL } from 'node:url';
import { runHumanDatabaseCommand } from '../database-command';
import {
  type DecisionRecord,
  readDecisionFlag,
  requireDecision,
} from '../seed/qid-command-args';
import {
  assertPlanForApply,
  formatActivation,
  formatDecision,
  formatDecisionArgs,
  formatPlan,
  previewOrApply,
  readPlanId,
  withCommandDatabase,
} from './command-support';
import { bootstrapRelease } from './release-activation';

type CommandIo = {
  env?: Readonly<Record<string, string | undefined>>;
  log?: (message: string) => void;
};

// --apply, --plan with the plan id a preview printed (DEBT-489), and the
// decision: --reason and --authority (DEBT-490).
export function parseBootstrapArgs(argv: readonly string[]): {
  apply: boolean;
  expectedPlanId: string | undefined;
  record: DecisionRecord;
} {
  let apply = false;
  let expectedPlanId: string | undefined;
  const record: Partial<DecisionRecord> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply' && !apply) {
      apply = true;
    } else if (arg === '--plan' && expectedPlanId === undefined) {
      expectedPlanId = readPlanId(argv[index + 1]);
      index += 1;
    } else if (arg === '--reason' || arg === '--authority') {
      readDecisionFlag(record, arg, argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  assertPlanForApply(apply, expectedPlanId);
  return {
    apply,
    expectedPlanId,
    record: requireDecision(record, 'bootstrap'),
  };
}

// DEBT-483: the first activation adopts what is live as a release with no
// parent. Afterwards the direct seed refuses this database, and content
// changes only through releases. A dry run unless --apply, which adopts
// nothing if what is live has changed since the preview.
export async function runBootstrapRelease(
  argv: readonly string[] = process.argv.slice(2),
  { env = process.env, log = console.info }: CommandIo = {},
): Promise<void> {
  const { apply, expectedPlanId, record } = parseBootstrapArgs(argv);
  await runHumanDatabaseCommand({
    env,
    log,
    execute: (databaseUrl) =>
      withCommandDatabase(databaseUrl, async (db) => {
        const summary = await previewOrApply(db, apply, (target) =>
          bootstrapRelease(target, { expectedPlanId, record }),
        );
        log(
          `Release bootstrap${apply ? '' : ' (dry-run)'}: ${formatActivation(summary)}`,
        );
        log(formatDecision(record));
        for (const line of formatPlan(summary.plan)) log(line);
        if (!apply) {
          log(
            `Apply exactly this plan: pnpm exec tsx scripts/content-release/bootstrap-release.ts ${formatDecisionArgs(record)} --plan ${summary.plan.id} --apply`,
          );
        }
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
