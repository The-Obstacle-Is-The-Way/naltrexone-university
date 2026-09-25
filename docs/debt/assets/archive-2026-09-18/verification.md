# Debt archive audit — 2026-09-18

Baseline: `origin/dev` `a35e9215`, `origin/main` `fd45fdf4`; both trees
`e01cfedb4828675003d8f20df61aef6df10e2f72`. There were 18 debt records
beside the index, 13 Active rows, and no open PRs. This is a filing pass,
not a new implementation or a legal-compliance determination.

## Dispositions

The receipts below were re-derived from this tree and GitHub, not inferred
from the Status lines. Source line numbers refer to the baseline above.

| Record | Claim / verdict | Evidence and disposition |
|---|---|---|
| [DEBT-463](../../../_archive/debt/debt-463-legal-page-redesign.md) | Archive resolved — CONFIRMED | #764 merged as `c0ebbe4c`, an ancestor of main. The legal renderer and mirror tests remain. Production `/terms` and `/privacy` return 200 at both widths checked; Terms still shows August 9, while Privacy correctly shows its later September 16 revision. The old Privacy date is historical, not today's claim. |
| [DEBT-466](../../../_archive/debt/debt-466-checkout-idempotency-replay-chain-exhaustion.md) | Archive resolved — CONFIRMED | #791 `83873d6b` and structural follow-up #804 `9aae4437` are ancestors of main. `stripe-checkout-sessions.ts:30-46` retains the bounded scan and separate ten-rung limits; `stripe-checkout-sessions-recovery.test.ts:260,299,329` pins deep replay and exact boundaries. |
| [DEBT-467](../../../_archive/debt/debt-467-trial-setup-checkout-stale-session-url-replay.md) | Archive resolved — CONFIRMED, with explicit limit | #793 `1384ba5d` is an ancestor of main. Setup uses `require-verified-status` at `stripe-checkout-sessions.ts:328,355`, with strict failures at `:715-750` and the setup-live-retrieve suite. The unchecked hosted completed-URL observation is explicitly optional under Resolution 6; it has not been silently checked off. |
| [DEBT-470](../../../_archive/debt/debt-470-checkout-replay-tail-jump.md) | Archive resolved — CONFIRMED | #804 `9aae4437` is an ancestor of main. The unique-tail scan and fallback remain at `stripe-checkout-sessions.ts:139,1115`; the 13-terminal test at `stripe-checkout-sessions-tail-jump.test.ts:109-111` remains and passes. |
| [DEBT-471](../../../_archive/debt/debt-471-e2e-ci-external-fragility.md) | Archive resolved — CONFIRMED | #816 `e3e51d8b`, #817 `05a08fb6`, and hosted CVC repair `be7d81bd` are ancestors of main. `playwright.config.ts:20-47` preserves one worker, non-opening reporter, and disjoint required/hosted projects. The installer remains bounded; the E2E Stripe client retains 15-second requests/one retry. F7 is an explicit no-action disposition. The hosted workflow run `35351664935` is green; required provider success-sync proof remains separate from hosted DOM proof. |
| [DEBT-477](../../../_archive/debt/debt-477-landing-page-copy-and-cohesion.md) | Archive resolved — CONFIRMED | #904 `6c923683` and final D2 #912 `f7ec2cb0` reached main; promotion #913 is `fd45fdf4`. Current production measurements below match the shipped layout, and deployed pricing scripts contain both sentence-case labels and neither old label. Authenticated casing is an explicitly separate follow-up seed, not unfinished signed-out work. |
| [DEBT-478](../../../_archive/debt/debt-478-pricing-plan-consent-dialog.md) | Everything resolved — REFUTED; shipped scope resolved — CONFIRMED | #905 `bc1deb61` / #906 `09a45af6` are ancestors of main. The dialog, shared consent data, required `expectedOffer` controller schema (`billing-controller.ts:42-45`) and mismatch rejection (`create-checkout-session.ts:142-150`) remain. Hosted specs still assert retained consent through signed local event delivery. **D7 is deferred**, not shipped; it receives its own Deferred row with a revive trigger. No production checkout or email delivery is claimed by this archive audit. |
| [DEBT-337](../../../_archive/debt/debt-337-future-feedback-enhancements.md) | Defer, not resolve — CONFIRMED | The scope and acceptance criteria explicitly park independent enhancements until prioritized. No implementation is claimed. Revive on an owner-prioritized named enhancement or direct-URL inconsistency. |
| [DEBT-464](../../../_archive/debt/debt-464-web-analytics-activation.md) | Defer, not resolve — CONFIRMED | The August 11 owner ruling and Step 0 require Pro plus authorization before activation. The app has no analytics integration and none of the four production pages checked embeds its script. This audit does not claim a fresh Vercel plan/account or historical event census. Revive when the owner addresses the first-real-users/earlier-authorization trigger and rechecks the prerequisites. |
| [DEBT-414](../../debt-414-public-legal-pages-privacy-terms.md) | Keep active — CONFIRMED | Current acceptance checklist `:543-550` remains open; GitHub issues #902 and #903 remain open for licensed review and engineering/operational evidence. Privacy publication is verified, but it does not satisfy those remaining obligations. |
| [DEBT-465](../../debt-465-test-quality-practices-adoption.md) | Keep active — CONFIRMED | Part 1's `scripts/crap-report.ts` exists; Parts 2–4 at `:32-49` are not complete. No Stryker configuration or acceptance driver has landed. Metrics remain observational. |
| [DEBT-468](../../debt-468-test-estate-coverage-and-fixture-debt.md) | Keep active — CONFIRMED | Parts 2–4 and fixture migrations remain open; the current tree still contains hand-rolled Stripe/Drizzle doubles. Its stale historical coverage/skip descriptions are not treated as new measurements. DEBT-472 owns the re-scope; no coverage gate is authorized here. |
| [DEBT-469](../../debt-469-toolchain-warning-debt.md) | Keep active — CONFIRMED | Resolution 5 is an explicit open split ledger. `reconcile-stripe-subscriptions.test.ts:1` still carries the named excessive-lines suppression. The restored warning policy is not completion of its burn-down. |
| [DEBT-472](../../../_archive/debt/debt-472-test-double-fidelity-and-contract-discipline.md) | Keep active — CONFIRMED | Resolution 4–6 remain open. `drizzle-rate-limiter.test.ts` still has 12 double casts; `practice-session-page-model.browser.setup.ts:32,37,43` retains the three migration sites. Parts A/B guards and contract coverage do not complete those migrations. |
| [DEBT-473](../../../_archive/debt/debt-473-green-without-evidence.md) | Keep active for owner decisions — CONFIRMED | Steps 6–7 remain unruled. Ruleset `17666822` still requires only `test`, zero approvals, and no review-thread resolution. Owner-authored dependency replacements do not by themselves record the final policy decision. |
| [DEBT-474](../../../_archive/debt/debt-474-ci-secret-scope-and-action-immutability.md) | Keep active — CONFIRMED; “only decisions” is incomplete | Steps 3–5 include CRON-secret disposition, Dependabot evidence policy, and recording the standard. The last item is documentation work after the decisions, and the first may require implementation. No secret comparison, rotation, or new policy is performed here. |
| [DEBT-475](../../../_archive/debt/debt-475-toolchain-coherence.md) | Keep active — CONFIRMED | The binding table still has uncompleted syntactic-boundary, raw-button, Docker, mock-classifier, optional read/sort-helper, and E2E process-tree replacements, plus three owner-ruling rows. The current Docker helpers and module-mock sites remain. “About five cleanups” is an estimate, not a completion checklist. |
| [DEBT-476](../../../_archive/debt/debt-476-dependabot-alert-triage-2026-09.md) | Keep active until follow-up — CONFIRMED | `pnpm-workspace.yaml:61` still pins `fast-uri` 3.1.7. npm reports 3.1.8 published `2026-09-15T07:36:25.444Z`; seven-day eligibility is `2026-09-22T07:36:25.444Z`. GitHub currently reports zero open alerts, with #55 dismissed `not_used` at `2026-09-16T13:45:31Z`. Zero alerts does not complete the recorded pin follow-up. Archive only after it lands and verifies, not automatically on the date. |

Result: seven resolved-work records plus two deferred records move out of
`docs/debt/`. **Nine Active rows and nine debt documents remain**, not eight
while DEBT-476 remains open. D7 stays discoverable in Deferred. Next ID remains
DEBT-479; no new debt is filed.

## Re-executed receipts

- `git --no-pager merge-base --is-ancestor <sha> origin/main` returned 0 for
  `c0ebbe4c`, `83873d6b`, `1384ba5d`, `9aae4437`, `e3e51d8b`, `05a08fb6`,
  `be7d81bd`, `6c923683`, `f7ec2cb0`, `fd45fdf4`, `bc1deb61`, and `09a45af6`.
- `gh pr view <number> --json state,mergeCommit,mergedAt,reviews` confirmed the
  associated PR merges. Ancestry is not a claim that every historical promotion
  had final-head approval: #913 records a one-time owner review override. That
  override is not inherited by this archive PR or its promotion.
- `gh api repos/The-Obstacle-Is-The-Way/naltrexone-university/actions/runs/35385213560/jobs`
  and the same endpoint for `35259751078` returned `test: success` and
  `deploy: success`. These are pre-archive production receipts.
- Open-issue body/title inventory and the open-PR API found no open item naming
  any of the seven resolved IDs. #902/#903/#772 name DEBT-414. No open PR existed
  at the audit baseline. Absence from GitHub is supporting evidence, not closure
  proof by itself.
- Replay/tail/setup regression slice: **3 files / 27 tests passed**.
  Playwright lane-policy and bounded-installer slice: **2 files / 27 tests passed**.

## Read-only production check

Fresh, signed-out Chromium at 1440 and 390 px, after `networkidle`, returned
200 for `/`, `/pricing`, `/terms`, and `/privacy`; `/api/health` returned 200
with `ok: true`, `db: true`. No login, checkout, consent submission, or provider
mutation was performed.

- Landing hero/final primary CTAs: 48 px; outline sibling: 46 px; landing plan
  CTAs: 50/48 px, both 16 px text; no CTA SVGs or debt-exception markers.
- All four landing headings centered; two labeled footer navigations;
  no document horizontal overflow at either width.
- Pricing plans section: 768 px desktop / 358 px mobile; both anonymous CTAs
  48 px. They correctly display trial/signup text for anonymous visitors, so
  this does **not** claim to exercise the authenticated standard-plan triggers.
- All 24 same-origin pricing script assets were read: `Subscribe monthly` and
  `Subscribe annual` were present, `Subscribe Monthly` and `Subscribe Annual`
  absent. Source, deployed bundle, browser tests, and the recorded hosted run
  are distinct receipts; bundle presence alone is not an interaction test.
- Terms shows August 9, 2026; Privacy shows September 16, 2026. Later Privacy
  publication does not reopen the completed DEBT-463 readability redesign.

## Links and preservation

Use `git mv` for the nine records. Keep the 10 DEBT-463, 191 DEBT-477, and 269
DEBT-478 asset entries at their existing `docs/debt/assets/` paths: moving 470
evidence entries offers no filing benefit and would invalidate historical
screenshot URLs. Moved records rebase their outgoing links; inbound Markdown
links and current path references are updated, including `link-check.json`.
Commit-addressed historical GitHub URLs are preserved. Historical prose is
unchanged apart from link destinations; status metadata and forward pointers
identify the new disposition without rewriting the old record.

The temporary audit script parses Markdown with the repository's installed
`remark-parse`, including inline links, images, reference definitions, and
angle-bracket destinations. It scans every `.md` under `docs/` plus `AGENTS.md`;
fragments are separated before filesystem resolution, and external URLs and
site-root routes are excluded. This is a destination-existence check, not a
claim of anchor-heading or external-URL validity.

**Pre-existing failure, not a clean global baseline:** 982 Markdown files,
2,896 relative Markdown-destination links, **429 broken occurrences in 154
files** before this pass. The broader all-local-destination check has 775
failures (including historical source/assets). The archive/link repointing
leaves both counts unchanged; it has not repaired unrelated prior archives.
The owner clarified the acceptance rule on September 18: **zero new broken
links introduced by this change**, not a globally clean baseline. This pass
adds zero broken destinations. Existing archive links remain historical
record; broken links in live documentation are a separate follow-up, not
repairs included here. Do not present zero new breakage as global zero.
