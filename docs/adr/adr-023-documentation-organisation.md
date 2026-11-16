# ADR-023: Documentation Organisation

**Status:** Accepted (amended 2026-10-11)
**Date:** 2026-10-11
**Decision Makers:** On 2026-10-11 the owner approved records as working files, deleted on close (DEBT-518, option G). The owner widened the revamp to every document, "with clean namespaces and names", and delegated the layout. This ADR records that layout; the owner reviews it in its pull request.
**Executed by:** DEBT-518, in pull requests: records first, then the agent instructions, the layout, and the archive's removal.

---

## Context

On 2026-10-11, four read-only censuses covered every document in the repository: 130 live files under `docs/`, 932 archived records, 586 record assets, the agent instructions and the colocated READMEs. A second agent then challenged the resulting plan. They found:

1. **The agent instructions are not read as written.**
   - Codex reads `AGENTS.md` up to 32 KiB by default, and the file is 64 KiB, so Codex never sees its merge, review, promotion and records rules.
   - Claude Code reads `CLAUDE.md`, which linked `AGENTS.md` without importing it.
   - CodeRabbit applies a guideline file only to its own folder, unless the configuration maps it to the files it governs.
2. **Rules are restated in up to six places, and the copies disagree.**
   - A testing guide recommends the agent-browser login that `AGENTS.md` forbids.
   - A layout document that CodeRabbit loads describes practice action bars the code no longer has.
   - The deploy build command is written three different ways.
   - The 2,215-line `master_spec.md` is called the single source of truth in four places. It disclaims that itself, omits the free trial, and lists 15 of 24 environment variables.
3. **Hand-kept inventories rot; test-parsed registers do not.** Test tables, spec lists, file indexes, coverage maps, version matrices and rate-limit tables had all drifted. The two registers a test parses had not.
4. **Closed records bury current truth.** The archive outnumbers the live documents in every search, and nearly 500 live links point into it (DEBT-518 counts them).
5. **Several registers no longer earn their keep.** Specs has had no new item since June, and brainstorming has three ideas idle since March. Audits close on publication. QA procedures are guides, not records.

## Decision

### 1. One Kind of Document per Folder

```text
docs/
  README.md        the map: each folder's kind, what belongs, the placement test
  product/         what the product must do: behaviour a test can check
  architecture/    how it is built and why: living explanation; integrations/
  adr/             decisions, numbered; README.md is the table and the template
  guides/          how to do a task, by subject: testing/ release/ database/
                   operations/ dependencies/ content/ qa/
  design-system/   the UI standard and the UI pattern catalog
  policies/        commitments the owner adopted: legal/ security/ supply chain
  records/         open bug and debt records, one index, the closed ledger
```

The folders above are the target; DEBT-518 moves documents into them in steps.

- **Agent instructions stay where the tools load them:**
  - `AGENTS.md` for universal rules;
  - `.claude/rules/` for rules scoped to paths;
  - `CLAUDE.md` importing `AGENTS.md`.
- **Colocated READMEs stay beside their code.**
- **Vendored agent skills stay in `.agents/skills/`.** They are tooling, not documentation.

**Placement test.** Take the first match:

| # | If the document… | it goes in |
|---|---|---|
| 1 | is a rule an agent obeys on every edit of some files | `AGENTS.md`, or `.claude/rules/<topic>.md` |
| 2 | is a commitment the owner adopted | `policies/` |
| 3 | is open work on a defect or debt | `records/` |
| 4 | decides between alternatives, and must not change silently | `adr/` |
| 5 | says what the product must do or never do for a user | `product/` |
| 6 | is the UI standard or the UI pattern catalog | `design-system/` |
| 7 | explains how a part is built: its boundaries, invariants and environments | `architecture/` |
| 8 | tells someone how to do a task | `guides/<subject>/` |
| 9 | is a list the code can answer, a snapshot or a receipt | the code, a pull-request description, or nowhere |

### 2. Names

- Lowercase kebab-case `.md`. Each folder's map is `README.md`, which GitHub renders.
- The folder gives the kind and the name gives the subject: `guides/testing/e2e-tests.md`.
- A living document has no date, record ID or version in its name or its headings, which are link anchors.
- Only ADRs (`adr-NNN-slug.md`) and records (`bug-NNN-slug.md`, `debt-NNN-slug.md`) carry IDs. ADR numbers never change, because code and migration file names cite them.

### 3. Content

- **One home per rule.** Every other place links to it.
- **The code owns the facts.** A new document links the code for types, schemas, inventories and lists rather than copying them, and a list kept in a document needs a test that checks it.
- **Preserve what exists.** A revamp moves, renames, corrects and merges. It removes substantive content, such as a specification's contract sections or the reasons behind a design, only with the owner's agreement. Pure snapshots and exact duplicates can go. The master specification is kept whole and corrected in place (owner, 2026-10-11).
- **Records point to documents, never the reverse.**
  - A record is deleted when it closes, so only the records index links records.
  - Everywhere else a record is cited by its ID, which the ledger resolves.
  - Text the owner adopted keeps its links until the owner revises it.
- **History lives in git and pull requests.** Living documents carry no changelogs, receipts or hand-written "Last Updated" lines. Policies keep their adoption and effective dates.

### 4. Records

Records are working files, written first, challenged on the branch, and shipped with their fix. When a record closes it is deleted, and it leaves one line in `docs/records/closed.md`. The full rules are in `docs/records/README.md`.

### 5. ADRs

An accepted ADR's text is frozen, and changes in one of two ways:
- a dated `Amendment — YYYY-MM-DD` section appended at the end, with the status line updated;
- a new ADR that supersedes it.

Mechanical link repair is allowed. Implementation progress belongs in records and pull requests, not in an ADR.

### 6. Agent Instructions

- **`AGENTS.md` stays under Codex's default budget.** It holds tool-neutral rules, with no record IDs, dates or incident history, and links out for detail.
- **Path-scoped rules have one source.** Each lives once in `.claude/rules/`. The globs it applies to appear three times:
  - in its `paths:` front matter, which Claude uses;
  - in an "editing X, read Y" table in `AGENTS.md`, for Codex;
  - in a CodeRabbit `applyTo` mapping.

  A test keeps the three in agreement.

## Consequences

**Gains:**
- One place to look for each kind of document, and one copy of each rule.
- Searches return what is true now.
- Each tool reads the rules it is meant to follow.

**Costs:**
- The migration rewrites links and the paths that code, tests, workflows and configuration hard-code.
- Searching closed records needs `git log -S` or the ledger's commit.
- Two applied migrations name a guide's old path in SQL comments that can never change. The guide's new home says where it came from.

## Alternatives Rejected

- **Keep the archive, purge it once, hide it from search, or move it elsewhere.** DEBT-518 weighs each one.
- **Move records to GitHub Issues.** Every read and write spends the shared API allowance. Issue edits go unreviewed and are written as the owner, and an issue cannot be reviewed in the same diff as its fix.
- **A `reference/` folder.** It would hold hand-kept inventories, which is what rotted. The code and `.env.example` are the reference. A register a test parses lives with its subject.
- **A top-level `vendors/` folder.** It invites copied version tables, which drifted. An integration note explains a boundary, so it belongs in `architecture/integrations/`.
- **Separate `records/bugs/` and `records/debt/` folders.** There is one queue and one set of owner decisions; the ID prefix carries the kind.
- **Canonical engineering rules under `docs/policies/`.** That would be a third normative copy beside `AGENTS.md` and `.claude/rules/`.
- **`index.md` as each folder's map.** GitHub does not render it.

## Related

- DEBT-518: the measurements, the options, and the migration this ADR's layout drives.
- [ADR-019](./adr-019-test-quality-practices.md): its UI QA "register" becomes the QA procedures in `docs/guides/qa/`.

## Amendment — 2026-10-11

The independent review clarifies the layout without changing the owner's preservation decisions:

- A new feature is specified before code in `product/<subject>.md`, with delivery state, acceptance criteria, open decisions and rollout steps. Multi-PR duration alone is not debt. See [Product Documents](../product/README.md).
- Apply the placement test to a document's primary purpose. UI standards remain in `design-system/`; agent instructions route to them instead of duplicating them. Colocated contracts and READMEs remain beside code, with a pointer from the relevant topic. Product contracts in the master remain there unless the owner agrees to consolidate them.
- The records index owns a weekly human queue review. Automation can detect its due date and dated record actions; humans evaluate Waiting triggers and pending owner decisions. The index defines accountability and the evidence for completing that review.
- Closed IDs remain stable. Concurrent candidate IDs are resolved after integrating the target branch, and a newly fired Waiting item gets a new ID or joins an already-open record. Closure verifies that final evidence is retrievable at the ledger's pinned commit before deletion.
- Legal and security files remain in their current folders pending the owner's decision. An exploitable finding stays private through deployment and owner-approved disclosure, including its Git history and reproducer.
