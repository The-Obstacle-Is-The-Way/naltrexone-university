import { pathToFileURL } from 'node:url';
import {
  createE2ECommandPlan,
  type E2ECommandEnv,
  runCommandPlan,
} from './e2e-local-orchestrator';

type RunLocalE2EInput = {
  argv?: string[];
  env?: E2ECommandEnv;
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

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runLocalE2E().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
