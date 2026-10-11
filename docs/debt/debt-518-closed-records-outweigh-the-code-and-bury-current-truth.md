# DEBT-518: Closed Records Outweigh the Code and Bury Current Truth

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — migration plan written; waiting for the owner's approval before step 1
**Priority:** P2
**Date:** 2026-10-11
**Resolved:** —
**Verification receipts:** —

---

## Summary

Every bug and debt item here is written up as a numbered Markdown record before it is fixed. A second agent challenges it, and once it ships it is moved to `docs/_archive/`. Writing first and challenging the write-up are the valuable part: on 2026-10-11 a reviewer's heads-up overturned a just-shipped design (DEBT-503 item 5).

Keeping every closed record in the working tree is not. The archive is now about twice the size of the production code, and it outnumbers the live documents in every search. Closing a record is a ceremony of its own, and record edits take review capacity that code needs.

This record measures the setup, sets out what each kind of document is for, compares the options, and plans a move to **records as working files**: written first, challenged on the branch, shipped with their fix, and deleted on close, leaving a one-line ledger entry. **Nothing changes until the owner approves the plan.**

## Evidence

Measured 2026-10-11 on `dev` at `46329e4a`.

| What | Measure |
|------|---------|
| `docs/_archive/` | 932 files, 131,239 lines: 309 bugs, 510 debt, 42 specs, 61 brainstorming, 10 audits, and the frozen register histories |
| Live records | `docs/bugs/` 13 files (1,274 lines); `docs/debt/` 37 files (4,162 lines) |
| Production TypeScript, tests excluded | 69,719 lines |
| Archive growth | files added: June 55, July 77, August 3, September 33, October 1–11 41 |
| Search noise | Markdown files matching, live against archived: "Clerk" 68/231, "CodeRabbit" 28/118, "Stripe webhook" 11/64, "Sentry" 35/56, "rate limit" 30/47 |
| Links into the archive | 690 links in 199 live files |
| Code and test files citing a record ID | 463 |
| Pull requests to `dev` since 2026-09-11, Dependabot excluded | 196, of which 189 (96%) edit a record, 28 (14%) are documentation-only, and 38 touch the archive. Documentation is a third of all changed files (1,245 of 3,662). |
| Process tooling | 2,308 lines: `scripts/documentation-archive.ts` and its test, the due-check script, test and workflow, the asset budget and its test, and three register and heading tests. Plus `AGENTS.md`'s Documentation section, 188 lines. |
| Review capacity | CodeRabbit's plan allows one review an hour. On 2026-10-11, four sessions here and the addiction-final-2026 repository shared it, and the queue was five reviews deep. |

## What Each Kind of Document Is For

- **A record is a working document.** While the work is open, it holds the hypothesis, the evidence, the options and the decided fix. A second agent can challenge it before code exists, and it outlives the session that wrote it. It is worth most before the fix, and close to nothing once the fix is verified.
- **Lasting knowledge has better homes, each kept true by something:**
  - what the system does: the code and its tests, which run;
  - why the code has its shape: a comment where it happens (463 files already cite a record ID);
  - how we work: `AGENTS.md`, `.claude/rules/` and `docs/dev/`;
  - what was decided, and what else was weighed: an ADR, which is not edited once accepted, only superseded ([Fowler, *Architecture Decision Record*](https://www.martinfowler.com/bliki/ArchitectureDecisionRecord.html));
  - what happened, with its receipts: pull-request descriptions and git history, permanent and unchangeable.
- **An archived record is none of these.** It is a second, frozen copy of the story of a problem that no longer exists, kept where searches and agents read it beside what is true now. A document that is no longer true but looks current is worse than none.

## Problems

1. **The archive buries what is true.** In the searches above, archived files outnumber live ones by up to 6 to 1. An agent that reads an archived claim as current acts on something that stopped being true. In this repository, agents add an exclusion for the archive to nearly every search.
2. **Closing is a ceremony.**
   - The record is moved with `git mv`.
   - Every inbound and outbound link is rewritten for its new depth.
   - The register rows and the Now stanza are edited.
   - The guard checks all of it.

   The links into the archive keep growing: 690 now.
3. **Review capacity goes to bookkeeping.** A documentation-only PR spends an hourly CodeRabbit slot and a promotion. Record edits ride in almost every PR, and CodeRabbit has learned lasting rules from record text (DEBT-515). [BUG-336](../bugs/bug-336-local-e2e-cleanup-gives-up-on-a-slow-process-listing.md), filed in the same PR as this record, shows the cost of a small fix: a record, a Verifying status, and a later move, all for a one-line change.
4. **The format needs heavy tooling.** 2,308 lines of tooling and 188 lines of rules exist mostly to move and check closed files.
5. **It grows without limit,** by 30 to 80 files a month.

## Options

- **A. Keep course.** All five problems remain, and grow.
- **B. Purge the archive once, and keep the process.** It fixes problem 1 today. Problems 2 to 5 return as the archive refills, and the move ceremony stays.
- **C. Move records to GitHub Issues.** It is common practice, and it removes the archive. Here it would cost more than it saves:
  - every read and write spends the shared GitHub API allowance of 5,000 requests an hour, which one session exhausted on 2026-10-10;
  - issues cannot be searched locally, or reviewed in the same diff as their fix;
  - issue edits go unreviewed, and agents write them as the owner, which is DEBT-515's problem;
  - the guard and due-check tooling would need rewriting.

  Issues stay for notifications, which they suit: the advisory watcher and the weekly due-check issue.
- **D. Move the archive to another repository, branch or wiki.** It removes the search noise, but keeps a second store to maintain and link into, and the move ceremony stays.
- **E. Records as working files, deleted on close.** *Chosen, subject to the owner's approval.*

## Decided Plan

### The Model

1. **When to file.**
   - File a record when the work spans more than one pull request, or needs an independent challenge before any code.
   - A fix that is already proven and lands in one pull request uses that PR's description as its record. The description has the same sections as a record: evidence, options, decision and verification.
2. **Write first, and challenge on the branch.**
   - Commit the record first on the work branch, and push the branch without opening a PR.
   - A second agent challenges it there, and corrects it in place with a `Corrected YYYY-MM-DD` note.
   - No CodeRabbit review is spent until there is code.
3. **Ship it with its fix.** The record and its fix go up in one pull request, so one review covers both. A record that must be visible before any code, such as an investigation or a decision deferred to the owner, still merges alone. That should be rare.
4. **Close by deleting.** Once a record's checks are recorded, the next pull request that touches its register:
   1. moves any lasting knowledge to its home: a rule to `AGENTS.md` or `docs/dev/`, a decision to an ADR, a reason to a code comment, and an unfinished tail to the Deferred table;
   2. deletes the file;
   3. adds one ledger line: ID, title, disposition, date, closing PR, and a permanent link to the record's last version.
5. **Keep what works:** the Now stanza; the Active, Verifying, Parked and Deferred tables; due dates and the weekly due-check issue; one-line statuses; `Corrected` notes; and red-first evidence.
6. **Scope.**
   - ADRs are never deleted, only superseded.
   - Living guides, policies and `master_spec*.md` stay live.
   - Specs, brainstorming and audits follow the record rule.

### Migration

Do steps 1 to 4 in one pull request: the ledger and the rewritten links must exist before the delete, and the guard must change with the tree.

1. **Ledger.** Generate `closed.md` beside each register index from the archive: one line per record, giving ID, title, final disposition, and a GitHub permanent link to the last commit that held it. A test requires a ledger line for every archived record, and every record ID cited in code to resolve to a live record or a ledger line.
2. **Links.** Rewrite the 690 live links into `docs/_archive/` as GitHub permanent links at that commit, keeping their fragments. The guard does not follow web addresses. A test requires that no live file links into `docs/_archive/`.
3. **Delete** `docs/_archive/`, including the frozen register histories, and update the references in `.coderabbit.yaml` and `proxy.ts`.
4. **Rules and tooling.**
   - Rewrite `AGENTS.md`'s "Closing and Archiving Documentation Records" for delete-on-close, and update `CLAUDE.md` with it.
   - Reduce the guard to live-tree checks plus the ledger.
   - Retire the archive-only checks.
   - Add a ratchet so nothing can be added under `docs/_archive/` again.
5. **Pilot.** The next three records follow the model. Adjust the rules once, from what those three show.

**Before step 1:** announce the window to the other sessions, so that no open branch edits an archived file.

### Risks

- **History.** Nothing is lost: git keeps every version, and the ledger links each record's last version. What is lost is searching closed records in the working tree. `git log -S'<term>' -- docs/_archive` recovers that when it is needed.
- **Lessons.** The harvest at close carries them, and the reviewing agent checks it.
- **Old links.** Links that pin a commit keep working. Links to `docs/_archive/` paths on a branch break, as they did once already when each record was archived.
- **A large deletion.** It is mostly removed lines. CodeRabbit reviews the ledger, the rules and the rewritten links.

## Owner Decisions

- [ ] Approve option E, or amend it.
- [ ] Optional: a CodeRabbit plan with a higher review limit, since that limit is now the bottleneck shared across repositories.

## Verification

- [ ] The owner approves the model.
- [ ] The ledger is complete: every archived record has a line, and every record ID cited in code resolves.
- [ ] No live link points into `docs/_archive/`, the folder is deleted, and a guard keeps it deleted.
- [ ] `AGENTS.md`, `CLAUDE.md` and the guard describe and enforce delete-on-close.
- [ ] Three records are closed under the model, and the reviewing agent reports no lost knowledge.
- [ ] A month later, these are re-measured against this record's table: the share of documentation-only PRs, the search-noise ratios, and the record lines in the tree.

## Related

- `AGENTS.md`: [Closing and Archiving Documentation Records](../../AGENTS.md#closing-and-archiving-documentation-records), adopted 2026-09-21 (DEBT-488), and "Register Indexes and Records", adopted 2026-10-05. Those two rounds slimmed the indexes but kept the archive.
- [DEBT-515](./debt-515-coderabbit-learns-rules-from-agents.md): CodeRabbit learned lasting rules from record text.
