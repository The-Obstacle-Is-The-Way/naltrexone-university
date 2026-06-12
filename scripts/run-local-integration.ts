import { pathToFileURL } from 'node:url';
import {
  type E2ECommandEnv,
  type E2ECommandStep,
  runCommandPlan,
} from './e2e-local-orchestrator';
import {
  createLocalTestTargetEnv,
  isTruthyEnvFlag,
  resolveLocalTestTarget,
} from './resolve-local-test-target';

type CreateLocalIntegrationCommandPlanInput = {
  env?: E2ECommandEnv;
  cwd?: string;
  vitestArgs?: string[];
};

type RunLocalIntegrationInput = {
  argv?: string[];
  env?: E2ECommandEnv;
  cwd?: string;
  runPlan?: typeof runCommandPlan;
};

export function shouldUseLocalIntegrationTarget(
  env: E2ECommandEnv = process.env,
): boolean {
  return !isTruthyEnvFlag(env.CI) && !env.DATABASE_URL;
}

export function createLocalIntegrationCommandPlan({
  env = process.env,
  cwd = process.cwd(),
  vitestArgs = [],
}: CreateLocalIntegrationCommandPlanInput = {}): E2ECommandStep[] {
  const baseStep = {
    command: 'pnpm',
    args: [
      'exec',
      'vitest',
      'run',
      '--config',
      'vitest.integration.config.ts',
      ...vitestArgs,
    ],
  };

  if (!shouldUseLocalIntegrationTarget(env)) {
    return [
      {
        label: 'Run integration tests',
        ...baseStep,
      },
    ];
  }

  const target = resolveLocalTestTarget({ env, cwd });
  return [
    {
      label: 'Run integration tests against isolated local test database',
      ...baseStep,
      env: createLocalTestTargetEnv(target),
    },
  ];
}

export async function runLocalIntegration({
  argv = process.argv,
  env = process.env,
  cwd = process.cwd(),
  runPlan = runCommandPlan,
}: RunLocalIntegrationInput = {}): Promise<void> {
  const vitestArgs = argv.slice(2);
  const plan = createLocalIntegrationCommandPlan({ env, cwd, vitestArgs });

  await runPlan(plan, { env });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

/* v8 ignore start */
if (import.meta.url === executedPath) {
  runLocalIntegration().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
