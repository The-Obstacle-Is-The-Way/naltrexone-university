# Review and Merge

How a feature PR gets reviewed and merged into `dev`. The rules are in [`AGENTS.md`](../../../AGENTS.md#pull-requests-and-review). The decisions behind them are in [ADR-024](../../adr/adr-024-review-merge-and-promotion.md). Promotions to `main` are in [the deployment procedure](../../dev/deployment-procedure.md#8-promoting-dev-to-main).

## Before Review

- **Open the PR as a draft** with `gh pr create --draft`. CodeRabbit skips drafts, and a PR opened ready spends a review at once.
- **Sync with `dev`** before requesting a review. `dev` is strict up to date, so a merge into `dev` after your approval means another sync.
- **Base a branch made after a promotion on `origin/main`,** or merge `origin/main` into it. The merge guard refuses a merge that would leave `dev` without `main`'s latest promotion merge commit.
- **Pass the full gate on the exact head you push.** Then wait for CI's `test` to succeed before asking for a review.

## The Review Allowance

- **One allowance for every agent.** CodeRabbit's included allowance is metered per developer identity, and every agent session shares one. The rolling allowance depends on the account’s plan and recent use ([rate limits](https://docs.coderabbit.ai/management/rate-limits)). Coordinate the next review with the owning session using the latest provider cooldown receipt; do not assume that the top of the hour resets it. A locally green stack does not reserve a review slot.
- **When CodeRabbit reviews.** `.coderabbit.yaml` sets `auto_incremental_review: false`, so a push starts no review. CodeRabbit reviews by itself when a PR opens ready or a draft is marked ready; otherwise only when asked with `@coderabbitai full review`.
- **Fix in one push.** Push every fix together, then request the review. Do not move a PR back to draft and ready again.
- **Avoid force-pushes and rebases.** Its FAQ lists them as review events, so they may spend a review.
- **Dependabot spends nothing.** CodeRabbit skips bot authors and reviews their PRs only when asked.

## Reading Findings

- **A finding is a claim, not an order.**
  - A valid, in-scope issue that weakens a required property: fix it.
  - Something technically possible but outside the documented threat model or invariant: reject it with a receipt showing that no property is weakened.
  - A false positive: reply with the receipt that disproves it.
- **Reply after you push the fix,** not before. A reply to a pending finding can lead to a silent full review on the old head.
- **Guards and scanners.** Before implementing a suggestion against a policy scanner, CI guard or test guard:
  - tie it to that guard's stated invariant and threat model with a failing or reachable receipt;
  - do not let a Minor or Trivial suggestion expand scope by itself;
  - if a candidate cannot be classified, fail closed by reporting a violation;
  - widen a resolver only when a governing requirement names the behaviour, or a false positive in the current tree blocks legitimate work.
- **Learnings.** CodeRabbit can turn a chat reply into a stored rule for every later review. Never ask it to record one. If it records one anyway ("Learnings added"), link that reply from the PR description; the merge guard refuses until you do.
- **A finding that rests on a stored learning** contradicting the repository's rules is declined, quoting the "Learnings used" entry. The rule then goes into `.coderabbit.yaml`'s path instructions, which outrank stored learnings, and the learning goes on DEBT-515's prune list.
- **A rate limit is a hard stop.** Wait the full cooldown, then ask for a fresh review of the latest head. A green `CodeRabbit` status, a partial review or an acknowledgement is not an approval.

## The Merge Guard

```bash
pnpm exec tsx scripts/merge-reviewed-pr.ts <PR>          # read-only
pnpm exec tsx scripts/merge-reviewed-pr.ts <PR> --merge  # re-reads GitHub, then merges
```

It merges only when all of these hold:
- **The approval is on the current head,** and was submitted after that head was pushed. Push time is dated from the head's earliest GitHub Actions check suite.
- **Or the approval carries from an earlier head.** The approved head is the PR head pushed most recently at or before the approval. GitHub's compare API must show the same files, statuses, rename sources and hunks at both heads, `pnpm-lock.yaml` aside. A hunk may move only by the lines `dev`'s own edits added or removed above it. This covers a sync with `dev` or `main` and a lockfile-only Dependabot rebase, and the receipt names the approved head as `carriedFrom`.
- **Threads, checks and state:**
  - no unresolved threads;
  - CI's `test` and `codecov/patch` succeeded. A missing `codecov/patch` blocks, except when every changed file is in paths coverage never measures (ADR-020): `package.json`, `pnpm-lock.yaml`, `.github/`, Markdown, `.coderabbit.yaml` and `codecov.yml`;
  - every check green, and the PR clean, mergeable and not a draft.
- **`main`'s head is in the PR head or already in `dev`.** This catches a missing promotion merge early. It is not a lock: `verify-promotion` still enforces it.
- **Every recorded learning is linked** from the PR description.

With `--merge`, it posts its receipt (the SHA and review ID) on the PR, then merges with `--match-head-commit`, so a later push cannot substitute unreviewed code. Incomplete thread or check data fails closed, and there is no override flag.

**A stale approval.** After a push, CodeRabbit's only approval may stay on the previous head, and it does not re-approve while that approval stands. If the merge guard does not carry it:
1. Dismiss the stale approval with a comment citing this procedure. Never dismiss an unaddressed finding.
2. Comment `@coderabbitai full review`. `@coderabbitai review` refuses in this state with "Already reviewed the last commit".

GitHub also repoints an approval to a head that only merged `dev` or `main` in. The guard treats that as a carried approval, never as a review of the new head.

**What the guard can miss.**
- A push that lands while CodeRabbit is still reviewing could be mistaken for the reviewed head.
- A check suite created earlier for the same commit, anywhere in the repository, dates the push earlier.

## When `codecov/patch` Is Missing

**A Codecov outage.** The upload fails, and the job shows a "Codecov upload failed" warning.
1. Confirm the cause from the upload step's log or from Codecov's hosts.
2. Record it on the PR before any re-run.
3. A change to measured code waits for Codecov; a change confined to unmeasured paths merges under [ADR-020](../../adr/adr-020-coverage-patch-gate.md)'s exemption, which the guard applies.
4. After recovery, re-run CI once.

**A dropped notification.** The upload succeeded and Codecov's API lists it as processed, but no status posted. CI's "Send Codecov notifications" step retries near the end of the job. If the status is still missing about five minutes after the job, record that on the PR and re-run CI once (DEBT-510).

## Re-Running CI

Re-run a failed CI run once at most. Before the second run, record the failure's cause on the PR.
