# BUG-311: The Playwright Install Retry Fails on a Lock Held by the Timed-Out apt-get

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Resolved
**Priority:** P3
**Date:** 2026-09-30
**Resolved:** 2026-09-30 — promoted to `main` through #1259; production release verified (see Resolution)
**Verification receipts:** see Resolution

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
- The harness's own `pgrep` and `pkill` act only on its fake `apt-get` and log the pattern the script passed, so a test never matches or signals a host process (#1255 review). A separate case checks that pattern against real command lines: it matches `apt-get update` and `/usr/bin/apt-get install …`, and not apt's methods or the `sh -c` wrapper.

## Resolution (2026-09-30)

- **Shipped.** #1255 merged as `5b455896` with exact-head approval **5369368103** on `09dd4ab4`.
  - Its three findings were accepted: the harness's own `pgrep`/`pkill` keep its tests from touching host processes, the status became the canonical `In Progress`, and two debt records' filing status was corrected.
  - The local full gate passed on that exact head: 6,101 unit, 448 browser and 552 integration tests; build; all 60 E2E tests; the hosted Stripe lane, 7/7.
- **Promoted and released.** Promoted through #1259 (`a9849911`, merged **18:51:43Z**) with #1255, #1256 and #1258, after `git fetch` and a passing `verify-promotion` receipt; its review approved with no findings. Promotion #1257, carrying the first two, was closed unmerged so #1258 could ship with them.
  - Release verified: main CI **36761596767** `test` **19:04:43Z**, passing on its first run; Ready **18:52:53.964Z**, held without alias until its check completed; production assigned **19:04:46.774Z**; matching trees `19f3ba2c`; healthy production.
- **Verified on `main`.** The fix and its cases are present on `main` at `a9849911`.
