import { type CommandEnv, runCommandPlan } from '../lib/command-plan';
import { isMain } from '../lib/entry-point.mts';
import { createE2ECommandPlan } from './e2e-local-orchestrator';

type RunLocalE2EInput = {
  argv?: string[];
  env?: CommandEnv;
  createPlan?: typeof createE2ECommandPlan;
  runPlan?: typeof runCommandPlan;
};

export async function runLocalE2E({
  argv = process.argv,
  env = process.env,
  createPlan = createE2ECommandPlan,
  runPlan = runCommandPlan,
}: RunLocalE2EInput = {}): Promise<void> {
  const playwrightArgs = argv.slice(2);
  const plan = createPlan({
    env,
    playwrightArgs,
  });

  await runPlan(plan, {
    env,
  });
}

/* v8 ignore start */
if (isMain(import.meta.url)) {
  runLocalE2E().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
