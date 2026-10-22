# BUG-366: The Playwright Install's Mirror Failover Misses the Runner's Mirror List

**Status:** Open — fix in review, then confirm the failover on the next stalled CI install, or that none came; due 2026-11-06
**Priority:** P2
**Date:** 2026-10-22

---

## Summary

When CI's Playwright dependency install stalls, `scripts/ci/install-playwright-chromium.sh` is meant to retry through `archive.ubuntu.com` instead of the Azure mirror (DEBT-471). GitHub's Ubuntu runners do not name that mirror in an apt source file. `ubuntu.sources` points at a mirror list, `mirror+file:/etc/apt/apt-mirrors.txt`, and the list names `azure.archive.ubuntu.com` first. The failover searches only `*.list` and `*.sources` files, so it finds no Azure mirror and retries through the same one. A stall then fails CI's required `test` job with exit 124 before any browser or E2E test runs. The runners have pointed at the mirror list since November 2024, before DEBT-471 added the failover, so it has probably never fired on them.

*Corrected 2026-10-22: after the challenge and a pre-review pass, the runner layout is verified from its image source, apt's own fallback is described below, `Ign:` lines are read as failed fetches, not late ones, and the mirror list dates from November 2024.*

## Evidence

- **Failures on 2026-10-22.** "Install Playwright browsers" failed with exit 124 after both bounded apt phases timed out. On #1591 the step started at 11:13Z and 20:04Z, and its owner sessions report the same failure on #1593 in the afternoon and on #1595 in the evening. Each failed run on #1591 and #1593 passed when re-run; #1595's re-run was cancelled because a new head replaced it.
- **The failover ran and found nothing.** Both of #1591's failed runs logged "No Azure Ubuntu source was present; retrying the bounded apt phase once" before the retry timed out. Only #1591's logs were checked for that line.
- **The runner's layout.** GitHub's runner-image build script (`configure-apt-sources.sh` in `actions/runner-images`) writes three tab-separated lines to `/etc/apt/apt-mirrors.txt`: the Azure archive at priority 1, `https://archive.ubuntu.com/ubuntu/` at 2 and `https://security.ubuntu.com/ubuntu/` at 3. It points `ubuntu.sources` at that list. Those lines total 144 bytes, matching every `Mirrorlist [144 B]` read in both logs, after which apt fetched every index from `http://azure.archive.ubuntu.com/ubuntu`.
- **Why apt's own fallback did not help.** apt moves to the next mirror on an error or a timeout, not on low throughput. In the 20:04Z run nothing failed: the Azure mirror was slow, one 5.6 MB font package taking more than two minutes. In the 11:13Z run, fetches timed out about every 30 seconds (`Ign:`), and those packages never arrived, yet neither log shows a fetch from `archive.ubuntu.com`. Why apt did not move to the priority-2 mirror after those timeouts is not established; the fix does not depend on it.
- **The search.** `find_apt_source_files` matches `*.list` and `*.sources` only, and `fail_over_azure_archive_sources` rewrites only the files it returns.

## Impact

CI only, degraded with a workaround. A stalled mirror fails the required `test` job before any test runs. Each time, the cause has to be written on the pull request and the job re-run, about 20 minutes, and the shared E2E lane stays held meanwhile. Production code is unaffected.

## Options

1. **Follow `mirror+file:` references.** Read the mirror lists the sources name, and rewrite the Azure host in them as in source files. *Chosen:* it follows what apt itself reads and keeps the existing rule for source files.
2. **Also search `*.txt` under `/etc/apt`.** This is simpler, but it guesses at a file name rather than following the source, and it could rewrite unrelated files.
3. **Lengthen the timeouts.** A slow mirror stays slow, so this only makes each failure slower.
4. **Always use `archive.ubuntu.com`.** This gives up the Azure mirror's speed on every healthy run.

## Resolution (decided)

Option 1, test-first, in this record's pull request. The rewrite replaces the Azure host with `archive.ubuntu.com` in place, as for source files, rather than deleting the Azure line. The list then names `archive.ubuntu.com` at priorities 1 and 2, which apt accepts. Mirror lists are read before any source is rewritten, and a file the script cannot rewrite is left unchanged while the retry goes ahead.

## Verification

- [x] The test harness models the runner's layout, two stanzas naming one mirror list as `mirror+file:/path`, and fails before the change: the failover must rewrite the Azure host in the list, keep the list's inode and mode, leave the source unchanged, and log the archive retry. A `mirror+file:///path` row and the direct-source layout have their own cases (2026-10-22).
- [x] A source naming a missing mirror list, or a list the script cannot write, still retries and installs Chromium, and the healthy path leaves both the source and the list unchanged. Mutations that strip only `mirror+file://`, drop the list search, or remove either file guard each fail a test (2026-10-22).
- [ ] The next stalled install in CI retries through `archive.ubuntu.com` and passes without a re-run, or the due date passes with no stall and that is recorded.

## Related

- DEBT-471 added the failover; BUG-311 made its retry stop a leftover apt-get.
