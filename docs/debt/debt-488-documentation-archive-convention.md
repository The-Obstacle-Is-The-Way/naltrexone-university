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
- [ ] Mechanical archive repairs individually resolve; unresolved targets listed.
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

## Related

- [Debt register](./index.md)
- [Prior inventory](./assets/inventory-2026-09-21/verification.md)
- [Promotion #981](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/981#issuecomment-5766690336)
