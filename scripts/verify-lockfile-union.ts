import { gitLockfileReader, runVerifyLockfileUnion } from './lockfile-union';

// The lockfile-union CLI (issue #885). It runs unconditionally, with no
// entry-point check: such a check missed symlinked and extensionless
// invocations, which then exited 0 without verifying anything.
/* v8 ignore start */
process.exitCode = runVerifyLockfileUnion(
  process.argv.slice(2),
  gitLockfileReader({ cwd: process.cwd(), env: process.env }),
  { out: console.log, err: console.error },
);
/* v8 ignore stop */
