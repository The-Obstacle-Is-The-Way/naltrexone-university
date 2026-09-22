# DEBT-488: Documentation archive convention is unwritten and unenforced

**Status:** Open
**Priority:** P2
**Date:** 2026-09-21

## Description

Finished records belong in `docs/_archive/<register>/`; live register folders
are the open list. The convention was not written once for all registers and
had no executable link/lifecycle guard. Historical moves left broken links,
missing register entries, and, most recently, compatibility stubs.

## Verified baseline

Read-only census on promoted main `ce5439b0` (promotion #981), 2026-09-21:

- Four live/archive duplicate debt files: 473, 475, **480**, and 486. DEBT-480
  also retained a stub in #980. Eighteen rendered Markdown links target these
  live paths. The former territory restriction is no longer in force.
- Eighteen broken relative links in eleven live documentation files, all with
  existing archived destinations. `/privacy` is a site route, not a file link.
- A Markdown-AST census finds 694 broken archive links: 595 recoverable by
  restoring the source's pre-move depth, 58 by following a later archive move,
  and 41 without either mechanically provable destination. These are measured
  link occurrences, not unique targets. This **does not confirm** the advisor's
  771 / 515 / 58 / 198 figures; code examples are not rendered Markdown links.
- Seventy archived bug filenames and six archived debt filenames are absent
  from their indexes; AUDIT-009's filename is absent too. “Absent filename
  link” is not “never mentioned”: narrative ID mentions may already exist.
- BS-064 remains live despite its implemented status. SPEC-016 and SPEC-017
  also report implemented/complete core work, with optional future work still
  needing explicit Deferred-table placement before archival.
- Debt and bugs each have a one-line Archive section; audits have a lifecycle
  line; brainstorming has a lifecycle diagram. The advisor's claim that the
  bugs index has no archive instruction is false. None defines the complete
  inbound-and-outbound-link/no-stub procedure across all six registers.

## Resolution

1. Write the canonical convention in `AGENTS.md`; point Claude guidance,
   register indexes, and record templates to it. ADRs are superseded, not
   archived; living guides/policies and indexes/templates/assets are not open
   numbered records.
2. Add one unit-lane test file and one focused script. Red-first against the
   existing tree: reject duplicate live/archive records, terminal live status,
   missing register targets/unindexed live records, and broken live relative
   file links. Use the existing Markdown parser, not line-grep approximations.
3. In PR 1 remove stubs, repoint inbound links, archive finished records with
   receipts and explicit deferred tails, repair live links, and restore missing
   index links. Record before/after counts.
4. In PR 2 repair only provable depth/later-archive link breaks. Every rewrite
   must resolve; preserve fragments and historical prose. Extend the guard to
   reject those mechanical archive breaks. List unresolved historical targets
   here without guessing replacement destinations.
5. Promote the completed work, verify CI/tree/production/gate receipts, then
   close and archive this record using the same procedure as its end-to-end
   proof. No premature Resolved status.

## Verification

- [x] Four guard classes demonstrated red on the baseline tree (2026-09-21
  20:03:24Z: 4 failed / 12 passed; duplicate, terminal status, register rows and
  live links). An initial missing-module failure is not counted as that proof.
- [x] Convention and all six register/five existing template pointers are present.
- [x] No duplicate/stub or terminal record remains live; register targets work.
- [x] Zero broken live relative file links (16/16 focused cases green at
  20:08:06Z; command failure-contract cases added separately).
- [x] Mechanical archive repairs individually resolve; unresolved targets listed below (PR 2; promotion still pending).
- [ ] Exact-head review, full gate, promotion, and production receipts recorded.
- [ ] This record is itself archived without a compatibility stub.

## PR 1 census and corrections

Counts are numbered record **files**, including historical FE records and
supplementary numbered records, not distinct IDs; indexes/master guides/assets
are not open records. Four baseline debt files were stubs, not genuine open work.

| Register | Live files before | Live files after PR 1 | Archived before | Archived after PR 1 |
| --- | ---: | ---: | ---: | ---: |
| Debt | 15 (11 open + 4 stubs) | 12 (includes this new record) | 479 | 479 |
| Bugs | 1 | 1 | 286 | 286 |
| Specs | 2 | 0 | 40 | 42 |
| Brainstorming | 4 | 3 | 60 | 61 |
| Audits | 0 | 0 | 8 | 8 |
| QA | 2 | 2 | 0 | 0 |

The baseline has 873 numbered archive files, not the claimed 874. The live-link
census confirms 18 occurrences / 11 files; 18 other link occurrences targeted
the stubs. The initial cleanup rewrites 88 destinations, including moved specs'
outbound links and links from archived records; every selected target exists.
The guard also caught blank lines splitting the Active debt table: later apparent
rows were plain Markdown text. Removing those separators restores real rows.

Restored links cover 70 bugs, six debts and one audit. AUDIT-009's prior index
claimed a reverted March 2 report, but the retained report is dated March 9;
its current row now links it and explicitly records that correction. Historical
body text and historical status/date claims are not rewritten. The new guard
does not claim to re-prove every old resolution.

### Coverage-run correction (2026-09-21)

PR #982's first head passed the normal local gate, but hosted run 35650149864
failed: profiling the entire Markdown estate in the unit process exceeded the
existing 15-second hook bound. A local coverage run reproduced the failure
(14 cases passed; four repository assertions did not execute). This is a real
guard-performance defect, not a passing gate.

The repository census now exercises the real CLI in a bounded subprocess;
small real-file fixtures cover the same command body, exit decision and report,
and unit fixtures cover the link/lifecycle policies. No document, assertion,
coverage path or global timeout was excluded or relaxed. The focused coverage
run passed 18/18 in 7.51 seconds with 95.38% script line coverage. Final-head CI
and review are still required separately.

### Review adjudication (2026-09-21)

Confirmed and corrected the bug register's conflicting pre-merge closeout
exception and supplied Deferred tables in bugs, brainstorming, audits and QA,
plus QA's Archived table. The current owner convention controls future closes;
historical dispositions are unchanged.

Two focused cases failed at 20:30:53Z before the code corrections: a renamed
record evaded the duplicate check, and an extra parent path segment accepted a
file outside the repository. Numbered identity now includes the record prefix
(FE and DEBT remain distinct); link existence is confined to repository-relative
targets. This is link portability, not a new filesystem-security framework.
The coverage run then passed 20/20 in 7.22 seconds (95.71% script lines).

Rejected the suggested 60-second hook timeout: the full coverage lane passed
4,521 cases after the subprocess correction without increasing that bound.
Mechanical archive-link failure enforcement remains the explicit PR 2 scope,
not a reason to fold the historical repair into PR 1.

### Hosted-run follow-up (2026-09-21)

The preceding subprocess correction was insufficient on the hosted runner:
run 35652409795 failed its 14-second child deadline. It is not a successful
verification receipt. The guard now separates register lifecycle checks (all
record names/statuses and six index ASTs) from one assertion per live document.
All 142 live documentation files are still checked, and the CLI still reports
the complete archive census. Archive link assertions join the per-file checks
in PR 2. No timeout was raised and no file was excluded.

The focused coverage run passes 161 cases: 16 fixtures/command cases, three
lifecycle assertions and 142 per-document link assertions. That increase is
diagnostic granularity, **not new product coverage**. The slowest assertion is
1.48 seconds locally, with 95.89% script line coverage. The earlier whole-estate
subprocess is no longer the repository test's execution model; the real-file
CLI failure/exit tests remain. Hosted final-head validation is still required.

The subsequent review's test-colocation suggestion was withdrawn after checking
the existing repository-wide guard placement in `tests/`. Its outside-diff
metadata finding was confirmed: audits and brainstorming now date this scoped
register maintenance. QA also received September 21 table changes, contrary to
the review's proposed exclusion, so its metadata names that limited update too.
No date claims that the historical audit or QA procedure content was reverified.

### Own-row identity proof (2026-09-21)

The next review proposed classifying Archived headings. Checking the actual
indexes found a narrower violation of the requested property: BS-044 and BS-059
are cross-linked from other archived records' notes as well as having their own
Active rows. Removing an Active row could therefore leave the guard green.
A fixture reproducing the BS-042 → BS-044 relationship failed at 21:13:24Z.

The guard now requires the row's first-cell record identity to match the linked
record, so a related link cannot substitute for its own row. The audit register's
plain-ID/title-link format remains supported by a positive control. No heading
classifier was added: section placement remains part of the closeout procedure,
not an additional guard policy. All 163 focused cases pass under coverage.

### Full-review adjudication (2026-09-21)

Hosted CI 35656722168 passed on `45a2b736`, with no unresolved threads before
the subsequent full review. That review's DEBT-475 link claim is false: line
261 already points to the requested archived sibling on the reviewed head.
The malformed-percent URL probe exits 1 with `URIError`; it fails closed rather
than accepting a bad destination. Structured recovery is not required for that
invalid-input path. The command test exercises one exit-status contract through
its command body and real CLI, with a repaired-link positive control; splitting
it is not a correction to a failing property. Neither suggestion expands the
guard in this change.

Two documentation inconsistencies were confirmed: the spec register's metadata
now dates its actual September 21 archival maintenance, and brainstorming's
lifecycle no longer implies that only spec-driven implementation can close a
record. BS-064 is the existing promoted bug-driven counterexample. The full gate
and exact-head review remain required after these documentation corrections.

### Final-head review corrections (2026-09-21)

The review of `d38c9185` found a real status false positive. At 22:11:25Z a
focused regression failed because `Proposed — not implemented` was treated as
closed. Matching the terminal status only at the start of the field fixes it
and removes the redundant open-status exception list; this simplifies the
guard instead of adding status-by-status exceptions.

All five existing templates now expose the canonical Resolved status,
resolution date and verification-receipt fields. Reusable Active QA
procedures remain live. Scoped practice-engine corrections point to BUG-238,
BUG-239 and DEBT-397's existing resolutions without changing the dated April
snapshot or claiming that the entire historical practice audit was repeated.

## PR 2 mechanical repairs (2026-09-21)

PR #982 merged to dev as `0cd12052`, after normal exact-head approval on
`2070d762` (review 5272471458) and passing CI 35662286285. Required E2E passed
46/46 without failures or retries. Two final wording suggestions were declined
with the existing canonical-rule receipts; no override was used.

After PR 1, 688 archive link occurrences remained: 647 with a unique existing
destination (589 depth errors, 58 later archive moves), and 41 without a proven
replacement. The PR 2 command tests failed four ways at 22:34:50Z before the
implementation: both mechanical classes returned success, repair mode made no
change, and an unsupported source spelling was not refused. Before tree repair,
the new per-document archive assertions failed for 147 files at 22:36:25Z.

`pnpm exec tsx scripts/documentation-archive.ts --repair-archive` repaired those
647 occurrences in 147 files. It stages changes in memory, reparses each edited
document to verify the intended URLs, and verifies every replacement target
exists before writing any file. Labels, fragments, queries, and historical prose
remain unchanged. Ambiguous destinations and missing targets are not guessed;
unsupported source spelling fails before any write. File write errors still
fail the command; the tracked diff remains available for recovery.

The unit guard now checks every archive document for these two mechanical
classes, and the CLI exits nonzero when one remains. A readback reports zero
mechanically repairable archive links and zero broken live links. Register
counts remain exactly the PR 1 counts above. These are file-destination proofs,
not revalidation of historical line-number fragments or old incident claims.

### PR 2 coverage follow-up (2026-09-21)

Hosted CI 35664380936 passed on `17f7f30a`, but Codecov reported 89.09% patch
coverage against its unchanged 96.38% target. This is not an all-green receipt.
The repair behavior already refused unsafe rewrites; the missing evidence was
coverage of those refusal paths and of the subprocess-only CLI formatting.

At 22:55:03Z a real-file test failed when the reparse safeguard was temporarily
removed: a matching URL in a link title was changed instead of its destination.
At 22:56:09Z a vanished-target case failed with its existence safeguard removed.
Restoring both guards makes them pass; neither mutation remains. Argument parsing
and JSON serialization now live in the existing tested command function, with a
red-first explicit-argument/no-write test and the real CLI parity tests retained.
No coverage exclusion, target, timeout, or assertion was weakened.

### PR 2 review and coverage correction (2026-09-21)

CI 35665874357 passed on `6328e4f1`, but its 96.29630% patch coverage still
missed the unchanged 96.38% target. A focused archive-only boundary case failed
at 23:13:51Z when that existing guard was temporarily removed: it offered an
archive repair for a broken live link. Restoring the guard makes the case pass;
the implementation is unchanged. The full focused coverage run passed 1,052
cases with 98.33% script line coverage. Hosted patch coverage remains a separate
required receipt, not implied by this local percentage.

Review 5272767459 confirmed a stray `+` breaking the first exception-table row;
it is removed. The other three proposed link corrections are not valid repairs:
BS-044, BS-052 and BS-059 are live records, so their existing live destinations
are correct. The proposed BUG-133/134 slugs and removed practice-controller
filename still do not exist after changing depth. Those occurrences stay in
the explicit historical exception list below; no replacement is guessed.

The `1da66764` follow-up received normal exact-head approval (5272868341),
but its hosted patch report still failed at 96.29630%. Reading Codecov's
line-level report identified an uncovered preservation branch: a repaired
document also containing an already-correct link. The existing function/CLI
parity fixture now includes that mixed case. Both variants failed at 23:45:02Z
when preservation of the untouched URL was temporarily removed; restoring it
makes them pass. No implementation change or coverage-policy relaxation remains.

### Encoded-path correction (2026-09-22 UTC)

CI 35669565894 and Codecov passed on `25ddf6bb`. Full review 5273057201
identified a real repair defect: `encodeURI` retained filename `#` and `?`
characters, turning them into URL delimiters. Both real-file cases failed at
00:12:15Z before the correction. Encoding each relative path segment preserves
those filename characters while leaving slash separators and the original
query/fragment suffix intact. This corrects the existing repair operation; it
does not broaden destination discovery or alter the 647 repaired occurrences.

The review's DEBT-104 and SPEC-028/034/036 location suggestions are false:
those exact files exist only in the archive, so the current links are correct.
Its FE-002/practice-logic deletion request conflicts with the explicit historical
exception scope; those absent targets remain listed below, not silently removed.

### Promotion-review correction (2026-09-22 UTC)

On #984, six link findings were rechecked against `9a0ab172`. The archived
BUG/DEBT/specification sibling links already resolve; their suggested live
alternatives do not. The DEBT-334 controller, DEBT-354 shell script, and FE-002
targets remain absent even at the proposed paths. They are already in the 41
historical exceptions below, so changing depth would not repair them.

The owner requested a narrower malformed-input reporting contract after the
earlier fail-closed `URIError` adjudication: a malformed percent sequence must
be reported as an unresolvable link, not abort the audit. Five cases failed at
2026-09-22 01:23:04Z before the correction (live/archive links, register rows,
and both CLI locations). Both decoding sites now share guarded decoding. The
report marks invalid encoding, the command exits nonzero, and repair mode does
not guess a raw-path destination even if such a file exists. This does not
relax the historical-target policy or change any of the 647 repaired links.

### Historical targets without a mechanically proven replacement

All 41 occurrences below remain untouched. The source link resolves; the old
destination is shown as code so it does not create a new broken live link.
This is a bounded historical exception, not a claim that these files still
exist or an authorization to invent their replacements. Revisit only when an
owner supplies an authoritative replacement or explicitly reopens that record.

| Archived source and line | Unresolved historical destination |
| --- | --- |
| [bs-018-question-view-ux-unification.md:6](../_archive/brainstorming/bs-018-question-view-ux-unification.md#L6) | `../_archive/bugs/bug-133-stale-closure-auto-advance.md` |
| [bs-018-question-view-ux-unification.md:6](../_archive/brainstorming/bs-018-question-view-ux-unification.md#L6) | `../_archive/bugs/bug-134-mark-for-review-race-condition.md` |
| [bs-019-action-bar-label-and-ordering-consistency.md:359](../_archive/brainstorming/bs-019-action-bar-label-and-ordering-consistency.md#L359) | `../../tests/e2e/bs-019-action-bar-audit.spec.ts` |
| [bs-020-card-contrast-and-hover-consistency.md:401](../_archive/brainstorming/bs-020-card-contrast-and-hover-consistency.md#L401) | `../../tests/e2e/bs-020-card-contrast-audit.spec.ts` |
| [bs-028-history-session-scoring-and-navigation-gaps.md:7](../_archive/brainstorming/bs-028-history-session-scoring-and-navigation-gaps.md#L7) | `../specs/spec-034-unanswered-question-review-handling.md` |
| [bug-180-active-exam-answer-leak-via-review-hydration.md:42](../_archive/bugs/bug-180-active-exam-answer-leak-via-review-hydration.md#L42) | `../../../app/(app)/app/questions/[slug]/use-question-page-controller.ts#L321` |
| [bug-181-session-review-retry-allows-active-exam-answer-reveal.md:40](../_archive/bugs/bug-181-session-review-retry-allows-active-exam-answer-reveal.md#L40) | `../../../app/(app)/app/questions/[slug]/use-question-page-controller.ts#L405` |
| [bug-181-session-review-retry-allows-active-exam-answer-reveal.md:55](../_archive/bugs/bug-181-session-review-retry-allows-active-exam-answer-reveal.md#L55) | `../../../src/application/use-cases/submit-answer.test.ts#L360` |
| [bug-181-session-review-retry-allows-active-exam-answer-reveal.md:55](../_archive/bugs/bug-181-session-review-retry-allows-active-exam-answer-reveal.md#L55) | `../../../src/application/use-cases/submit-answer.test.ts#L404` |
| [bug-183-stripe-webhook-failure-state-rolled-back.md:73](../_archive/bugs/bug-183-stripe-webhook-failure-state-rolled-back.md#L73) | `../../../src/application/test-helpers/fakes.test.ts` |
| [bug-186-active-exam-review-projection-leaks-correctness.md:33](../_archive/bugs/bug-186-active-exam-review-projection-leaks-correctness.md#L33) | `../../../app/(app)/app/questions/[slug]/use-question-page-controller.ts#L252` |
| [bug-188-legacy-session-cas-json-shape-mismatch-breaks-updates.md:45](../_archive/bugs/bug-188-legacy-session-cas-json-shape-mismatch-breaks-updates.md#L45) | `../../../src/adapters/repositories/drizzle-practice-session-repository.test.ts` |
| [bug-189-question-review-cross-slug-async-state-corruption.md:31](../_archive/bugs/bug-189-question-review-cross-slug-async-state-corruption.md#L31) | `../../../app/(app)/app/questions/[slug]/use-question-page-controller.ts#L121` |
| [bug-189-question-review-cross-slug-async-state-corruption.md:31](../_archive/bugs/bug-189-question-review-cross-slug-async-state-corruption.md#L31) | `../../../app/(app)/app/questions/[slug]/use-question-page-controller.ts#L141` |
| [bug-189-question-review-cross-slug-async-state-corruption.md:33](../_archive/bugs/bug-189-question-review-cross-slug-async-state-corruption.md#L33) | `../../../app/(app)/app/questions/[slug]/use-question-page-controller.ts#L306` |
| [bug-189-question-review-cross-slug-async-state-corruption.md:34](../_archive/bugs/bug-189-question-review-cross-slug-async-state-corruption.md#L34) | `../../../app/(app)/app/questions/[slug]/use-question-page-controller.ts#L374` |
| [bug-194-practice-submit-flow-missing-stale-request-guard.md:34](../_archive/bugs/bug-194-practice-submit-flow-missing-stale-request-guard.md#L34) | `../../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts#L60` |
| [bug-203-clerk-webhook-public-fallback-secret.md:24](../_archive/bugs/bug-203-clerk-webhook-public-fallback-secret.md#L24) | `../../../node_modules/.pnpm/@clerk+nextjs@6.37.1_next@16.1.6_@babel+core@7.29.0_@opentelemetry+api@1.9.0_@playwrigh_6efdc9384cdd89288039aac9aa09ecc4/node_modules/@clerk/nextjs/dist/cjs/webhooks.js#L31` |
| [bug-203-clerk-webhook-public-fallback-secret.md:34](../_archive/bugs/bug-203-clerk-webhook-public-fallback-secret.md#L34) | `../../../node_modules/.pnpm/@clerk+backend@2.30.1_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/@clerk/backend/dist/webhooks.js#L62` |
| [debt-333-browser-test-flakiness-audit.md:6](../_archive/debt/debt-333-browser-test-flakiness-audit.md#L6) | `../../../vitest.browser.config.ts` |
| [debt-334-practice-session-bootstrap-timeout-guard.md:6](../_archive/debt/debt-334-practice-session-bootstrap-timeout-guard.md#L6) | `../../app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts` |
| [debt-345-circuit-breaker-external-services.md:146](../_archive/debt/debt-345-circuit-breaker-external-services.md#L146) | `../../src/adapters/gateways/stripe-subscription-canceler.ts` |
| [debt-353-practice-session-results-orchestrator-decomposition.md:6](../_archive/debt/debt-353-practice-session-results-orchestrator-decomposition.md#L6) | `../_archive/debt/fe-002-usepracticesessionreviewstage-exceeds-150-line-guideline.md` |
| [debt-354-god-file-and-clean-code-audit.md:6](../_archive/debt/debt-354-god-file-and-clean-code-audit.md#L6) | `../../scripts/check-file-size.sh` |
| [debt-355-cross-feature-question-flow-coupling.md:20](../_archive/debt/debt-355-cross-feature-question-flow-coupling.md#L20) | `../../app/(app)/app/practice/practice-logic.ts` |
| [debt-358-exam-review-question-navigation-stranded.md:6](../_archive/debt/debt-358-exam-review-question-navigation-stranded.md#L6) | `../_archive/debt/fe-002-usepracticesessionreviewstage-exceeds-150-line-guideline.md` |
| [debt-360-action-bar-below-fold.md:99](../_archive/debt/debt-360-action-bar-below-fold.md#L99) | `../../../app/(app)/app/practice/components/sticky-action-bar.tsx` |
| [debt-360-action-bar-below-fold.md:100](../_archive/debt/debt-360-action-bar-below-fold.md#L100) | `../../../app/(app)/app/practice/components/sticky-action-bar.tsx` |
| [debt-360-action-bar-below-fold.md:101](../_archive/debt/debt-360-action-bar-below-fold.md#L101) | `../../../app/(app)/app/practice/components/sticky-action-bar.tsx` |
| [debt-446-local-db-script-target-guards.md:67](../_archive/debt/debt-446-local-db-script-target-guards.md#L67) | `../../../scripts/seed-all-environments.sh#L132` |
| [debt-446-local-db-script-target-guards.md:119](../_archive/debt/debt-446-local-db-script-target-guards.md#L119) | `../../../scripts/seed-all-environments.sh#L112` |
| [debt-446-local-db-script-target-guards.md:122](../_archive/debt/debt-446-local-db-script-target-guards.md#L122) | `../../../scripts/seed-all-environments.sh#L142` |
| [debt-446-local-db-script-target-guards.md:124](../_archive/debt/debt-446-local-db-script-target-guards.md#L124) | `../../../scripts/seed-all-environments.sh#L166` |
| [debt-446-local-db-script-target-guards.md:128](../_archive/debt/debt-446-local-db-script-target-guards.md#L128) | `../../../scripts/seed-all-environments.sh#L147` |
| [debt-446-local-db-script-target-guards.md:131](../_archive/debt/debt-446-local-db-script-target-guards.md#L131) | `../../../scripts/seed-all-environments.sh#L132` |
| [debt-446-local-db-script-target-guards.md:133](../_archive/debt/debt-446-local-db-script-target-guards.md#L133) | `../../../scripts/seed-all-environments.sh#L152` |
| [debt-462-observability-instrument-gap-parked-triggers.md:83](../_archive/debt/debt-462-observability-instrument-gap-parked-triggers.md#L83) | `../../../tests/server-span-family-boundary.test.ts` |
| [spec-020-practice-engine-completion.md:391](../_archive/specs/spec-020-practice-engine-completion.md#L391) | `../../adr/adr-001-clean-architecture.md` |
| [spec-029-dev-environment-resilience.md:270](../_archive/specs/spec-029-dev-environment-resilience.md#L270) | `../adr/adr-012-clean-architecture-layers.md` |
| [spec-031-unified-visual-front.md:313](../_archive/specs/spec-031-unified-visual-front.md#L313) | `../../tests/e2e/bs-020-card-contrast-audit.spec.ts` |
| [spec-032-action-bar-standardization.md:324](../_archive/specs/spec-032-action-bar-standardization.md#L324) | `../../tests/e2e/bs-019-action-bar-audit.spec.ts` |

## Related

- [Debt register](./index.md)
- [Prior inventory](./assets/inventory-2026-09-21/verification.md)
- [Promotion #981](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/981#issuecomment-5766690336)
