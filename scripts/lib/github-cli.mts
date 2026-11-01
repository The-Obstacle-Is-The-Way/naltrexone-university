import { execFileSync } from 'node:child_process';

export type Gh = (args: string[], input?: string) => string;
type GhLimits = { timeout: number; maxBuffer?: number };

// Caller owns policy, parsing and diagnostics. Keep this native-Node compatible
// so the scheduled jobs do not acquire an installation prerequisite.
export function createGhRunner(limits: GhLimits, executable = 'gh'): Gh {
  return (args, input) =>
    execFileSync(executable, args, {
      ...limits,
      encoding: 'utf8',
      stdio: 'pipe',
      input,
    });
}
