# DEBT-505: lint-staged Can Stage Another Session's Work

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — lint-staged held at 17.5.1; safe upgrade requires a tested safeguard or enforced worktree isolation
**Priority:** P2
**Date:** 2026-10-06
**Resolved:** —
**Verification receipts:** [PR #1409](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/1409)

## Summary

lint-staged 17.6.0 stages changes to all tracked files modified while its tasks run, including paths that were not staged initially and do not match its task globs. In this repository, concurrent sessions share a clone. Another session's edit during the pre-commit hook can therefore enter the current commit without being selected or reviewed by its author.

The existing Biome task only writes the supplied staged paths. That does not protect unrelated paths: lint-staged compares the working-tree diff before and after its tasks and stages every path whose diff changed.

## Evidence

- Upstream: [lint-staged/lint-staged#1854](https://github.com/lint-staged/lint-staged/pull/1854), shipped in 17.6.0.
- Repository entry point: `.husky/pre-commit` runs `pnpm exec lint-staged`.
- Repository task: `*.{js,jsx,ts,tsx,mjs,cjs,json}` runs `biome check --write --no-errors-on-unmatched`.
- Independent reproduction on 2026-10-06 used the published 17.5.1 and 17.6.0 packages in separate disposable Git repositories, with that exact task configuration and the installed Biome executable.

Reproduction sequence:

1. Commit `a.ts` and `notes.md` as fixture files, then stage a change only to `a.ts`.
2. Leave an earlier unstaged edit in the tracked `notes.md`.
3. Start lint-staged. A wrapper pauses the Biome command at task entry, then delegates its unchanged arguments to the real Biome executable.
4. While the task is paused, a separate process appends another session's edit to `notes.md`, then releases Biome. The Biome task itself never writes that Markdown file.
5. Compare `git diff --cached --name-only` and `git diff --cached -- notes.md` before and after the hook.

| Version | Exit | Initially staged | Staged after completion | `notes.md` staged diff |
|---|---:|---|---|---|
| 17.5.1 | 0 | `a.ts` | `a.ts` | Empty |
| 17.6.0 | 0 | `a.ts` | `a.ts`, `notes.md` | Both the earlier unstaged edit and the concurrent edit |

The 17.6.0 receipt included:

```diff
 base
+pre-existing unstaged edit
+concurrent session edit
```

This proves an unrelated-path regression. It does not establish that 17.5.1 makes concurrent edits to the same staged path safe.

## Containment

PR #1409 holds the generated lockfile at 17.5.1 without changing the manifest's existing range. The dev-targeted npm version-updates entry in `.github/dependabot.yml` ignores `lint-staged` versions `>=17.6.0` so the next weekly bundle does not reintroduce the race. The separate security-updates entry is unchanged.

The hold is temporary. No pre-commit safeguard or repository-wide worktree-isolation enforcement is implemented by this record.

## Exit Paths and Ignore Removal

Complete either path before removing the Dependabot ignore:

1. **A tested pre-commit safeguard.** Capture the staged paths before lint-staged runs and abort the commit if lint-staged stages a path outside that set. Reproduce the concurrent edit above, prove the commit fails, and prove both sessions' working changes are preserved. Include paths outside the task globs and partially staged files in the tests.
2. **Enforced isolated worktrees.** Every agent writes and commits in its own worktree; no concurrent sessions edit one worktree. Document and enforce that operating rule, including existing shared-clone workflows. An isolated worktree used for one upgrade is not sufficient evidence that all sessions are isolated.

Once one path is verified, remove the `>=17.6.0` ignore in the reviewed upgrade PR, regenerate the lockfile with pnpm under the unchanged release-age and trust policies, and pass the full local gate including E2E. Obtain exact-head CodeRabbit approval. Archive this record only after the chosen protection and upgrade are shipped and promoted, following the archive convention.

## Verification

- [x] Two-version reproduction distinguishes the unrelated-path behavior.
- [ ] One exit path is implemented and verified for all affected workflows.
- [ ] The reviewed upgrade removes the ignore and passes the full gate.
- [ ] The protection and upgrade are promoted to `main` with receipts.
