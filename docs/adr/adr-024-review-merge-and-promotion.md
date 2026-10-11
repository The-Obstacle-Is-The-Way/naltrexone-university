# ADR-024: Review, Merge and Promotion

**Status:** Accepted
**Date:** 2026-10-11, recording the owner's decisions of 2026-09-19 to 2026-10-09
**Decision Makers:** The owner. These rulings were written into `AGENTS.md` as dated paragraphs; ADR-023 moved decisions out of agent instructions, so they are recorded here with their dates, and `AGENTS.md` keeps only the rules.

---

## Context

The repository is public, the owner is its only human, and AI agents write and review most changes. Every agent session shares one CodeRabbit identity, and with it one review allowance. GitHub's rulesets can require checks and resolved threads, but they cannot require that CodeRabbit approved the exact commit that merges.

## Decision

1. **Feature PRs merge only with CodeRabbit's approval of the exact head (2026-09-22).**
   - `scripts/merge-reviewed-pr.ts` enforces it. It merges with `--match-head-commit` and posts its receipt on the PR first.
   - The merge button and a bare `gh pr merge` are not used.
2. **An approval carries across a sync that leaves the reviewable diff unchanged (2026-10-06).**
   - Merging `dev` or `main` into a branch does not need a new review if the PR's diff, `pnpm-lock.yaml` aside, has the same files and hunks as at the approved head.
   - A changed diff needs a fresh review.
3. **GitHub enforces what it can (2026-09-22).** The `main-and-dev-protection` ruleset requires:
   - a PR, the `test` check, an up-to-date branch and resolved threads;
   - merge commits only;
   - zero required approvals, since the owner is the only human (BUG-248);
   - no bypass actors.

   No one uses `--admin`, Force Promote or a ruleset bypass.
4. **Promotions prove their sources instead of being reviewed again.**
   - A `dev` → `main` promotion is titled `Promote #<source PRs>`, and CodeRabbit skips such titles (2026-10-04).
   - `scripts/verify-promotion.ts` proves each source PR's approval, the ancestry and the checks, writes the proof into the PR body, and merges the verified head (2026-09-22).
5. **CodeRabbit reviews only what can merge (2026-10-06).**
   - Incremental reviews are off, so a push starts none.
   - A PR stays a draft until the full gate passes, and a review is requested once its fixes are pushed together.
6. **Agents never ask CodeRabbit to record a learning (2026-10-09, DEBT-515).**
   - A learning CodeRabbit records anyway is linked from the PR description, and the merge guard refuses until it is.
   - New learnings wait 30 days for the owner, and a weekly issue lists them.
7. **Production waits for `main`'s CI (2026-09-19).** Vercel Deployment Checks hold a production build's domains until `main`'s `test` passes. Migrations run before that gate, so they stay compatible with the release still serving.

## Consequences

- **Gains:**
  - Nothing reaches `dev` unreviewed, and nothing reaches `main` without proof that its sources were reviewed.
  - The shared review allowance goes to code that can merge.
- **Costs:**
  - A review is the slowest step, so it paces the queue.
  - Sessions coordinate review slots.
  - A rate limit means waiting the full cooldown.

## Alternatives Rejected

- **Requiring a human approval in the ruleset.** The only human would be locked out of every merge.
- **Reviewing each promotion again.** It re-reviews approved content; during #984 that cost hours.
- **Automatic incremental reviews.** The heaviest PRs drew 4 to 12 review runs each, though only the final head's approval counts.
- **Trusting the green `CodeRabbit` status.** It can be green during a rate limit or with changes requested.

## Related

- [Review and Merge](../guides/release/review-and-merge.md): how the merge guard decides, and what to do in each failure.
- [Deployment Procedure](../guides/release/promote-to-production.md#8-promoting-dev-to-main): promotion and the production gate.
- [ADR-020](./adr-020-coverage-patch-gate.md): when the `codecov/patch` status blocks a merge.
- [ADR-023](./adr-023-documentation-organisation.md): why these decisions left `AGENTS.md`.
