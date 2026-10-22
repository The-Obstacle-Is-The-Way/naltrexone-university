import { type ChildProcess, execFileSync, spawn } from 'node:child_process';

export type CommandEnv = Readonly<Record<string, string | undefined>>;

export type CommandStep = {
  label: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  omitInheritedEnv?: string[];
};

export type CommandInvocation = {
  label: string;
  command: string;
  args: string[];
  env: CommandEnv;
};

type RunCommandPlanInput = {
  env?: CommandEnv;
  runCommand?: (invocation: CommandInvocation) => Promise<void>;
};

export async function runCommandPlan(
  plan: CommandStep[],
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
// Only a guard against a hung `ps`, which normally answers in tens of
// milliseconds. One second was too tight for a loaded CI runner (BUG-336), and
// a listing cut short leaves a detached group such as Playwright's web server
// running.
const PROCESS_DISCOVERY_TIMEOUT_MS = 5_000;

// Playwright's webServer starts a detached group of its own. Snapshot only
// this command's descendants before signalling, while ancestry still exists.
function ownedProcessGroups(rootPid: number): number[] {
  const rows = execFileSync('ps', ['-eo', 'pid=,ppid=,pgid='], {
    encoding: 'utf8',
    timeout: PROCESS_DISCOVERY_TIMEOUT_MS,
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
  { label, command, args, env }: CommandInvocation,
  signals: ParentSignals = process,
  signalGraceMs = INTERRUPT_GRACE_MS,
): Promise<void> {
  console.log(`[test-lane] ${label}`);
  const childEnv = { ...env } as NodeJS.ProcessEnv;

  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawn(command, args, {
      env: childEnv,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    });

    let interrupted: NodeJS.Signals | undefined;
    let signalFailure: { error: unknown } | undefined;
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
      let failure: { error: unknown } | undefined;
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
            failure ??= { error };
        }
      }
      if (failure) throw failure.error;
    };
    const interrupt = (signal: NodeJS.Signals) => {
      if (interrupted) return;
      interrupted = signal;
      if (process.platform !== 'win32' && child.pid !== undefined) {
        groups = [child.pid];
        try {
          groups = ownedProcessGroups(child.pid);
        } catch (error) {
          try {
            killTree('SIGKILL');
          } catch (cleanupError) {
            cleanup();
            reject(cleanupError);
            return;
          }
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
        } catch (error) {
          signalFailure ??= { error };
        } finally {
          cleanup();
        }
        reject(
          signalFailure
            ? signalFailure.error
            : new Error(`Local E2E interrupted by ${signal}.`),
        );
      }, signalGraceMs);
      try {
        killTree(signal);
      } catch (error) {
        // A partial failure must not cancel escalation for signalable groups.
        signalFailure ??= { error };
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
