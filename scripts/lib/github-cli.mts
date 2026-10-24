import { execFileSync } from 'node:child_process';

export type Gh = (args: string[], input?: string) => string;
type GhLimits = { timeout: number; maxBuffer?: number };

// The errors this runner threw, so a reason is read only from gh's own failure.
const ghErrors = new WeakSet<object>();

// Caller owns policy, parsing and diagnostics; gh's error output stays on the
// thrown error, for `withGhFailureReason` below. Keep this native-Node
// compatible so the scheduled jobs do not acquire an installation prerequisite.
export function createGhRunner(limits: GhLimits, executable = 'gh'): Gh {
  return (args, input) => {
    try {
      return execFileSync(executable, args, {
        ...limits,
        encoding: 'utf8',
        stdio: 'pipe',
        input,
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null) ghErrors.add(error);
      throw error;
    }
  };
}

const MAX_REASON_LENGTH = 200;

// The scheduled jobs' fixed failure lines exist because an arbitrary error can
// carry anything, a credential included, so this never prints one. It reads
// only an error this runner threw: Node's code for a transport failure, the
// signal that killed gh, the first line of gh's own error output (which gh
// writes without its token, and Actions logs masked), or the exit status.
// BUG-370.
export function withGhFailureReason(line: string, error: unknown): string {
  const reason = ghFailureReason(error);
  return reason ? `${line} Cause: ${reason}` : line;
}

export function ghFailureReason(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !ghErrors.has(error))
    return undefined;
  const { code, signal, stderr, status } = error as Record<string, unknown>;
  if (typeof code === 'string') return code;
  if (typeof signal === 'string') return `killed by ${signal}`;
  const first =
    typeof stderr === 'string'
      ? stderr
          .split('\n')
          .map((part) => part.trim())
          .find(Boolean)
      : undefined;
  if (first)
    return first.length > MAX_REASON_LENGTH
      ? `${first.slice(0, MAX_REASON_LENGTH - 1)}…`
      : first;
  return typeof status === 'number' ? `exit status ${status}` : undefined;
}
