# DEBT-491: The Reviewed-Merge Tool Lets `dev` Lose `main`'s Promotion History

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress
**Priority:** P3
**Date:** 2026-10-02
**Resolved:** —
**Verification receipts:** —

---

## Summary

Every `dev` → `main` promotion adds a merge commit that only `main` has. The next feature PR into `dev` must contain it. Otherwise `dev` no longer contains `main`, and the following promotion cannot be verified. `scripts/merge-reviewed-pr.ts` does not check this, so the mistake surfaces only at promotion time. There, `scripts/verify-promotion.ts` refuses it, correctly but a whole review cycle late, and the only repair is another feature PR that merges `main` into `dev`.

## Evidence

- **2026-09-23.** #1046 was rebased onto `dev`, not `main`, so `dev` lacked main's #1045 merge commit. Promotion #1047 was BEHIND and was closed unmerged; the next increment carried `origin/main` (recorded in [DEBT-472](../_archive/debt/debt-472-test-double-fidelity-and-contract-discipline.md), "2026-09-23 UTC #1046 merge and promotion note").
- **2026-10-02.** #1313 and #1314 were based on `origin/dev` after promotion #1312, so `dev` lacked `7dcb9331`. `verify-promotion` refused promotion #1315 (`git merge-base --is-ancestor 7dcb9331 4deedde7` failed). #1316 merged `origin/main` into `dev` (a no-op merge) before promotion #1317 could proceed.
- **No escape at promotion time, by design.** The `main` ruleset requires an up-to-date branch. `verify-promotion` requires the base to be an ancestor of the head, and every first-parent merge in between to map to exactly one reviewed source PR. So GitHub's "Update branch" back-merge, which has no PR, cannot repair it.
- **The gap.** `checkFeatureMerge` checks state, approval, threads and checks, but not ancestry. The only earlier guard is an operator's untracked pre-push script, which no other contributor runs.

## Impact

Each recurrence costs a closed promotion, a repair PR with its own gate and review, and another promotion: about two hours. Nothing reaches production wrongly; the cost is delay and churn. The rule exists in memory and in a dated note, but recurred anyway. A rule that depends on remembering it is not a control.

## Options

1. **Document the rule more prominently.** Rejected as the fix: it was already written down, and recurred.
2. **Have the merge tool refuse the merge (chosen).** Before merging a PR into `dev`, the tool reads `main`'s head and asks GitHub's compare API whether `dev`'s head or the PR's head contains it (`behind_by` is 0). If neither does, merging would leave `dev` without `main`'s promotion history, so it refuses. The error names the fix: base the branch on `origin/main`, or merge `origin/main` into it. This catches the mistake at the first feature merge after a promotion, a cycle earlier, using the same tool every feature merge already goes through.
3. **Merge `main` into `dev` automatically after each promotion.** Rejected: that is the back-merge without a reviewed PR that `verify-promotion` deliberately refuses.

## Resolution

1. Red tests first:
   - the decision refuses when neither `dev` nor the PR head contains `main`, and accepts either;
   - the command reads the ancestry before posting its receipt, and never merges after a refusal.
2. `merge-reviewed-pr.ts` reads `main`'s head, checks `dev` first and then the PR head, and records which one carries `main` in its receipt.
3. AGENTS.md's description of the command says it refuses a merge that would leave `dev` without `main`.

## Verification

- A feature merge whose head and `dev` both lack `main`'s head is refused, before the receipt is posted and with no merge call.
- A merge is accepted when `dev` contains `main`, and when only the PR head does, as in a repair PR.
- Removing the refusal fails a case.

## Related

- [`scripts/merge-reviewed-pr.ts`](../../scripts/merge-reviewed-pr.ts) and [`scripts/verify-promotion.ts`](../../scripts/verify-promotion.ts)
- [AGENTS.md: How to Check](../../AGENTS.md#how-to-check)

## Fix — 2026-10-02

Implemented as option 2, in the same change as this record:
- `checkCarriesMain` decides, and `readMainAncestry` reads GitHub's compare API: `main...<head>`, then `<main sha>...dev` only if the head lacks `main`.
- The check runs in both the dry run and `--merge`, before the receipt is posted. The receipt records `carriesMain: "head"` or `"dev"`.

**Tests**, in `scripts/merge-reviewed-pr.test.ts`, red first:
- three decision cases;
- a refusal that posts no receipt and makes no merge call;
- acceptance when only `dev` carries `main`, compared with the same `main` commit;
- the existing command cases now include the compare call in their sequences.

**Mutations.** Removing the refusal fails two cases, and so does removing the `dev` fallback.

**Live check.** `gh api .../compare/main...dev` returned `behind_by: 1` on 2026-10-02, after promotion #1317: that is exactly the state this guard refuses to extend.

The record resolves once this is released.

