import { stripPnpmSeparator } from '../lib/command-args';
import {
  type CommandEnv,
  type CommandStep,
  runCommandPlan,
} from '../lib/command-plan';
import { isMain } from '../lib/entry-point.mts';
import {
  createLocalTestTargetEnv,
  isTruthyEnvFlag,
  resolveLocalTestTarget,
} from './resolve-local-test-target';
import { createLocalTestDbCommandPlan } from './run-local-test-db';

type CreateLocalIntegrationCommandPlanInput = {
  env?: CommandEnv;
  cwd?: string;
  vitestArgs?: string[];
};

type RunLocalIntegrationInput = {
  argv?: string[];
  env?: CommandEnv;
  cwd?: string;
  runPlan?: typeof runCommandPlan;
};

export function shouldUseLocalIntegrationTarget(
  env: CommandEnv = process.env,
): boolean {
  return !isTruthyEnvFlag(env.INTEGRATION_USE_EXISTING_DATABASE);
}

export function createLocalIntegrationCommandPlan({
  env = process.env,
  cwd = process.cwd(),
  vitestArgs = [],
}: CreateLocalIntegrationCommandPlanInput = {}): CommandStep[] {
  const baseStep = {
    command: 'pnpm',
    args: [
      'exec',
      'vitest',
      'run',
      '--config',
      'vitest.integration.config.mts',
      ...vitestArgs,
    ],
  };

  if (!shouldUseLocalIntegrationTarget(env)) {
    if (!env.DATABASE_URL?.trim()) {
      throw new Error(
        'DATABASE_URL is required when INTEGRATION_USE_EXISTING_DATABASE=true.',
      );
    }
    return [
      {
        label: 'Run integration tests',
        ...baseStep,
      },
    ];
  }

  const target = resolveLocalTestTarget({ env, cwd });
  const targetEnv = createLocalTestTargetEnv(target);
  const preparation: CommandStep[] = isTruthyEnvFlag(
    env.INTEGRATION_SKIP_PREPARE,
  )
    ? []
    : [
        // Use the same original inputs, never re-resolve an already normalized
        // LOCAL_TEST_INSTANCE in a child process (BUG-329).
        ...createLocalTestDbCommandPlan({ action: 'up', env, cwd }),
        {
          label: 'Migrate isolated integration database',
          command: 'pnpm',
          args: ['db:migrate'],
          env: targetEnv,
        },
        {
          label: 'Seed isolated integration database',
          command: 'pnpm',
          args: ['db:seed'],
          env: { ...targetEnv, SEED_INCLUDE_PLACEHOLDERS: 'true' },
        },
      ];
  return [
    ...preparation,
    {
      label: 'Run integration tests against isolated local test database',
      ...baseStep,
      env: targetEnv,
    },
  ];
}

export async function runLocalIntegration({
  argv = process.argv,
  env = process.env,
  cwd = process.cwd(),
  runPlan = runCommandPlan,
}: RunLocalIntegrationInput = {}): Promise<void> {
  const vitestArgs = stripPnpmSeparator(argv.slice(2));
  const plan = createLocalIntegrationCommandPlan({ env, cwd, vitestArgs });

  await runPlan(plan, { env });
}

/* v8 ignore start */
if (isMain(import.meta.url)) {
  runLocalIntegration().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
