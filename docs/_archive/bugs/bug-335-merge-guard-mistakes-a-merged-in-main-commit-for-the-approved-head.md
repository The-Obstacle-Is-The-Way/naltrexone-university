# BUG-335: The Merge Guard Mistakes a Merged-In `main` Commit for the Approved Head

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Resolved
**Priority:** P3
**Date:** 2026-10-10
**Resolved:** 2026-10-10
**Verification receipts:** #1456 merged through the guard at exact-head approval 5481035065; promoted in #1457 (`main` `4dde3ad6`), whose CI passed and whose production deploy answered healthy on 2026-10-10.

---

## Summary

`scripts/merge-reviewed-pr.ts` refused #1440, whose CodeRabbit approval should have carried to its new head. The new head only merged `main` in, changing no file. The guard chose the wrong commit as the approved head, compared the wrong diffs, and reported "The reviewable diff changed since the approved head". The failure is fail-closed: it refuses a legitimate merge and cannot pass a bad one.

## Evidence

- **The sequence (#1440, 2026-10-10).**
  1. Head `62874a39` was pushed; its check suites were created at 00:11:35Z.
  2. Promotion #1445 merged into `main` as `291b6476` at 00:39:03Z; its check suites, on branch `main`, were created at 00:39:05Z.
  3. CodeRabbit approved `62874a39` at 00:49:30Z (review 5476700929).
  4. `917ac631` merged `main` into the branch, with the same tree as `62874a39`, and was pushed at 00:52:40Z.
  5. GitHub repointed the approval to `917ac631`, as it does after a merge-only push.
- **The cause (read in code).** When the approval's commit is the current head, `readCarryEvidence` takes the approved head from `headPushedAsOf`: the PR commit whose earliest GitHub Actions check suite was created last before the approval. `291b6476` is one of the PR's commits once `main` is merged in. Its own suites ran on `main` at 00:39:05Z, after `62874a39`'s push and before the approval. So the guard took it for the approved head. The diff against `dev` at `291b6476` is not #1440's, so the carry failed.
- **When it happens.** A branch that merges `main` after a promotion, between CodeRabbit's approval and the merge, when the promotion's suites were created between the branch's previous push and the approval. Every branch must carry the latest promotion ([merge tooling](../../../AGENTS.md#how-to-check)), so this can recur after any promotion.

## Impact

A finished PR cannot merge until it spends another CodeRabbit review, the shared one-per-hour allowance, or waits until `dev` carries the promotion. After that, a merge of `dev` drops the `main` commit from the PR's commit list, and the guard picks the right head.

## Options

1. **Count only check suites that ran on the PR's head branch** (decided). The query asks for each suite's branch, and `headPushedAsOf` ignores suites on any other branch, so a commit that arrived from `main` has no push time in the PR. Test-first: the #1440 sequence above must carry to `917ac631`'s identical diff.
2. **Request a fresh review whenever this happens.** Rejected as the fix: it spends the shared allowance on an unchanged diff.
3. **Take push times from GitHub's timeline.** Rejected: ordinary pushes have no timeline event, and `pushedDate` is deprecated.

## Resolution

**Decided:** option 1, in its own pull request. Until it lands, merge `dev` into such a branch once `dev` carries the promotion; the guard then verifies the carry itself.

## Progress

**2026-10-10: built test-first.**
- The guard's query asks for each check suite's branch. `headPushedAsOf` counts only suites on the PR's head branch (`headRefName`).
- The shared test fixtures give each suite a branch, and `verify-promotion`'s source-PR fixture does too. It reads source PRs through the same query.
- **Proof against GitHub.** The patched guard, run read-only on #1440, carries approval 5476700929 from `62874a39` to `917ac631`, with no unresolved threads and the head carrying `main`. #1440 still merges through the checked-in guard, not this unreviewed one.

## Verification

- [x] A test of `headPushedAsOf` with #1440's sequence picks the earlier head, not the merged-in `main` commit; red before the change. *2026-10-10: `merge-reviewed-pr-carry.test.ts`, "ignores a merged-in commit's check suites from another branch".*
- [x] The guard carries #1440's approval when run against GitHub. *2026-10-10: read-only run, `carriedFrom` `62874a39`.*
- [x] Promoted to `main`. *2026-10-10: #1457, `main` `4dde3ad6`; `main`'s CI passed, and production's health checks answered 200 with the database up.* The carry is already proven on real data above: the read-only run used #1440's GitHub state with the same code this pull request merges. A later merge cannot be relied on for that proof, since branches now merge `main` before their review rather than after it.
