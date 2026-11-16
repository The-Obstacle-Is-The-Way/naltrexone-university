# DEBT-514: lint-staged Can Stage Another Session's Work

**Status:** Open — replace lint-staged with a read-only `biome check --staged` pre-commit hook (option 5, owner 2026-11-15), red first; the 17.5.1 hold stays until it ships
**Priority:** P2
**Date:** 2026-10-06

---

## Summary

The pre-commit hook (`.husky/pre-commit:3`) runs lint-staged, whose one task
(`package.json:59-63`) runs `biome check --write` on the staged files matching
`*.{js,jsx,ts,tsx,mjs,mts,cjs,json}`, then stages the result. Sessions share
clones here, so whatever lint-staged stages can include another session's edit:

- **From 17.6.0** it stages every tracked file whose working-tree diff changed
  while its tasks ran, even unstaged paths outside its globs. Another session's
  edit made during the hook enters the commit.
- **On 17.5.1 too,** it re-stages each initially staged file after its tasks,
  so another session's concurrent edit to one of those files enters the commit.

PR #1409 holds 17.5.1: `package.json:115` pins `~17.5.1`, and the `dev`
version-updates entry in `.github/dependabot.yml:22-26` ignores `>=17.6.0`.
Security updates use a separate entry and would still open. The ignore's
comment (:22-24) cites this record's "Exit Paths" section, which the record no
longer has; option 5's change deletes the ignore and its comment.

## Evidence

- **Reproduction (2026-10-06 and 07),** in disposable repositories with this
  task and the installed Biome, a wrapper pausing Biome while another process
  edited a file:

  | Case | 17.5.1 | 17.6.0 |
  |---|---|---|
  | Unrelated `notes.md` edited during the hook | stays unstaged | staged, with an earlier unstaged edit too |
  | Staged `a.ts` edited during the hook | concurrent edit staged | same |

  All runs exited 0, so nothing told the committer.
- **Upstream.** lint-staged/lint-staged#1854 shipped the change in 17.6.0.
  lint-staged/lint-staged#1865, open since 2026-10-30, reports this race; the
  maintainer suggested staging only the originally staged files, as before
  17.6.0. 17.6.1 (2026-11-15) changes only a warning (#1869); no release fixes it.
- **A hook that cannot stage.** Biome 2.6.6, installed, has `check --staged`
  ("Checks only staged files"), and `biome.json` enables Git integration. It
  takes only the staged paths from git (`--name-only`, in the binary's strings)
  and checks each path's working-tree copy, not its staged contents. Biome's
  git-hooks recipe (https://biomejs.dev/recipes/git-hooks) guards against this:
  its hook fails "if staged files have unstaged changes". Run without
  `--write`, Biome changes neither the index nor the working tree.

## Impact

A commit can carry another session's unreviewed edit under the wrong author's
message and review, and reach `dev` without anyone choosing it. The hold removes
only the 17.6.0 regression; the same-file case remains.

## Options

1. **Take 17.6+ with `--hide-unstaged`.** It would hide every session's
   unstaged edits from the working tree while the hook runs. Untested; not
   adopted.
2. **Hold 17.5.1.** In place since PR #1409. It keeps the same-file risk and
   the version hold.
3. **A path-set safeguard:** abort if lint-staged staged a path outside the
   initial set. It covers unrelated paths only.
4. **Isolated worktrees for every session.** Contradicts the shared-clone
   practice in `AGENTS.md`.
5. **Replace lint-staged with a read-only hook** that refuses a staged path
   with unstaged changes, then runs
   `biome check --staged --no-errors-on-unmatched`. A hook that writes nothing
   can stage nothing, on any version, so both cases close. A commit with Biome
   errors still fails; its author runs `pnpm exec biome check --write --staged`
   and stages their own paths. It deletes the dependency, its `package.json`
   block, `tests/lint-staged-config.test.ts`, the Dependabot ignore, the line in
   `docs/guides/dependencies/updating-dependencies.md:223` and the
   `lint-staged` entry in `scripts/watchers/upstream-advisory-watch.mts:52`.

## Resolution (decided)

Option 5, decided by the owner on 2026-11-15; option 2's hold stays until it
ships. It removes the risk at its root, with less machinery than any other
exit: a hook that writes nothing can stage nothing, on any version.
`.husky/pre-commit` first refuses the commit, naming the paths, when any path
is in both `git diff --name-only` and `git diff --cached --name-only`, since
`--staged` would check the working-tree copy rather than what is committed.
Then it runs `biome check --staged --no-errors-on-unmatched`. Commits no
longer auto-fix; authors run `biome check --write --staged` and stage their own
paths. A test replaces the deleted config test and pins both behaviors: the
hook refuses a staged path with unstaged changes before Biome runs, and it runs
`biome check --staged` without `--write` and never `lint-staged`. It fails
first against today's hook.

## Verification

- [x] A two-version reproduction separates the unrelated-path behavior
      (2026-10-06).
- [x] The owner chose option 5 (2026-11-15).
- [ ] Option 5: the hook test fails, then passes; a commit is refused when a
      staged path also has unstaged changes, and when a staged file has a Biome
      error; an edit made by another process during the hook stays unstaged.

## Related

- [Dependency update protocol](../guides/dependencies/updating-dependencies.md#dependabot-config-policy): the Dependabot ignore.

Corrected 2026-11-15: the task glob includes `mts`; 17.6.1 fixes nothing here, and upstream tracks the race as lint-staged#1865; added option 5, a read-only Biome hook; `--staged` checks working-tree copies, so the hook first refuses a staged path with unstaged changes, as Biome's git-hooks recipe does, and the test pins both; the Dependabot comment's dangling "Exit Paths" citation is noted; the retired archive step is gone. The full reproduction tables are in git at 34d9aea0.
