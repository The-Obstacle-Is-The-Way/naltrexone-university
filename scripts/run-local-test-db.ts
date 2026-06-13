import { pathToFileURL } from 'node:url';
import {
  type E2ECommandEnv,
  type E2ECommandStep,
  runCommandPlan,
} from './e2e-local-orchestrator';
import {
  createLocalTestTargetEnv,
  resolveLocalTestTarget,
} from './resolve-local-test-target';

type LocalTestDbAction = 'up' | 'down' | 'reset';

type CreateLocalTestDbCommandPlanInput = {
  action: LocalTestDbAction;
  env?: E2ECommandEnv;
  cwd?: string;
};

type RunLocalTestDbCommandInput = {
  argv?: string[];
  env?: E2ECommandEnv;
  cwd?: string;
  runPlan?: typeof runCommandPlan;
};

export function createLocalTestDbCommandPlan({
  action,
  env = process.env,
  cwd = process.cwd(),
}: CreateLocalTestDbCommandPlanInput): E2ECommandStep[] {
  const target = resolveLocalTestTarget({ env, cwd });
  const targetEnv = createLocalTestTargetEnv(target);
  const projectArgs = ['compose', '-p', target.composeProjectName];

  if (action === 'up') {
    return [
      {
        label: 'Start isolated local test database',
        command: 'docker',
        args: [...projectArgs, 'up', '-d', '--wait', 'db'],
        env: targetEnv,
      },
    ];
  }

  if (action === 'down') {
    return [
      {
        label: 'Stop isolated local test database',
        command: 'docker',
        args: [...projectArgs, 'down'],
        env: targetEnv,
      },
    ];
  }

  return [
    {
      label: 'Reset isolated local test database',
      command: 'docker',
      args: [...projectArgs, 'down', '-v'],
      env: targetEnv,
    },
    {
      label: 'Start isolated local test database',
      command: 'docker',
      args: [...projectArgs, 'up', '-d', '--wait', 'db'],
      env: targetEnv,
    },
  ];
}

export async function runLocalTestDbCommand({
  argv = process.argv,
  env = process.env,
  cwd = process.cwd(),
  runPlan = runCommandPlan,
}: RunLocalTestDbCommandInput = {}): Promise<void> {
  const action = parseLocalTestDbAction(argv[2]);
  const plan = createLocalTestDbCommandPlan({ action, env, cwd });

  await runPlan(plan, { env });
}

function parseLocalTestDbAction(value: string | undefined): LocalTestDbAction {
  if (value === undefined || value === 'up') return 'up';
  if (value === 'down' || value === 'reset') return value;

  throw new Error(`Unknown local test DB action "${value}".`);
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runLocalTestDbCommand().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
