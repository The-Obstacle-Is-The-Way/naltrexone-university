# BUG-366: The Playwright Install's Mirror Failover Misses the Runner's Mirror List

**Status:** Open
**Priority:** P3
**Date:** 2026-10-22

---

## Summary

When CI's Playwright dependency install stalls, `scripts/ci/install-playwright-chromium.sh` is meant to retry through `archive.ubuntu.com` instead of the Azure mirror (DEBT-471). GitHub's Ubuntu runners no longer name that mirror in an apt source file. `ubuntu.sources` points at a mirror list, `mirror+file:/etc/apt/apt-mirrors.txt`, and the list names `azure.archive.ubuntu.com`. The failover searches only `*.list` and `*.sources` files, so it finds no Azure mirror and retries through the same slow one. A stall then fails CI's required `test` job with exit 124 before any browser or E2E test runs.

## Evidence

- **Failures on 2026-10-22.** "Install Playwright browsers" failed with exit 124 after both bounded apt phases timed out, on #1591 at 11:13Z and 20:04Z and on #1593 at about 13:42Z. Each passed on its one re-run. #1595 failed the same step at about 21:00Z, and its re-run was cancelled because a new head replaced it.
- **The failover did not apply.** Both of #1591's failed runs logged "No Azure Ubuntu source was present; retrying the bounded apt phase once" before the retry timed out.
- **Where the runner names the mirror.** In the same step, apt reads `file:/etc/apt/apt-mirrors.txt` ("Mirrorlist") and then fetches every index and package from `http://azure.archive.ubuntu.com/ubuntu`. In the 11:13Z run, packages from that host arrived only after 30-second waits (`Ign:` lines). No `*.list` or `*.sources` file names the Azure host, because the script found none, so the host comes from that mirror list. This is inferred from the logs; the runner image was not inspected directly.
- **The search.** `find_apt_source_files` matches `*.list` and `*.sources` only, and `fail_over_azure_archive_sources` rewrites only the files it returns.

## Impact

CI only. A stalled mirror fails the required `test` job before any test runs. Each time, the cause has to be written on the pull request and the job re-run, about 20 minutes, and the shared E2E lane stays held meanwhile. Production code is unaffected.

## Options

1. **Follow `mirror+file:` references.** Read the mirror lists the sources name, and rewrite the Azure host in them as in source files. *Chosen:* it follows what apt itself reads and keeps the existing rule for source files.
2. **Also search `*.txt` under `/etc/apt`.** This is simpler, but it guesses at a file name rather than following the source, and it would rewrite unrelated files.
3. **Lengthen the timeouts.** A stalled mirror stays stalled, so this only makes each failure slower.
4. **Always use `archive.ubuntu.com`.** This gives up the Azure mirror's speed on every healthy run.

## Resolution (decided)

Option 1, test-first, in this record's pull request.

## Verification

- [ ] A harness whose source names a mirror list fails before the change and passes after it: the failover rewrites the Azure host in the list, keeps the list's inode and mode, and logs the archive retry.
- [ ] The next stalled install in CI retries through `archive.ubuntu.com` and passes without a re-run.

## Related

- DEBT-471 added the failover; BUG-311 made its retry stop a leftover apt-get.
