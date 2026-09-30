# BUG-311: The Playwright Install Retry Fails on a Lock Held by the Timed-Out apt-get

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — fix in review
**Priority:** P3
**Date:** 2026-09-30
**Resolved:** —
**Verification receipts:** —

---

## Description

CI installs Chromium's system dependencies with `scripts/ci/install-playwright-chromium.sh`. It runs `pnpm exec playwright install-deps chromium` under `timeout` (180 s by default). If that phase fails or times out, it fails over the Azure Ubuntu mirror and retries once.

When the phase times out inside apt, the retry cannot succeed:
- `playwright install-deps` runs `apt-get update && apt-get install …` as root through `sudo`.
- `timeout` runs as the runner user. On expiry it signals its process group, and `--kill-after` sends `KILL`. It can stop `pnpm`, Playwright and `sudo`, but not the root `apt-get`.
- The orphaned `apt-get` keeps holding `/var/lib/apt/lists/lock`.
- The retry's `apt-get update` exits 100 at once with `Could not get lock /var/lib/apt/lists/lock. It is held by process N (apt-get)`, and the required `test` check fails.

Expected: the retry runs against a free lock.

## How it was found

CI run **36731184125** on #1253's head `99e43f80` (2026-09-30). The Ubuntu mirror stalled during `apt-get update` from 14:49:37Z. The primary phase hit its bound at 14:52:18Z, and the retry failed 1.8 s later on the lock held by process 13153 (`apt-get`). The same change passed CI on the heads before and after it, so the failure was the mirror stall plus this defect, not the change.

## Impact

CI only. No user or data impact. When the mirror stalls, a required check goes red, blocking a merge until a new run passes, and the failover the script exists for never gets a chance to run. P3.

## Fix

Before the retry, the script stops any `apt-get` left over from the timed-out phase:
- it finds them by command line, `(^|/)apt-get( |$)`;
- it sends `TERM` through `sudo`, waits up to the kill-after bound, then sends `KILL` and waits again;
- if one still survives, it says so, and the retry fails loudly on apt's own lock message.

The fix stops only `apt-get`. If a timeout ever interrupts `dpkg` mid-install, the retry's `apt-get install` fails with apt's own instruction to run `dpkg --configure -a`. That case has not been observed. Repairing it automatically would run a package-state change unasked, so it stays out of scope.

## Verification

- Red first, in `scripts/ci/install-playwright-chromium.test.ts`. A fake `apt-get` is started detached, so the script's `timeout` cannot reach it, and holds a stand-in lock. Before the fix, the retry failed with the production message (`Could not get lock … held by process N (apt-get)`).
- After the fix, the retry runs and the fake `apt-get` is gone, both when it exits on `TERM` and when it ignores `TERM` and needs `KILL`. Removing the `KILL` fallback fails the second case.
