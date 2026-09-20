import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
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
  return !isTruthyEnvFlag(env.E2E_USE_EXISTING_DATABASE);
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
    assertExistingE2EDatabaseTarget(env);
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
      args: ['exec', 'tsx', 'scripts/run-local-test-db.ts', 'up'],
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

function assertExistingE2EDatabaseTarget(env: E2ECommandEnv): void {
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

  const localHosts = new Set(['127.0.0.1', '[::1]', 'localhost']);
  const allowNonLocal = isTruthyEnvFlag(env.ALLOW_NON_LOCAL_DATABASE_URL);
  if (!allowNonLocal && !localHosts.has(parsed.hostname)) {
    throw new Error(
      `Refusing to run E2E against non-local DATABASE_URL host "${parsed.hostname}". Export ALLOW_NON_LOCAL_DATABASE_URL=true only for an intentional deploy-target check.`,
    );
  }
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

type ParentSignals = {
  once(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
};
const INTERRUPT_GRACE_MS = 2_000;

// Playwright's webServer starts a detached group of its own. Snapshot only
// this command's descendants before signalling, while ancestry still exists.
function ownedProcessGroups(rootPid: number): number[] {
  const rows = execFileSync('ps', ['-eo', 'pid=,ppid=,pgid='], {
    encoding: 'utf8',
    timeout: 1_000,
  })
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const descendants = new Set([rootPid]);
  let previousSize = 0;
  while (previousSize !== descendants.size) {
    previousSize = descendants.size;
    for (const [pid, parent] of rows) {
      if (pid !== undefined && parent !== undefined && descendants.has(parent))
        descendants.add(pid);
    }
  }
  return [
    ...new Set([
      rootPid,
      ...rows.flatMap(([pid, , group]) =>
        pid !== undefined &&
        group !== undefined &&
        descendants.has(pid) &&
        descendants.has(group)
          ? [group]
          : [],
      ),
    ]),
  ];
}

export async function spawnCommand(
  { label, command, args, env }: E2ECommandInvocation,
  signals: ParentSignals = process,
  signalGraceMs = INTERRUPT_GRACE_MS,
): Promise<void> {
  console.log(`[local-e2e] ${label}`);
  const childEnv = { ...env } as NodeJS.ProcessEnv;

  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawn(command, args, {
      env: childEnv,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    });

    let interrupted: NodeJS.Signals | undefined;
    let groups: number[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      signals.off('SIGINT', onSigint);
      signals.off('SIGTERM', onSigterm);
    };
    const killTree = (signal: NodeJS.Signals) => {
      if (process.platform === 'win32' || child.pid === undefined) {
        child.kill(signal);
        return;
      }
      for (const group of groups) {
        try {
          process.kill(-group, signal);
        } catch (error) {
          // ESRCH means the owned process group has already gone away.
          if (
            !(
              error instanceof Error &&
              'code' in error &&
              error.code === 'ESRCH'
            )
          )
            throw error;
        }
      }
    };
    const interrupt = (signal: NodeJS.Signals) => {
      if (interrupted) return;
      interrupted = signal;
      if (process.platform !== 'win32' && child.pid !== undefined) {
        try {
          groups = ownedProcessGroups(child.pid);
        } catch (error) {
          child.kill('SIGKILL');
          cleanup();
          reject(error);
          return;
        }
      }
      // Keep this timer alive even if the direct child exits first: its
      // descendants may ignore the forwarded signal and keep the app port.
      timer = setTimeout(() => {
        try {
          killTree('SIGKILL');
          reject(new Error(`Local E2E interrupted by ${signal}.`));
        } catch (error) {
          reject(error);
        } finally {
          cleanup();
        }
      }, signalGraceMs);
      try {
        killTree(signal);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    const onSigint = () => interrupt('SIGINT');
    const onSigterm = () => interrupt('SIGTERM');
    signals.once('SIGINT', onSigint);
    signals.once('SIGTERM', onSigterm);
    child.on('error', (error) => {
      cleanup();
      reject(error);
    });
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (interrupted) return;
      cleanup();
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
