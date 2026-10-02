# DEBT-491: The Reviewed-Merge Tool Lets `dev` Lose `main`'s Promotion History

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Resolved — 2026-10-02; the reviewed-merge tool refuses a merge that would leave `dev` without `main`'s promotion history, promoted and release-verified, with its tests re-run on `main`'s code before archival
**Priority:** P3
**Date:** 2026-10-02
**Resolved:** 2026-10-02
**Verification receipts:** [Verified closeout](#verified-closeout--2026-10-02-utc)

---

## Summary

Every `dev` → `main` promotion adds a merge commit that only `main` has. The next feature PR into `dev` must contain it. Otherwise `dev` no longer contains `main`, and the following promotion cannot be verified. `scripts/merge-reviewed-pr.ts` does not check this, so the mistake surfaces only at promotion time. There, `scripts/verify-promotion.ts` refuses it, correctly but a whole review cycle late, and the only repair is another feature PR that merges `main` into `dev`.

## Evidence

- **2026-09-23.** #1046 was rebased onto `dev`, not `main`, so `dev` lacked main's #1045 merge commit. Promotion #1047 was BEHIND and was closed unmerged; the next increment carried `origin/main` (recorded in [DEBT-472](./debt-472-test-double-fidelity-and-contract-discipline.md), "2026-09-23 UTC #1046 merge and promotion note").
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
2. `merge-reviewed-pr.ts` reads `main`'s head and checks the PR head first, then `dev` only when the PR head lacks `main`. It records which one carries `main` in its receipt.
3. AGENTS.md's description of the command says it refuses a merge that would leave `dev` without `main`.

## Verification

- A feature merge whose head and `dev` both lack `main`'s head is refused, before the receipt is posted and with no merge call.
- A merge is accepted when `dev` contains `main`, and when only the PR head does, as in a repair PR.
- Removing the refusal fails a case.

## Related

- [`scripts/merge-reviewed-pr.ts`](../../../scripts/merge-reviewed-pr.ts) and [`scripts/verify-promotion.ts`](../../../scripts/verify-promotion.ts)
- [AGENTS.md: How to Check](../../../AGENTS.md#how-to-check)

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

**Boundary: early detection, not a lock.** The check reads `main` before the merge. If a promotion merged into `main` between that read and the merge itself, the check would describe the older `main`. That needs a promotion and a feature merge to run at the same moment. Here they are run one after the other by the same operator, but nothing in the repository enforces that. If it ever happened, the outcome is the state before this fix: `verify-promotion` refuses the next promotion, and a repair PR follows. `verify-promotion` remains the enforcement and fails closed. A cross-workflow lock would add a shared mutable resource to guard a window that already fails safe, so none is added.

## Verified closeout — 2026-10-02 UTC

| Verification | Holds | Receipt |
| --- | --- | --- |
| A merge whose head and `dev` both lack `main`'s head is refused, before the receipt and with no merge call | Yes | `scripts/merge-reviewed-pr.test.ts`: *refuses a merge that would leave dev without main's promotion, before any receipt*; *refuses when neither the PR head nor dev contains main* |
| Accepted when the PR head contains `main`, and when only `dev` does | Yes | *accepts a PR head that contains main*; *accepts a dev that already contains main*; *accepts a PR whose head lacks main when dev contains it, comparing against the same main* |
| Removing the refusal fails a case | Yes | Removing the refusal fails two cases, and so does removing the `dev` fallback (recorded on the fix's head) |
| Live | Yes | #1318's own merge receipt recorded `"carriesMain":"head"` |

The 54 cases were re-run on `main`'s code before archival: this branch is based on `main` at `2f3996a7`.

**Increment.** #1318 (**5394600462** on `ec0c3fcd`, no actionable findings; merged `077981a9`). One finding was fixed (the check order), and one was declined with the boundary now stated (a lock).

**Release.** Promotion #1319 (`2f3996a7`, merged **17:32:58Z** after a passing `verify-promotion` receipt): main CI **37041458745** `test` passed **17:46:40Z**, production assigned **17:46:42.975Z**, trees `b73fea24`, healthy production.

