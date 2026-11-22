import { runVerifyLockfileDrift } from './lockfile-drift';
import { gitLockfileReader } from './lockfile-union';

// The lockfile drift check's CLI. Like the union check's, it runs
// unconditionally, with no entry-point check, so a symlinked or extensionless
// invocation cannot exit 0 without checking anything.
/* v8 ignore start */
process.exitCode = runVerifyLockfileDrift(
  process.argv.slice(2),
  gitLockfileReader({ cwd: process.cwd(), env: process.env }),
  { out: console.log, err: console.error },
);
/* v8 ignore stop */
