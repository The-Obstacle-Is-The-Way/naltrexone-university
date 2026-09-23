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

## Bug register follow-through

**2026-09-22 maintenance, after debt backfill #1008:** the nine-file field census needs a qualification: BUG-234 was already explicitly resolved in a `## Status:` heading, with #271 and its April 9 merge date. It never lacked an in-file disposition. This pass normalizes that field and corrects eight genuinely stale Open statuses; it does not claim nine newly resolved bugs. The prior census's absent field meant the conventional bold field only.

The bug register has no resolution-date column for these records. Its dated archival entries supply the dates below; the September 21 date in the later filename-index rows is only an indexing date. Using that date as a resolution date would be false. The archived records now say **Register archival date**, not newly measured production date. PRs #193, #214, #223, #265, #266 and #271 are all merged, and their merge commits are ancestors of baseline main `66172ad6`. BUG-228 remains **register row only**; no PR is guessed. Its register explicitly records resolution and archival on March 18.

All nine prior status values are preserved as filed, including BUG-234's already-resolved value. Removing only the maintenance status lines restores all nine pre-change bodies exactly. No old unchecked verification box is silently ticked, no historical tracer line is rewritten, and no fresh verification of the old incident is claimed.

| Sampled edit | Date/source | Receipt / preservation check |
| --- | --- | --- |
| BUG-204 status | 2026-03-10 archival entry | Existing #193 merged `2a4589bb`; original Open retained. |
| BUG-212 status | 2026-03-15 archival entry | Existing #214 merged `e55fb2f4`; same dated entry names 212, 213 and 214. |
| BUG-213 status | 2026-03-15 archival entry | #214; the filing date March 13 is not used as resolution. |
| BUG-214 status | 2026-03-15 archival entry | #214 merged March 14; March 15 is explicitly the register archival date, not merge time. |
| BUG-225 status | 2026-03-15 archival entry | Existing #223 merged `7da1ba86`; original Open retained. |
| BUG-228 status | 2026-03-18 archival entry | Register row only; old Open / production-confirmation wording retained as filed. |
| BUG-231 status | 2026-04-06 archival entry | Existing #266 merged `7cd46154`; original Open retained. |
| BUG-233 status | 2026-04-06 archival entry | Existing #265 merged `e05ee772` on April 5; April 6 is the register archival date. |
| BUG-234 field normalization | 2026-04-09 archival entry and in-file heading | Existing #271 merged `94472d55`; already resolved, not a new closure. |
| Bug-index maintenance date | 2026-09-22 | Scoped to metadata; the August 28 incident audit is not re-dated. |
| Bug-index Latest / Earlier | New maintenance entry; old August 28 entry | Earlier stanza's dated claims preserved, only its label changes. BUG-304 stays active. |
| Debt-index Latest / Earlier | New maintenance entry; prior #1008 entry | Exactly one Latest stanza; seven active debts and Next Debt ID unchanged. |

**Prior step receipt:** #1008 merged into dev as `199de7d851720c464a2130ea121f399edeb28f94`, after exact-head approval `5285399945` on `81ff932e`, zero threads and CI `35800189131` (5,669 unit, 411 browser, 349 integration plus six intentional skips, 52 E2E with no retry markers). It is not yet a production-promotion receipt; the register/guard milestone is still in progress.

## Brainstorming and audit follow-through

**2026-09-22 metadata maintenance:** 48 brainstorming records and five audits gain explicit document-level dispositions. The original proposed 46-record brainstorming census omitted BS-027 and BS-057. A further qualification to the initial field-only census above: BS-057's “verified locally” field is a tool subsection's historical finding, not an incorrect document status. It remains untouched, as do that file's other tool statuses; a new top-level field records the register's disposition. Only BS-004's Brainstorming and BS-027's Re-audited document statuses are superseded and retained as filed.

This is backfill of existing dispositions, not 53 new closures. BS-005 stays Superseded, BS-014 is Deferred with its four optional polish decisions, BS-051 is a consumed decision with icon replacement still tracked in live BS-052, and BS-061/063 are Decomposed into their named children. Other scoped completions retain their explicit tails. No optional implementation is inferred from archival location. No historical body or tool-observation status is rewritten.

Thirty-seven records have no disposition date in their register row; their new metadata says **not recorded**. Other dates are explicitly labeled resolution, archival, verification or audit dates according to their actual source. In particular, BS-033's March 24 date belongs to child DEBT-335, not the parent's component work; AUDIT-011's March 7 date is the audit date, while March 19 is its recorded resolution. BS-063 was archived April 17 and records its child resolution as April 21; #282's merge timestamp is April 20 UTC, not either of those other events.

Fourteen existing source PR citations were checked through GitHub and their merge commits are ancestors of baseline main `66172ad6`: #92, #141–143, #158, #170–171, #175, #179, #209, #218, #229, #235 and #282. Issue #82 is a **closed issue**, not PR #82. The register's BS-008 “implementing” wording is stale: #92 merged as `672b504f` on February 12; a dated correction follows the original row text. No PR is inferred for a record whose row only cites a spec, debt or historical outcome.

| Sampled edit | Source and date treatment | Receipt / preservation check |
| --- | --- | --- |
| BS-004 | Fully resolved by SPEC-021; no row date | Register row only; original Brainstorming status retained as filed. |
| BS-005 | Superseded by SPEC-021 after panel removal | Superseded, not falsely labeled an implemented iteration. No date invented. |
| BS-008 | SPEC-023 / #92 | Existing citation checked: merged February 12; dated row correction preserves old wording. |
| BS-011 | Two own-ID rows, Bug A and Bug B | Both SPEC-026 and SPEC-025 outcomes retained; a related-link row is not substituted. |
| BS-014 | Core shipped, four optional polish questions remain | Deferred; issue #82 is closed but is not an implementation PR receipt. |
| BS-027 | SPEC-037 implemented; no row date | Old Re-audited value preserved; no filing date relabeled as resolution. |
| BS-033 | Component work #141–143; residual DEBT-335/336/337 | March 24 is not copied into the parent's disposition-date field. |
| BS-051 | Reference decision consumed by DEBT-309 / #209 | Decided, with icon replacement still in BS-052; not a new UI claim. |
| BS-057 | Documented limitation / March 18 | Register row only; all tool-level observation statuses preserved exactly. |
| BS-061 | Archived April 17, decomposed to 350/351/352 | Direction A remains explicitly tracked in live BS-059. |
| BS-063 | Archived April 17; child resolved April 21 / #282 | These dates are not conflated with #282's April 20 merge. |
| AUDIT-003 | February 2 audit; recommendations addressed | Register row only; audit date is not a newly proven fix date. |
| AUDIT-008 | March 2 audit date; findings resolved | Original March 1 filing and March 2 re-verification text unchanged. |
| AUDIT-009 | March 9 zero-finding report | Register row only; preserve the September 21 correction, do not claim new fixes. |
| AUDIT-011 | Explicit March 19 resolution / #218 | Audit date March 7 and #218 merge March 15 remain distinct events. |

**Prior step receipt:** #1009 merged to dev as `9e7ec7bb4f516050426268dab741646385283342`, after normal exact-head approval `5285566639` on `ed82d1fb`, zero threads and CI `35802099282` (5,669 unit, 411 browser, 349 integration plus six intentional skips, 52 E2E; zero failure/retry/flaky markers). This is source-PR evidence, not yet milestone promotion. Seven active debt records remain.

## Bounded guard follow-through

**2026-09-22 New York / September 23 UTC:** #1010 merged to dev as `2fad1c5f3ae9a7c08f801777b138782121b35099`, after formal exact-head approval `5285719857` on `8110e0bf`, zero unresolved threads and CI `35803772777` (5,669 unit, 411 browser, 349 integration plus six intentional skips, build 26/26, 52 E2E; no failure/retry markers). All three backfill PRs are source receipts, not yet production-promotion receipts.

The existing script now recognizes native emoji/legacy `Resolution State` completion metadata, requires a known archived disposition, and checks the single-Latest convention. Unknown archived status values fail closed; legitimate Deferred, Invalidated, Accepted-risk and other existing historical outcomes are not mislabeled as shipped. Debt/bugs require one top-level literal Latest stanza; other registers allow zero or one. Code examples and older compound labels are not competing stanzas. No heading taxonomy, generalized parser, exception list, timeout increase or floor change is introduced.

Red proof at **2026-09-23T01:05:37Z**: the existing 1,060 cases passed while 47 added cases failed. Five isolated real-filesystem command fixtures returned **0 instead of 1** for emoji-closed live metadata, absent archived disposition, Open archived metadata, duplicate Latest and missing required Latest. Their register rows and links were valid, so no unrelated failure could satisfy the proof. Five direct legacy-completion cases were also missed. Remaining red results cover the newly exposed report fields and their positive controls; they are not claimed as additional product defects.

Green proof uses the same fixtures, with corrected controls returning 0. Existing command fixtures gain valid disposition/Latest metadata so an unrelated new metadata failure cannot mask a link-policy regression. The repository lifecycle check still reads names/statuses and register ASTs only; link checks remain per-document within the existing test deadlines. All 881 archived numbered records have dispositions after the backfills; this does not independently certify their historical claims. Seven active debts and the 41 unproven historical link occurrences remain unchanged. Review, full gate and milestone promotion remain pending at this record's writing.
