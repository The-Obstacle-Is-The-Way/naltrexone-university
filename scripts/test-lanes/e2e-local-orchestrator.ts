import type { CommandEnv, CommandStep } from '../lib/command-plan';
import { isLoopbackHostname } from '../lib/loopback-hostname';
import {
  createLocalTestTargetEnv,
  isTruthyEnvFlag,
  resolveLocalTestTarget,
} from './resolve-local-test-target';

type CreateE2ECommandPlanInput = {
  env?: CommandEnv;
  cwd?: string;
  playwrightArgs?: string[];
};

export function shouldUseIsolatedLocalE2E(
  env: CommandEnv = process.env,
): boolean {
  return !isTruthyEnvFlag(env.E2E_USE_EXISTING_DATABASE);
}

export function createE2ECommandPlan({
  env = process.env,
  cwd = process.cwd(),
  playwrightArgs = [],
}: CreateE2ECommandPlanInput = {}): CommandStep[] {
  if (!shouldUseIsolatedLocalE2E(env)) {
    assertExistingE2EDatabaseTarget(env);
    return [
      {
        label: 'Run Playwright E2E',
        command: 'pnpm',
        args: ['exec', 'playwright', 'test', ...playwrightArgs],
        env: {
          E2E_STRIPE_OWNER: localStripeOwner(
            env,
            resolveLocalTestTarget({ env, cwd }).instanceId,
          ),
        },
        omitInheritedEnv: ['NO_COLOR'],
      },
    ];
  }

  const target = resolveLocalTestTarget({ env, cwd });
  const targetEnv = createLocalTestTargetEnv(target);
  return [
    {
      label: 'Start isolated local Docker test database',
      command: 'pnpm',
      args: ['exec', 'tsx', 'scripts/test-lanes/run-local-test-db.ts', 'up'],
      env: targetEnv,
    },
    {
      label: 'Migrate isolated local Docker test database',
      command: 'pnpm',
      args: ['exec', 'tsx', 'scripts/internal/run-managed-db-migrate.ts'],
      env: targetEnv,
    },
    {
      label: 'Seed isolated local Docker test database',
      command: 'pnpm',
      args: [
        'exec',
        'tsx',
        'scripts/internal/run-managed-db-seed.ts',
        '--include-placeholders',
      ],
      env: targetEnv,
    },
    {
      label: 'Run Playwright E2E against isolated local test target',
      command: 'pnpm',
      args: ['exec', 'playwright', 'test', ...playwrightArgs],
      env: {
        ...targetEnv,
        E2E_STRIPE_OWNER: localStripeOwner(env, target.instanceId),
      },
      omitInheritedEnv: ['NO_COLOR'],
    },
  ];
}

// DEBT-508: each clone's runs own one Stripe test customer, named by the
// instance that also picks the clone's database port, so concurrent clones
// never change each other's subscriptions. An owner exported in the shell
// wins (CI and the hosted workflow set theirs there). One in .env.local is
// ignored: Playwright loads that file afterwards without overriding.
function localStripeOwner(env: CommandEnv, instanceId: string): string {
  return env.E2E_STRIPE_OWNER?.trim() || `local-clone-${instanceId}`;
}

function assertExistingE2EDatabaseTarget(env: CommandEnv): void {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required when E2E_USE_EXISTING_DATABASE=true.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      'DATABASE_URL must be a valid URL when E2E_USE_EXISTING_DATABASE=true.',
    );
  }

  const allowNonLocal = isTruthyEnvFlag(env.ALLOW_NON_LOCAL_DATABASE_URL);
  if (!allowNonLocal && !isLoopbackHostname(parsed.hostname)) {
    throw new Error(
      `Refusing to run E2E against non-local DATABASE_URL host "${parsed.hostname}". Export ALLOW_NON_LOCAL_DATABASE_URL=true only for an intentional deploy-target check.`,
    );
  }
}
