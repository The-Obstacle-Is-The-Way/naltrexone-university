import { execFileSync } from 'node:child_process';

export type Gh = (args: string[], input?: string) => string;
type GhLimits = { timeout: number; maxBuffer?: number };

// Caller owns policy, parsing and diagnostics; gh's error output stays on the
// thrown error, for `withGhFailureReason` below. Keep this native-Node
// compatible so the scheduled jobs do not acquire an installation prerequisite.
export function createGhRunner(limits: GhLimits, executable = 'gh'): Gh {
  return (args, input) =>
    execFileSync(executable, args, {
      ...limits,
      encoding: 'utf8',
      stdio: 'pipe',
      input,
    });
}

const MAX_REASON_LENGTH = 200;

// The scheduled jobs' fixed failure lines exist because an arbitrary error can
// carry anything, a credential included, so this never prints one. It reads
// only what the runner's child process left: Node's code for a transport
// failure, or the first line of gh's own error output, which gh writes without
// its token and which Actions logs masked. BUG-370.
export function withGhFailureReason(line: string, error: unknown): string {
  const reason = ghFailureReason(error);
  return reason ? `${line} Cause: ${reason}` : line;
}

export function ghFailureReason(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, syscall, stderr } = error as Record<string, unknown>;
  if (
    typeof code === 'string' &&
    typeof syscall === 'string' &&
    syscall.startsWith('spawnSync ')
  )
    return code;
  if (typeof stderr !== 'string') return undefined;
  const first = stderr
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean);
  if (!first) return undefined;
  return first.length > MAX_REASON_LENGTH
    ? `${first.slice(0, MAX_REASON_LENGTH - 1)}…`
    : first;
}
