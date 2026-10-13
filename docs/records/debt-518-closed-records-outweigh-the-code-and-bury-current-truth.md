# DEBT-518: Closed Records Outweigh the Code and Bury Current Truth

**Status:** In Progress — the records step, the agent instructions and the layout are done; the archive's removal follows, which the owner approved on 2026-10-13
**Priority:** P2
**Date:** 2026-10-11
**Resolved:** —
**Verification receipts:** —

---

## Summary

Every bug and debt item here is written up as a numbered Markdown record before it is fixed. A second agent challenges it, and once it ships it is moved to `docs/_archive/`. Writing first and challenging the write-up are the valuable part: on 2026-10-11 a reviewer's heads-up overturned a just-shipped design (DEBT-503 item 5), and a second agent's challenge corrected this record before review.

Keeping every closed record in the working tree is not. The archive is now about twice the size of the production code, and it outnumbers the live documents in every search. Closing a record is a ceremony of its own, and record edits take review capacity that code needs.

This record measures the setup, sets out what each kind of document is for, compares the options, and plans a move to **records as working files**: written first, challenged on the branch, shipped with their fix, and deleted on close, leaving a one-line ledger entry. **The owner approved the plan on 2026-10-11, and widened it to every document in the repository,** with clean namespaces and names.

## Evidence

Measured 2026-10-11 on `dev` after #1464.

| What | Measure |
|------|---------|
| `docs/_archive/` | 932 files, 131,239 lines, 9.3 MB: 309 bugs and 510 debt (both include the frozen register histories and other supporting files), 42 specs, 61 brainstorming, 10 audits |
| Record assets | `docs/{debt,bugs,audits}/assets/`: 586 files, 53 MB. 530 of them, in 20 folders and about 51 MB, are linked only from archived records. |
| Live records | 11 bug records (1,091 lines) and 15 debt records (2,233 lines), beside the two indexes |
| Production TypeScript | 69,719 lines: `.ts` and `.tsx` outside `tests/`, test files and test helpers, `scripts/` included |
| Archive growth | files added: 723 from February to May, then June 56, July 77, August 3, September 33, October 1–11 41 |
| Search noise | Markdown files under `docs/` matching, case-insensitive, live against archived: "Clerk" 68/231, "CodeRabbit" 28/118, "Stripe webhook" 11/64, "Sentry" 35/56, "rate limit" 30/47 |
| Links into the archive | 483 Markdown links in 74 live files, 25 of them Deferred rows in the two indexes. Eight other files name archive paths: `.coderabbit.yaml`, `proxy.ts`, a receipt in an archived record's assets, the guard, its test, and three documentation tests. |
| Record IDs in code | 467 code, test, script and workflow files cite a BUG or DEBT ID. Of the 112 distinct IDs cited in TypeScript, 91 belong to archived records. |
| Pull requests | The last 196 merged into `dev`, Dependabot's excluded (2026-09-24 to 10-11): 189 (96%) edit a register, a record or an index; 28 (14%) are documentation-only; 38 touch the archive. Documentation is a third of all changed files (1,245 of 3,662). |
| Process tooling | 2,308 lines: `scripts/documentation-archive.ts` and its test, the due-check script, test and workflow, the asset budget and its test, and three register and heading tests. Plus `AGENTS.md`'s Documentation section, 188 lines. |
| Review capacity | CodeRabbit's plan allows one review an hour. On 2026-10-11, four sessions here and the addiction-final-2026 repository shared it, and the queue was five reviews deep. |

## What Each Kind of Document Is For

- **A record is a working document.** While the work is open, it holds the hypothesis, the evidence, the options and the decided fix. A second agent can challenge it before code exists, and it outlives the session that wrote it. It is worth most before the fix, and close to nothing once the fix is verified.
- **Lasting knowledge has better homes, each kept true by something:**
  - what the system does: the code and its tests, which run;
  - why the code has its shape: a comment where it happens;
  - how we work: `AGENTS.md`, `.claude/rules/` and `docs/guides/`;
  - what was decided, and what else was weighed: an ADR, which is not edited once accepted, only superseded ([Fowler, *Architecture Decision Record*](https://www.martinfowler.com/bliki/ArchitectureDecisionRecord.html));
  - what happened, with its receipts: reachable git commits for durable evidence, and pull-request descriptions for review context. PR descriptions can be edited; they are not immutable evidence.
- **An archived record is none of these.** It is a second, frozen copy of the story of a problem that no longer exists, kept where searches and agents read it beside what is true now. A document that is no longer true but looks current is worse than none.

## Impact

1. **The archive buries what is true.** In the searches above, archived files outnumber live ones by up to 6 to 1. An agent that reads an archived claim as current acts on something that stopped being true. In this repository, agents add an exclusion for the archive to nearly every search.
2. **Closing is a ceremony.**
   - The record is moved with `git mv`.
   - Every inbound and outbound link is rewritten for its new depth.
   - The register rows and the Now stanza are edited.
   - The guard checks all of it.

   483 links point into the archive now.
3. **Review capacity goes to bookkeeping.** A documentation-only PR spends an hourly CodeRabbit slot and a promotion. Record edits ride in almost every PR, and CodeRabbit has learned lasting rules from record text (DEBT-515). BUG-336, filed in the same PR as this record, shows the cost of a small fix: a record, a Verifying status, and a later move, all for a one-line change.
4. **The format needs its own tooling:** 2,308 lines, and 188 lines of rules. Some of it stays under any model: the due check, the heading and asset-budget tests, and the guard's checks of the live registers. The part that moves closed files, rewrites their links for the new depth, and checks the archive and frozen histories goes.
5. **It only grows.** 723 files arrived from February to May, then 56, 77, 3, 33 and 41 a month. The assets that only archived records link add about 51 MB beside its 9.3 MB.

## Options

- **A. Keep course.** All five problems remain, and grow.
- **B. Purge the archive once, and keep the process.** It fixes problem 1 today. Problems 2 to 5 return as the archive refills, and the move ceremony stays.
- **C. Hide the archive from search** with an `.ignore` entry for `docs/_archive/`; none exists today. It costs almost nothing and removes the archive from ripgrep-based searches, agents' search tools among them. `grep -r`, GitHub's search, CodeRabbit and agents following links still read it, and problems 2 to 5 remain. It treats one symptom.
- **D. Delete on close from now on, and keep the existing archive.** It stops the growth, and new closes skip the ceremony. Problem 1 stays at today's size, and the archive's tooling stays with it.
- **E. Move records to GitHub Issues.** It is common practice, and it removes the archive. Here it would cost more than it saves:
  - every read and write spends the shared GitHub API allowance of 5,000 requests an hour, which one session exhausted on 2026-10-10;
  - issues cannot be searched locally, or reviewed in the same diff as their fix;
  - issue edits go unreviewed, and agents write them as the owner, which is DEBT-515's problem;
  - the guard and due-check tooling would need rewriting.

  Issues stay for notifications, which they suit: the advisory watcher and the weekly due-check issue.
- **F. Move the archive to another repository, branch or wiki.** It removes the search noise, but keeps a second store to maintain and link into, and the move ceremony stays.
- **G. Records as working files, deleted on close, with the existing archive deleted once.** *Chosen; the owner approved it on 2026-10-11.*

## Resolution (decided)

### The Model

*Corrected 2026-10-11: the independent review separates feature specifications from defect/debt records, makes Waiting review accountable, and requires retrieval evidence before deletion. The current lifecycle rules are in `docs/records/README.md`; ADR-023’s amendment and `docs/product/README.md` define feature work.*

1. **When to file.**
   - File a defect/debt record when that work spans more than one pull request or needs an independent challenge. A new product feature instead uses the product specification workflow, regardless of PR count.
   - A fix that is already proven and lands in one pull request uses that PR's description as its record. The description has the same sections as a record: evidence, options, decision and verification.
   - If a check outlives that pull request, such as its promotion, it needs a record, so the weekly due check sees it.
2. **Write first, and challenge on the branch.**
   - Take the next ID from `scripts/next-record-id.ts`; the guard fails a duplicate that two branches took at once.
   - Commit the record first on the work branch, and push the branch without opening a PR.
   - A second agent challenges it there, and corrects it in place with a `Corrected YYYY-MM-DD` note.
   - No CodeRabbit review is spent until there is code.
   - **Exception:** a security finding that an outsider could use is challenged locally and not pushed until its fix ships, as `AGENTS.md` already requires.
3. **Ship it with its fix.** The record and its fix go up in one pull request, so one review covers both. A record that must be visible before any code, such as an investigation or a decision deferred to the owner, merges without a fix. It can share a pull request with another small change to save a review, as this record does with BUG-336.
4. **Close by deleting.** Once a record's checks are recorded, the next pull request that touches its register:
   1. moves any lasting knowledge to its home: a rule to `AGENTS.md` or `.claude/rules/`, a decision to an ADR, a reason to a code comment, and an unfinished tail to a self-contained Waiting row;
   2. deletes the file and its asset folder;
   3. adds one ledger line: ID, title, disposition, date and path, then the closing PR and the commit of the record's last version. Those give a GitHub permanent link, and an offline read with `git show <commit>:<path>`.
5. **Keep what works:** the Now stanza; the Active table and the Waiting rows; due dates and the weekly due-check issue; one-line statuses; `Corrected` notes; and red-first evidence.
6. **Scope.**
   - ADRs are never deleted, only superseded.
   - Living guides, policies and the product specification stay live.
   - Specs, brainstorming and audits follow the record rule.

### Scope, Widened 2026-10-11

The owner widened the plan from records to every document: the product spec, architecture notes, ADRs, guides, policies, the frontend standards, and the instructions agents load (`AGENTS.md`, `CLAUDE.md`, `.claude/rules/`).

### Step 0: Inventory, Layout and Mapping

- **Inventory.** Four read-only censuses inventoried every document on 2026-10-11, and a second agent challenged the resulting plan. Their findings are in [ADR-023](../adr/adr-023-documentation-organisation.md)'s Context.
- **The decision.** ADR-023 records the layout, the placement test, and the naming and content rules.
- **The mapping.** Below, each document's disposition and target, as built. Corrections from the challenge are applied:
  - no `reference/` folder;
  - CodeRabbit `applyTo` mappings;
  - only the index links records;
  - one ledger commit in place of per-line URLs, which keeps the ledger at 160 KB;
  - unique IDs, computed by a script;
  - the archive deleted last.

#### Specs and Product

| Old | New |
|---|---|
| `docs/specs/master_spec.md` | **keep whole** (owner, 2026-10-11): rename to `product/specification.md`; correct its stale facts against the code (the free trial, renewal notices, the missing routes, controller entry points and environment variables, 29 tables); keep the API contract sections and correct them; remove nothing |
| `docs/specs/master_spec_part{1..4}.md` | delete |
| `docs/specs/index.md` | delete; IDs to ledger; 4 Deferred → Waiting |
| `docs/dev/acceptance-testing.md` | `product/business-rules.md` (update `RULE_REGISTER_PATH`) |
| `docs/content/tag-taxonomy-golden-spec.md` | `product/content-taxonomy.md` (decision only) |
| `docs/brainstorming/*` | `product/ideas.md` lines; delete |

#### Practice Engine and Content

| Old | New |
|---|---|
| `practice-engine/index.md` | delete (→ `product/practice/README.md`, `architecture/practice-engine.md`) |
| `practice-engine/architecture-layers.md` + `frontend-layer.md` | `architecture/practice-engine.md` (fix `paramsJson` → `practice_session_question_states`) |
| `practice-engine/question-rendering-architecture.md` | `architecture/question-rendering.md` (§9 file index and §12 changelog kept, under the owner's preserve-content ruling) |
| `practice-engine/practice-modes.md` | `product/practice/modes.md` (§7 CAS corrected in place) |
| `practice-engine/interaction-contracts.md` | `product/practice/interaction-contracts.md` (§3 rewritten as the shipped design; the datetime section stays here) |
| `practice-engine/exam-answer-secrecy-policy.md` | `product/practice/exam-answer-secrecy.md` (reconcile §5 with the code; add `GetQuestionForView`) |
| `practice-engine/ordering-policy.md` | `product/practice/question-ordering.md` |
| `practice-engine/retry-logic.md` | `product/practice/retries.md` (§8–10 kept, under the preserve-content ruling) |
| `practice-engine/security-model.md` | merge → `architecture/security.md` |
| `practice-engine/content-pipeline.md` | `architecture/content-pipeline.md`, procedures included; the planned split into three content guides was not made |
| `practice-engine/{current-state,spec-coverage-map,file-index}.md` | delete |
| `docs/content/question-format-spec.md` | reconcile against `content/drafts/questions/SCHEMA.md` and the code; preserve unique operational guidance before removal, and obtain owner agreement for substantive deletion |
| `docs/content/tag-taxonomy-pipeline.md` | merge → `architecture/content-pipeline.md` |
| `docs/content/reports/*` | delete |
| `docs/vendor-docs/{index,clerk,stripe,postgres}.md` | `architecture/integrations/{README,clerk,stripe,postgres}.md` (drop version tables) |

#### Engineering Guides

| Old | New |
|---|---|
| `dev/code-quality-metrics.md` | `guides/testing/crap-report.md` |
| `dev/integration-tests.md` | `guides/testing/integration-tests.md` (stale inventory dropped) |
| `dev/testing-infrastructure.md` | `guides/testing/e2e-tests.md` + `guides/testing/browser-automation.md` (delete `--state` advice) |
| `tooling/agent-browser.md` | `guides/testing/browser-automation.md` |
| `dev/react-vitest-testing.md` | `guides/testing/react-component-tests.md` (moved whole) |
| `dev/mutation-testing.md` | `guides/testing/mutation-testing.md` (moved whole) |
| `dev/qa-procedures.md` + `docs/qa/index.md` | `guides/qa/README.md` |
| `docs/qa/qa-001-practice-core-flows.md` (+ stabilization flows) | `guides/qa/practice-core-flows.md` |
| `docs/qa/qa-002-billing-entitlement.md` | `guides/qa/billing-and-entitlement.md` (fix the 375×667 comments) |
| `dev/stabilization-checklist.md` | delete (Flow D → QA guide) |
| `dev/deployment-procedure.md` | `guides/release/promote-to-production.md`; the planned seed-content and repository-settings guides were not split out |
| `dev/migration-authoring.md` | `guides/database/migrations.md`, rules included (the only copy of the build chain; "formerly" note for the two immutable migrations); no separate rules file |
| `dev/sanitized-explain-capture.md` | `guides/database/query-plan-capture.md` |
| `dev/database-rollbacks.md` | `guides/operations/database-recovery.md` |
| `dev/deployment-environments.md` | `architecture/environments.md`, troubleshooting included |
| `dev/logging.md` | `architecture/observability.md` (logger, request context, Sentry, and the operational-alert runbooks) |
| `dev/dependency-update-protocol.md` | `guides/dependencies/updating-dependencies.md` (policy → `policies/supply-chain.md`) |
| `dev/supply-chain-overrides.md` | `policies/supply-chain.md`, exceptions included (keep the urgent-patch anchor: it is in opened issues) |
| `dev/license-baseline.md` | delete (rules → `policies/supply-chain.md`) |
| `dev/question-feedback-analytics.md` | `guides/content/feedback-export.md` |
| `dev/bookmark-cardinality-census.md` | `guides/database/bookmark-census.md`, which DEBT-450's Waiting row links |
| `dev/test-double-contract-register.md` | `guides/testing/fake-contracts.md` (update the scan constant and the `.claude/rules/testing.md` assertion) |
| `dev/index.md` | delete (→ `docs/README.md`) |

#### Design System, Policies, Records

| Old | New |
|---|---|
| `frontend/{index,standards,pattern-registry,typography-policy,contrast-policy,design-principles,bookmark-surface-policy}.md` | `design-system/{README,standards,pattern-registry,typography,contrast,layout,bookmark-surfaces}.md` (rewrite `layout.md` §2; drop inventories) |
| `frontend/pages/*` | delete |
| `docs/legal/*` (moved 2026-10-13 with the owner's OK) | `policies/legal/*` (**owner**; path-only; tests updated) |
| `docs/security/*` (moved 2026-10-13 with the owner's OK) | `policies/security/*` (**owner**; path-only) |
| `debt/assets/debt-414/f0{3,15}-consent-ruling-data.json` (moved 2026-10-13) | `policies/legal/consent-rulings/` (update `lib/pricing-data.test.ts`) |
| `docs/{bugs,debt}/*` | `docs/records/` (flat); indexes merge into `records/README.md` |
| `docs/audits/*` | AUDIT-015 closes: its order → records Now/Next, its trace-sample decision → BUG-331; the index is deleted |
| `docs/_archive/**` + 20 archive-only asset folders | delete last, after the ledger and permalinks |
| Colocated Markdown: `app/(app)/app/practice/shared/idempotency-protocol-contract.md`, `app/fonts/README.md`, `content/questions/README.md`, `tests/shared/README.md`, `tests/test-helpers/README.md` | stay beside their code. The guard's link check widens to `app/**`, `content/**` and `tests/**`. The contract gets a link from `.claude/rules/frontend.md`, `tests/shared/README.md` its missing scope, and `content/questions/README.md` a format example that parses. |
| Asset folders that live docs link: `biome-architecture-2026-09-21` (ADR-001), `bugs/assets/content-release-audit-2026-10-02.md` (ADR-021), `helper-recovery-2026-09-21` (testing guide), `inventory-2026-09-21` and `active-audit-2026-09-21` (DEBT-414) | permalink, then delete with the purge; DEBT-414's own assets stay until it closes |
| Open GitHub issues citing doc paths (#423, #772, #883, #902, #903) | a comment on each with the new path, in the PR that moves it |
| Every tracked file naming a moved path, e.g. `proxy.ts`, `src/application/use-cases/validate-feedback-context.ts`, workflows, watcher issue text | swept by `git grep` in the PR that moves the path; the guard rejects files recreated in retired folders; step 5, the archive's removal, adds rejection of unpinned live links into the archive, while preserving ledger retrieval paths, pinned history and immutable migration comments |

**Not split, by design for now.** The content procedures in the content pipeline document, environment troubleshooting in the environments document, the alert runbooks in observability, and the migration rules in the migrations guide stayed whole. ADR-023's placement test would send procedures to `guides/` and rules to `.claude/rules/`. Each split is a separate move with no content change, to follow the archive's removal, by 2026-10-27.

### Migration, in Pull Requests

Each PR must be coherent and pass its own checks. Keep moves in pure `git mv` commits, but do not promise automatic conflict-free integration: Git detects renames heuristically, and adding a new file at an old path can merge without a textual conflict. Before each move PR, capture `git ls-files '*.md'` and review `git diff --name-status -M <base>...HEAD`; include every repository-authored Markdown file, including colocated files and `.github`, while treating vendored skill bodies as tooling. After integrating other sessions' branches, re-run the inventory, retired-path and live-link checks, move any newly added old-path file, and recheck duplicate IDs and citations. Code comments in applied migrations and the ledger's pinned historical paths are deliberate exceptions, not strings to rewrite. The guard reports old paths; use this mapping to choose the new home. Keep an explicit receipt for files that disappear or split; rename detection alone does not establish preservation.

1. **Records** (this record's second pull request):
   - `docs/records/` holds the open records, one index (`README.md`: Now, Active, Waiting, and how records work) and the ledger (`closed.md`, 928 lines from the archive).
   - The specs, brainstorming, audits and QA registers are retired: QA procedures move to `docs/guides/qa/`, and ideas to `docs/product/ideas.md`.
   - The 27 Deferred rows become 19 self-contained Waiting rows (two pairs merged) and 2 product ideas; DEBT-472's fired trigger becomes DEBT-519, and 3 rows are dropped as shipped, obsolete or superseded. The three idle brainstorms join the ideas list.
   - The guard requires unique IDs, rejects files left in a retired folder, and rejects links into records outside the index.
   - `scripts/next-record-id.ts` computes IDs.
   - `AGENTS.md`'s records sections become a pointer.
   - ADR-023 lands here.
2. **Agent instructions** (this record's third pull request):
   - `AGENTS.md` drops from 58 KB (66 KB before the records step) to about 12 KB, inside Codex's default 32 KiB read. It has no record IDs or dates. Its runbooks move to [Review and Merge](../guides/release/review-and-merge.md) and the deployment procedure's new promotion section. Its owner rulings move to ADR-024 (review, merge and promotion) and ADR-025 (test doubles).
   - `CLAUDE.md` imports it with `@AGENTS.md`, so Claude Code reads it too, and keeps only Claude-specific notes. `.claude/rules/git-workflow.md`, a copy of `AGENTS.md`'s process sections, is deleted.
   - Each path-scoped rule maps to its paths for CodeRabbit with `applyTo`. Until now every rule applied only to its own folder.
   - `tests/agent-instructions.test.ts` enforces the 16 KiB budget, the import, and no IDs or dates in instruction files. It also checks that each rule is named in `AGENTS.md` and mapped for CodeRabbit to the same paths Claude Code loads it for.
   - Also in this step:
     - the front-door `README.md`, whose setup no longer worked;
     - the three skills that contradict the repository, pruned;
     - Tailwind kept from scanning instruction files for classes.
3. **Layout moves.** Pure renames into the layout, plus every path that code, tests, workflows, configuration and open issues name, and `docs/README.md`.
4. **Layout content:**
   - the master spec renamed and corrected in place, nothing removed;
   - merges and rewrites;
   - the stale snapshots deleted, and the contradictions fixed;
   - the ADR README, the amendments, and ADR-026 (Sentry) and ADR-027 (the free trial and renewal notices).
5. **Archive removal.**
   - Permanent links replace the remaining live links into the archive; most are gone with their files by then.
   - `docs/_archive/` is deleted, along with the asset folders only it links.
   - The guard rejects live, unpinned archive destinations and recreated archive files. It permits commit-pinned historical URLs, ledger retrieval paths, immutable applied-migration comments, and scanner fixtures; a blanket string ban would reject the history the ledger must retain.
   - An exact-path CodeRabbit deletion filter lands in a separate reviewed PR first, because the deletion spans about 1,460 files. Review the deletion manifest, ledger reachability, extracted lessons and rewritten live links before filtering; verify the effective configuration and remaining file count against the actual plan limit. Remove the temporary filter afterwards so reintroduced files cannot silently escape review.
6. **Pilot.** The next three records close under the model; the rules are adjusted once, from what they show.

### Risks

- **History.** Retrieval is preserved only after the reachability checks: git keeps every version, and the ledger points to each record's last version. What is lost is searching closed records in the working tree. `git log -S'<term>' -- docs/_archive` recovers that when it is needed.
- **Lessons already archived.** The current convention moves unfinished tails out at close, but not lessons, so some live only in the 856 archived numbered records. The purge first reviews the archived records cited by live code and policies, plus every archive asset linked by a live document, for unique rationale that needs a live home. Do not claim that a working permalink proves the knowledge was harvested. Broader extraction or substantive deletion beyond snapshots and exact duplicates needs the owner’s decision. The 91 archived IDs cited in code resolve through the ledger, and a lesson that matters is reached from its citation. For each future record, the reviewing agent checks the harvest at close.
- **Old links.** Links that pin a commit keep working. Links to `docs/_archive/` paths on a branch break, as they did once already when each record was archived.
- **A large deletion.** It is mostly removed lines, but about 1,460 files may exceed CodeRabbit's per-review limit, and merging needs an exact-head approval. CodeRabbit counts files after path exclusions (its plans documentation). Use the reviewed deletion-only filter described above before attempting the purge review, retain review of every addition/modification, and coordinate the shared review slot. Do not buy capacity or weaken exact-head approval without the owner.

## Owner Decisions

- [x] Approve option G, or amend it. Approved 2026-10-11, and widened to every document.
- [x] The master spec: keep it whole and correct it in place, keeping its API contracts; remove nothing but its four navigation stubs (2026-10-11).
- [x] Move `legal/` and `security/` under `policies/` (2026-10-13).
- [x] Delete `docs/_archive/` and the asset folders only it links, after the lessons review (2026-10-13).
- [ ] Drop the history sections the layout's rules exclude from living documents: question rendering's §12 changelog and the retry document's §8–10. They stay, under the preserve-content ruling, until the owner decides.
- [ ] Optional: a CodeRabbit plan with a higher review limit, since that limit is now the bottleneck shared across repositories.

## Verification

- [x] The owner approves the model (2026-10-11).
- [x] Step 0: every live document has a disposition and a target path, and a second agent has challenged them (2026-10-11; ADR-023 and the mapping above).
- [x] The ledger is complete: every archived record has a line, and every record ID cited in code resolves (2026-10-13: all 920 archived records have a line whose path matches, every file is retrievable at its last commit, and the only unresolved cited ID is a test fixture's).
- [ ] Every Deferred row is self-contained, and no live link points into `docs/_archive/`.
- [ ] The archive and the asset folders only it links are deleted, and a guard keeps the archive deleted.
- [x] The records index describes delete-on-close, `AGENTS.md` and `CLAUDE.md` point to it, and the guard enforces it: no closed record stays live, and every closure from the cutover carries its receipt (#1467 and #1471).
- [x] Step 6: the live documents follow the target layout, and no hard-coded path points to an old location (2026-10-13: the guard reports no broken live link and no file in a retired folder; old paths remain only in history, applied migrations and fixtures).
- [ ] Three records are closed under the model, and the reviewing agent reports no lost knowledge.
- [ ] A month later, these are re-measured against this record's table: the share of documentation-only PRs, the search-noise ratios, and the record lines in the tree.

## Related

- [ADR-023](../adr/adr-023-documentation-organisation.md): the layout, names and content rules this migration follows.
- [How records work](./README.md#how-records-work): the records rules that replace `AGENTS.md`'s "Closing and Archiving Documentation Records" (DEBT-488, 2026-09-21) and "Register Indexes and Records" (2026-10-05). Those two rounds slimmed the indexes but kept the archive.
- DEBT-515: CodeRabbit learned lasting rules from record text.
