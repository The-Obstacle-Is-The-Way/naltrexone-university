import { type ChildProcess, spawn } from 'node:child_process';
import {
  createLocalTestTargetEnv,
  isTruthyEnvFlag,
  resolveLocalTestTarget,
} from './resolve-local-test-target';

export type E2ECommandEnv = Readonly<Record<string, string | undefined>>;

export type E2ECommandStep = {
  label: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  omitInheritedEnv?: string[];
};

export type E2ECommandInvocation = {
  label: string;
  command: string;
  args: string[];
  env: E2ECommandEnv;
};

type CreateE2ECommandPlanInput = {
  env?: E2ECommandEnv;
  cwd?: string;
  playwrightArgs?: string[];
};

type RunCommandPlanInput = {
  env?: E2ECommandEnv;
  runCommand?: (invocation: E2ECommandInvocation) => Promise<void>;
};

export function shouldUseIsolatedLocalE2E(
  env: E2ECommandEnv = process.env,
): boolean {
  return (
    !isTruthyEnvFlag(env.CI) && !isTruthyEnvFlag(env.E2E_USE_EXISTING_DATABASE)
  );
}

export function resolveLocalE2EDatabaseUrl(
  env: E2ECommandEnv = process.env,
  cwd: string = process.cwd(),
): string {
  return resolveLocalTestTarget({ env, cwd }).databaseUrl;
}

export function createE2ECommandPlan({
  env = process.env,
  cwd = process.cwd(),
  playwrightArgs = [],
}: CreateE2ECommandPlanInput = {}): E2ECommandStep[] {
  if (!shouldUseIsolatedLocalE2E(env)) {
    return [
      {
        label: 'Run Playwright E2E',
        command: 'pnpm',
        args: ['exec', 'playwright', 'test', ...playwrightArgs],
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
      args: ['exec', 'tsx', 'scripts/ensure-local-test-db.ts'],
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
      args: ['exec', 'tsx', 'scripts/internal/run-managed-db-seed.ts'],
      env: {
        ...targetEnv,
        SEED_INCLUDE_PLACEHOLDERS: 'true',
      },
    },
    {
      label: 'Run Playwright E2E against isolated local test target',
      command: 'pnpm',
      args: ['exec', 'playwright', 'test', ...playwrightArgs],
      env: targetEnv,
      omitInheritedEnv: ['NO_COLOR'],
    },
  ];
}

export async function runCommandPlan(
  plan: E2ECommandStep[],
  { env = process.env, runCommand = spawnCommand }: RunCommandPlanInput = {},
): Promise<void> {
  for (const step of plan) {
    const childEnv: Record<string, string | undefined> = {
      ...env,
      ...step.env,
    };
    for (const key of step.omitInheritedEnv ?? []) {
      delete childEnv[key];
    }

    await runCommand({
      label: step.label,
      command: step.command,
      args: step.args,
      env: childEnv,
    });
  }
}

async function spawnCommand({
  label,
  command,
  args,
  env,
}: E2ECommandInvocation): Promise<void> {
  console.log(`[local-e2e] ${label}`);
  const childEnv = { ...env } as NodeJS.ProcessEnv;

  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawn(command, args, {
      env: childEnv,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (code === 0) {
        resolve();
        return;
      }

      const exitReason =
        signal === null ? `exit code ${code ?? 'unknown'}` : `signal ${signal}`;
      reject(
        new Error(
          `Command failed during "${label}": ${command} ${args.join(' ')} (${exitReason}).`,
        ),
      );
    });
  });
}
