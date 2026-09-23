# Archive metadata maintenance — 2026-09-22

## Authority and evidence limits

Owner-directed follow-through on the existing [archive convention](../../../../AGENTS.md#closing-and-archiving-documentation-records), not a new debt record or a declaration that unfinished work shipped. Baseline dev `1fec454c`, main `66172ad6`, common tree `be746740cd1ec4315291f113b250d6a2b465f310`; fetch succeeded, the working tree was clean and GitHub listed no open PRs.

Backfill precedes the guard follow-up. The affected set is bounded, but the proposed census and date assumptions were not accurate enough to encode as a temporary exception list. Each maintenance PR keeps the existing guard green; the final tooling PR will prove the new forbidden states red against synthetic fixtures. It will not add a permanent historical-disposition allowlist. The external proposed test file has not been copied into the tree.

Dates labeled **Register date** are copied from the actual date cell, not a date mentioned inside the description. They are not newly reconstructed deployment timestamps. A linked PR is an existing register citation rechecked through GitHub; **register row only** explicitly means no stronger implementation receipt is asserted. No historical body, old test count or old code example is re-certified by this metadata maintenance.

## Adversarial findings

| Claim | Result and receipt |
| --- | --- |
| D1 debt count 43 | Refuted as a count of missing dispositions: 30 records have neither a Status nor Resolution State field, and eight still say Open/Ready/Active: 312, 322, 382, 383, 385, 387, 388, 389. The four `Resolution State: Fixed` records (366, 367, 369, 371) already have dated PR receipts and remain untouched. |
| D1 other registers | Nine bug records need metadata (eight Open, one absent); five audits have none. Brainstorming has 45 absent fields plus BS-004's Brainstorming status; BS-027's Re-audited and BS-057's verified-locally fields also fail to express their register's resolved disposition. Specs already carry completed dispositions. |
| Every register row has a date | Refuted. Numerous brainstorming rows have no date, and bug-register historical tables have differing schemas. A filing date, indexing date or narrative mention is not automatically a completion date. Missing dates must stay explicitly unknown unless an existing dated disposition supplies one. |
| D2 DEBT-470 | Confirmed: the file's August 17 resolution date preceded #804's API merge time, `2026-08-18T14:56:38Z`, merge `9aae44374abbff663990ac02f8f0eaa7a2628824`. The merge is a main ancestor. The file and register now distinguish implementation from merge and retain the original date as superseded metadata. |
| D3 content runbook | Confirmed: three rendered relative links targeted the moved-document stub. All now target `docs/practice-engine/content-pipeline.md`; the stub is removed. |
| D4 duplicate first look | Confirmed byte-identical SHA-256 `7d548b444fd5b491a0a256a1353b0336283c15bf0bb61e51de7da44ae100a1dc`. It is one combined Home/Pricing observation, not two independent reviews. Keep the DEBT-477 copy and point DEBT-478 to it; remove only the redundant copy. |
| D5 four orphan documents | Partially refuted: all four lacked relative inbound links, but the DEBT-477/478 receipts already had commit-pinned GitHub Markdown links in their archived records. Those historical citations remain; local navigation is added. The legal publication copy and security program gain developer-index links, without changing their contents. |
| D6 workflow count | Confirmed: four workflow files exist. `tests/ci-workflow.test.ts` covers CI and both Stripe workflows; `scripts/security-txt-renewal.test.ts` separately pins renewal actions and permissions. Both live deployment guides now say four. |
| D7 ruleset | Confirmed: API readback of ruleset 17666822 targets main/dev, enforces merge-only, strict Actions `test`, thread resolution and deletion/non-fast-forward protection, with zero approvals and no bypass actors. [GitHub's reference](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#additional-approval-for-unattributed-copilot-pull-requests) says the Copilot-only extra-approval flag has no effect with zero approvals. AGENTS.md now separates this enforcement from review/provenance process checks. |
| D8 guard | Confirmed on the baseline: synthetic live `Status: ✅ RESOLVED` and `Resolution State: Fixed` records both returned an empty `closedLive`; archived dispositions and Latest multiplicity are not checked. This PR changes no scanner or test. The bounded guard follow-up remains pending. |

The WIP branch is remote-only at `9446b459`, 83 commits behind dev with one unique commit. The [September 21 inventory](../inventory-2026-09-21/verification.md#published-rate-limiter-wip--adapt-do-not-land-in-this-pass) already records 14 passing, mutation-proven cases; that is not proof on the current base. The WIP is unchanged by this PR.

## Debt backfill sample

All 38 metadata edits were compared with their own Resolved register rows; these twelve are the explicit pre-PR sample. The eight contradictory Status fields preserve their previous text under `Status as filed (superseded 2026-09-22)`.

| Record | Register date | Receipt / preservation check |
| --- | --- | --- |
| DEBT-273 | 2026-03-04 | #170 is merged; title names this debt. |
| DEBT-274 | 2026-03-04 | #171 is merged; existing in-file Resolved date agrees. |
| DEBT-277 | 2026-03-04 | #173 merged March 5 UTC, March 4 New York time; retain the register date, do not label it a UTC merge date. |
| DEBT-282 | 2026-03-07 | Register row only; no PR inferred from related records. |
| DEBT-312 | 2026-03-15 | Register row only; original Open status preserved verbatim. |
| DEBT-322 | 2026-03-19 | #235 is merged; Ready-for-implementation status preserved. |
| DEBT-323 | 2026-03-18 | Register row only; disposition explicitly means documented upstream limitation, not a product repair. |
| DEBT-332 | 2026-06-15 | Register row only; report-only CSP/no-RLS accepted-risk decisions are preserved, not relabeled as enforcement. |
| DEBT-344 | 2026-04-03 | Register row only; Tier 1 scope is resolved, Tier 2 remains deferred under DEBT-349. |
| DEBT-354 | 2026-04-09 | Register row only; audit completion is separate from child implementation. The row's #271 citation is not promoted into a stronger receipt: that PR's file list does not contain this audit. |
| DEBT-382 | 2026-05-21 | #313 is merged; use the date cell, not the May 20 spec-revision date in the description. Original Active status preserved. |
| DEBT-385 | 2026-05-20 | #312 is merged; use the date cell, not the January API-pin dates in the description. Original Active status preserved. |

## Baseline review and release verification

GitHub review pagination was complete for PRs #964–#1007. Every merged feature PR had a formal exact-head CodeRabbit APPROVED review before merge; the four Dependabot PRs #970–#973 were closed, not merged. Git first-parent walks for every promotion in that interval map to those approved dev-source merges. Current unresolved-thread counts are zero; this is a current API observation, not a reconstruction of historical thread state.

The existing local gate logs identify clean head `1fec454c` and successful typecheck, lint (`lint:doubles issues=0`), 478 unit files / 5,670 tests, 65 browser files / 411 tests, 46 integration files / 349 tests plus two files / six intentional skips, build and 52 E2E passes. These are baseline receipts, not this PR's gate.

Direct GitHub jobs and Vercel deployment readbacks agree:

| Main commit | CI run | Successful test completion (UTC) | Production alias assignment (UTC) |
| --- | --- | --- | --- |
| `0d4bcf40` | 35718830873 | 2026-09-22 11:09:14 | 2026-09-22 11:09:16.581 |
| `c6036653` | 35723256006 | 2026-09-22 11:56:36 | 2026-09-22 11:56:38.266 |
| `66172ad6` | 35735578993 | 2026-09-22 14:08:17 | 2026-09-22 14:08:19.119 |

The last run passed on one documented rerun, not its first attempt; #1006's comments preserve the failed E2E run and diagnosis. This audit performed no rerun. Production `/` and `/api/health` returned 200. Readbacks support release ordering; earlier staged-state observations remain in the original promotion receipts.

## Completion boundary

Seven active debt records remain. This pass does not close any of them, alter a ratchet floor, repair the 41 unproven historical link occurrences, or claim the pending bugs/brainstorming/audit backfills and guard have landed. Per-PR gate, review and merge receipts belong in the corresponding PR bodies.
