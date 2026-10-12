# BUG-336: Local E2E Cleanup Gives Up on a Slow Process Listing and Leaves Playwright's Web Server Running

**Status:** Verifying — two weeks of CI after the merge without `spawnSync ps ETIMEDOUT`; due 2026-10-26
**Priority:** P3
**Date:** 2026-10-11
**Resolved:** —
**Verification receipts:** —

---

## Summary

When local E2E is interrupted, `scripts/e2e-local-orchestrator.ts` lists every process with `ps` to find the process groups its command started. The listing had a one-second time limit. A loaded CI runner took longer, which failed a unit test on promotion #1461.

On a developer machine the same cut-off has a real consequence. The orchestrator falls back to killing only the root process group. A detached group, such as Playwright's web server, keeps running and holds the app's port.

## Evidence

- **The failure.** Promotion #1461's first CI run failed one test of 7,804: "preserves an operating-system SIGTERM failure". The test expected its injected `EPERM`, and received `spawnSync ps ETIMEDOUT`, which is the error the one-second limit raises. The same tree passed #1460's CI and the full local gate, and a re-run passed. [The cause is recorded on #1461.](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1461#issuecomment-6110055900)
- **A passing stall, not a slow runner.** The failed attempt's unit step took 186 s and the passing re-run 181 s. None of the 15 other failed CI runs since 2026-09-11, Dependabot's excluded, has this error in its failed steps.
- **`ps` normally takes milliseconds.** The orchestrator's exact command, timed 50 times on macOS: median 26 ms idle, 41 ms with 20 busy loops, at most 59 ms. CI runs on Ubuntu, where it was not timed; all that is known of the stall is that it passed one second.
- **Reproduced.** A `ps` slowed to 1.5 s on `PATH` gives the same `spawnSync ps ETIMEDOUT`. With a detached descendant, standing in for Playwright's web server, that descendant was still alive after the interrupt finished.

## Impact

- **CI.** A red promotion, a re-run, and the cause written up first. That is about 15 minutes each time, and rare.
- **Local.** An interrupted local E2E run on a loaded machine (Next.js, Chromium and Playwright all running) can leave the web server running. The next run then finds its port taken until someone kills it.

## How and Why `ps` Is Used

- **Why it lists processes.** Playwright starts its web server in a detached process group of its own, so signalling the command's group does not reach it. The orchestrator finds every descendant through parent IDs and signals each descendant's group.
- **Why it lists them before signalling, and synchronously.** Once a parent dies, its children are re-parented and the ancestry is gone. So the snapshot must come first, which is also why an earlier or periodic snapshot would be stale.
- **What happens if listing fails.** It kills the root group with `SIGKILL` and reports the error, without leaving the run hanging.
- **Why it has a time limit at all.** Without one, a hung `ps` would hold the interrupt indefinitely. The limit is a hang guard, not a latency target.

## Options

1. **Raise the limit to five seconds.** About 85 times the slowest listing measured under load, and short enough that an interrupt still ends promptly. *Chosen.*
2. **Retry once on a timeout.** It behaves like a longer limit, with more code.
3. **List asynchronously, or earlier.** The snapshot must precede the signals, and an earlier one misses later descendants.
4. **Inject the process lister in tests.** It would hide the production exposure the test found.
5. **Remove the limit.** A hung `ps` would block cleanup indefinitely.
6. **When listing fails, forward the original signal and wait the grace period, instead of `SIGKILL` at once.** Playwright 1.63 stops its web server when its runner gets `SIGINT`. On `SIGTERM` it does not: the runner has no handler, and the web server's launcher installs only an exit handler, which Node does not run when a signal ends the process. So this would help only a Ctrl-C, and only when `ps` hangs past the limit. Not chosen.

## Resolution (decided)

`PROCESS_DISCOVERY_TIMEOUT_MS = 5_000`, with a comment giving its purpose. The red test `still signals a detached descendant when process discovery is slow` puts a `ps` slowed to 1.5 s on `PATH`. It requires the interrupt to finish normally and the detached descendant to be gone. The one-second limit was the only child-process time limit under 30 seconds in `scripts/`, `lib/` and `src/`; the others allow 30 seconds to five minutes.

**What remains.** A `ps` that hangs for more than five seconds still ends in the fallback, which can leave a detached group running (option 6).

## Verification

- [x] The red test reproduces `spawnSync ps ETIMEDOUT` under the old limit (2026-10-11).
- [x] Under the old limit, the detached descendant survives the interrupt (2026-10-11).
- [x] Under the new limit the test passes, and the whole cleanup test file passed 8 of 8 runs beside 20 busy loops (2026-10-11).
- [x] Promoted to `main` (2026-10-12).
- [ ] No CI run fails with `spawnSync ps ETIMEDOUT` in the two weeks after the merge (due 2026-10-26).

## Related

- #939 added the process listing and its one-second limit.
- DEBT-518 uses this record as an example of what a small fix costs under the current record process.
