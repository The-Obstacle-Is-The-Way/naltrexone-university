import { type ChildProcess, spawn } from 'node:child_process';

export type E2ECommandEnv = Readonly<Record<string, string | undefined>>;

export type E2ECommandStep = {
  label: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

export type E2ECommandInvocation = {
  label: string;
  command: string;
  args: string[];
  env: E2ECommandEnv;
};

type CreateE2ECommandPlanInput = {
  env?: E2ECommandEnv;
  playwrightArgs?: string[];
};

type RunCommandPlanInput = {
  env?: E2ECommandEnv;
  runCommand?: (invocation: E2ECommandInvocation) => Promise<void>;
};

const LOCAL_E2E_DB_HOST = '127.0.0.1';
const LOCAL_E2E_DB_DEFAULT_PORT = '5434';
const LOCAL_E2E_DB_USER = 'postgres';
const LOCAL_E2E_DB_PASSWORD = 'postgres';
const LOCAL_E2E_DB_NAME = 'addiction_boards_test';
const TRUTHY_ENV_VALUES = new Set(['1', 'true', 'yes']);

function isTruthyEnvFlag(value: string | undefined): boolean {
  if (!value) return false;
  return TRUTHY_ENV_VALUES.has(value.trim().toLowerCase());
}

export function shouldUseHermeticLocalE2E(
  env: E2ECommandEnv = process.env,
): boolean {
  return (
    !isTruthyEnvFlag(env.CI) && !isTruthyEnvFlag(env.E2E_USE_EXISTING_DATABASE)
  );
}

export function resolveLocalE2EDatabaseUrl(
  env: E2ECommandEnv = process.env,
): string {
  const port = env.DB_TEST_PORT?.trim() || LOCAL_E2E_DB_DEFAULT_PORT;
  return `postgresql://${LOCAL_E2E_DB_USER}:${LOCAL_E2E_DB_PASSWORD}@${LOCAL_E2E_DB_HOST}:${port}/${LOCAL_E2E_DB_NAME}`;
}

export function createE2ECommandPlan({
  env = process.env,
  playwrightArgs = [],
}: CreateE2ECommandPlanInput = {}): E2ECommandStep[] {
  if (!shouldUseHermeticLocalE2E(env)) {
    return [
      {
        label: 'Run Playwright E2E',
        command: 'pnpm',
        args: ['exec', 'playwright', 'test', ...playwrightArgs],
      },
    ];
  }

  const databaseUrl = resolveLocalE2EDatabaseUrl(env);
  return [
    {
      label: 'Stop stale local Next.js server on :3000',
      command: 'sh',
      args: ['-c', 'lsof -ti:3000 | xargs kill -9 2>/dev/null || true'],
    },
    {
      label: 'Start local Docker test database',
      command: 'pnpm',
      args: ['exec', 'tsx', 'scripts/ensure-local-test-db.ts'],
    },
    {
      label: 'Migrate local Docker test database',
      command: 'pnpm',
      args: ['db:migrate'],
      env: {
        DATABASE_URL: databaseUrl,
      },
    },
    {
      label: 'Seed local Docker test database',
      command: 'pnpm',
      args: ['db:seed'],
      env: {
        DATABASE_URL: databaseUrl,
        SEED_INCLUDE_PLACEHOLDERS: 'true',
      },
    },
    {
      label: 'Run Playwright E2E against local Docker test database',
      command: 'pnpm',
      args: ['exec', 'playwright', 'test', ...playwrightArgs],
      env: {
        DATABASE_URL: databaseUrl,
      },
    },
  ];
}

export async function runCommandPlan(
  plan: E2ECommandStep[],
  { env = process.env, runCommand = spawnCommand }: RunCommandPlanInput = {},
): Promise<void> {
  for (const step of plan) {
    await runCommand({
      label: step.label,
      command: step.command,
      args: step.args,
      env: {
        ...env,
        ...step.env,
      },
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
