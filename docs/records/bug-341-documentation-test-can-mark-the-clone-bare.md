# BUG-341: A Documentation Test Run From a Worktree's Pre-Push Hook Marks the Clone Bare

**Status:** Verifying — promotion to `main`; due 2026-10-19
**Priority:** P2
**Date:** 2026-10-12

---

## Summary

`tests/documentation-records.test.ts` runs `git init` in a temporary fixture to check that the documentation audit skips git-ignored files. It cleared only the git config variables and kept every other inherited `GIT_*` variable. When a worktree's pre-push hook runs the unit tests, git exports `GIT_DIR` set to the worktree's directory inside the clone, `.git/worktrees/<name>`. The fixture's `git init` then re-initializes that repository instead of the fixture. That path does not end in `.git`, so git guesses the repository is bare and writes `core.bare = true` into the clone's shared `.git/config`. From then on, every git command that needs a work tree fails in the clone's main folder, with "must be run in a work tree", until someone resets the setting.

*Corrected 2026-10-13: the main folder breaks, not every worktree. In a sandbox (git 2.54), a hook run by a push from the main folder had no `GIT_DIR`, and nothing broke. A push from a linked worktree marked the repository bare: the main folder then refused work-tree commands, while the linked worktree kept working.*

## Evidence

- **Found in use.** Another session pushed from a linked worktree at 22:25:59Z on 2026-10-12. Its clone came out with `core.bare = true`, and the session reset it. In a sandbox it reproduced the cause: `GIT_DIR` set to a linked worktree's directory sets the flag, and a plain `.git` does not.
- **Reproduced red here.** The new test makes an outer repository with a linked worktree, stubs `GIT_DIR` to the worktree's directory, and runs the fixture. Before the fix the outer repository's `core.bare` reads `true`.
- **Introduced by #1471** (commit cc056b55, promoted by #1474). The fixture landed with the git-ignore check.
- **The only unsafe site.** A sweep of every test and script that starts git found three test files. `scripts/lockfile-union-git.test.ts` already removes inherited `GIT_*` variables (`isolatedGitEnv`) and has its own test for a hook's `GIT_DIR`. `tests/clerk-backend-api-boundary.test.ts` only runs `git ls-files` on this repository.

## Impact

It affects any session or person who pushes from a linked worktree while the pre-push hook runs the unit tests, which include this test on any branch that has #1471 but not this fix. Through the shared config, it then affects everyone working in that clone's main folder. No commits or files are lost; git refuses to work until `git config core.bare false` is run. Production is unaffected.

## Options

1. **Remove every inherited `GIT_*` variable for the fixture's git commands,** as `scripts/lockfile-union-git.test.ts` already does. *Chosen:* the test then behaves the same from a hook, a terminal or CI.
2. **Point only `GIT_DIR` at the fixture.** That leaves `GIT_WORK_TREE` and `GIT_INDEX_FILE` free to redirect the audit's own git commands.
3. **Remove `GIT_*` in the pre-push hook or Vitest's setup for every test.** That covers tests not yet written, but a test would then be correct only when run through that one entry point. Every test that starts git in this repository now isolates itself.

## Resolution (decided)

Option 1. Before the fixture runs, the test removes every inherited `GIT_*` variable with `vi.stubEnv(name, undefined)`, so `vi.unstubAllEnvs()` restores them afterwards. The new test checks that the repository a hook's `GIT_DIR` names is left non-bare, and that the audit still skips the ignored file.

## Verification

- [x] The new test fails without the fix (`core.bare` reads `true`) and passes with it. It fails again when the removal is narrowed to no variables (2026-10-12).
- [x] The file passes with `GIT_DIR` set to this clone's `.git` in the environment, and the clone stays non-bare (2026-10-12).
- [ ] Promoted to `main`.

## Related

- BUG-339: the other fix to the documentation guard's tests this week.
- DEBT-518 owns the documentation guard.
