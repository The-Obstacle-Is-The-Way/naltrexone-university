# DEBT-339: Consolidate Question Instruction Files

**Priority:** P2
**Created:** 2026-03-25
**Updated:** 2026-03-27 (consolidation complete in both repos)
**Status:** Resolved — local consolidation done (2026-03-25), external sync done (2026-03-27)
**Source:** DEBT-338 consolidation section, extracted into standalone debt doc
**Scope:** `content/drafts/questions/*.md` instruction files (synced to external `addiction-final-2026` repo)
**Prerequisite for:** DEBT-338 Phase 2 (YAML frontmatter migration)

---

## Current State

**Local execution complete (2026-03-25):**
- `SCHEMA.md` now absorbs the active content that previously lived in `QUESTION-FORMAT-SPEC.md`, `TAG-TAXONOMY.md`, and `META.MD` Part 2.
- `PLAN.md` now carries the current inventory/integrity snapshot that previously lived in `META.MD` Part 1.
- `NOTES.md` now carries the archival bootstrap material from `META.MD`.
- `CLAUDE.md` and `AGENTS.md` now act as true quick-starts that point agents to `SCHEMA.md` instead of duplicating spec/taxonomy/checklist content.
- `QUESTION-FORMAT-SPEC.md`, `TAG-TAXONOMY.md`, and `META.MD` have been removed from this repo after absorption.

**External sync complete (2026-03-27):**
- Consolidated survivor files were copied to external `addiction-final-2026`
- Absorbed legacy files there were removed after destination content was verified

**Remaining work:** None. DEBT-339 is resolved.

---

## Problem (Pre-Consolidation Snapshot)

Before local execution, there were **8 instruction files** in `content/drafts/questions/` that told agents how to generate and format questions. These files were manually copied to the external `addiction-final-2026` repo. They had significant overlap and fragmentation:

| File | Lines | Purpose | Problem |
|------|-------|---------|---------|
| `AGENTS.md` | 136 | Agent quick-start | Substantial overlap with `CLAUDE.md`: same required reading order, paper targets, special-case rules, Prescriber's Guide filter, and vocabularies; unique content is mostly presentation and emphasis |
| `CLAUDE.md` | 129 | Claude Code quick-start | Substantial overlap with `AGENTS.md`; both must be manually kept in sync even though their main differences are checklist framing and wording |
| `META.MD` | 316 | Current inventory/integrity snapshot + archival bootstrap appendix | High-value NBME quality guidance is mixed with historical audit-prompt material; archival formatting examples predate DEBT-338 and should not be treated as the active parser contract |
| `NOTES.md` | 862 | Audit log, corruption findings, historical quality workups | Valuable, but mixes active references (DEBT-338 corruption list, Prescriber's rewrite queue) with older one-time audits and partially overlaps `META.MD` / `PLAN.md` on inventory or status snapshots |
| `PLAN.md` | 224 | Progress tracker | Useful and should remain separate, but its article-based completion/status data partially overlaps `META.MD` and `NOTES.md` |
| `QUESTION-FORMAT-SPEC.md` | 615 | Complete pipeline spec | Heavily overlaps `SCHEMA.md` on format, validation, checklist, and tag vocabulary; also carries pipeline/validation detail that must not be lost |
| `SCHEMA.md` | 351 | Authoring schema, checklist, special cases | Heavily overlaps `QUESTION-FORMAT-SPEC.md` and still points agents to other files for active quality guidance |
| `TAG-TAXONOMY.md` | 199 | Canonical tag tables, migration rules, runtime taxonomy rationale | Should be absorbed into `SCHEMA.md` or archived explicitly; otherwise taxonomy rationale and migration maps risk drifting from the active schema |

**An agent previously had to read 4+ files** just to understand the question format. Quality rules (DEBT-338 ordering, one-bullet-per-choice, no-choice-text-prefix) were scattered across at least 4 files and had to be kept manually in sync. That drift risk directly contributed to the formatting inconsistencies that caused DEBT-338.

---

## Specific Overlap Inventory

### Tag Vocabularies (duplicated 3x)
The same 13 topics, 11 substances, 12 treatments appear in:
- SCHEMA.md
- QUESTION-FORMAT-SPEC.md
- TAG-TAXONOMY.md

### Quality Checklist / Critical Rules (duplicated 4x)
Clinical-pearl ordering, one-bullet-per-choice, no-choice-text-prefix rules appear in:
- AGENTS.md
- CLAUDE.md
- SCHEMA.md
- QUESTION-FORMAT-SPEC.md

### Inventory / Progress Data (duplicated 3x)
The overlap here is **partial, not identical**:
- `META.MD` carries the current 948-question inventory and integrity snapshot
- `NOTES.md` repeats the 948-question integrity snapshot and multiple historical audit/status summaries
- `PLAN.md` carries the 480-question article-based generation/progress tracker and per-chapter completion tables

These three files are all carrying inventory/progress context, but not the exact same facts in the exact same form.

### Quick-Start Instructions (duplicated 2x)
Required reading order, per-paper targets, special cases, Prescriber's Guide addiction-relevance filter, and vocabularies appear in:
- AGENTS.md
- CLAUDE.md

---

## Two-Repo Workflow Context

```
naltrexone-university-3/content/drafts/questions/*.md  (instruction files — tracked in git)
        ↕  manually copied
addiction-final-2026/questions/*.md                     (same instruction files)
addiction-final-2026/questions/**/*.md                  (actual question content)
        ↓  pnpm content:import:drafts
naltrexone-university-3/content/questions/imported/     (imported MDX — gitignored)
        ↓  pnpm db:seed
database                                                (production data)
```

Instruction files must be accurate in BOTH repos. Fewer files = less surface area to keep in sync = less drift.

---

## Consolidation Target: 8 → 5 Files

| File | What It Becomes | Absorbs |
|------|----------------|---------|
| `CLAUDE.md` | Claude Code agent quick-start. Single file to read first for question generation. | Stays, but trims duplicated taxonomy/checklist content that moves into `SCHEMA.md` |
| `AGENTS.md` | Non-Claude agent quick-start. Same reading path and content model as `CLAUDE.md`, adjusted only for interface-specific phrasing. | Stays, with the same deduplication target as `CLAUDE.md` |
| `SCHEMA.md` | **Single source of truth** for active authoring: YAML frontmatter spec, markdown body contract, taxonomy, migration maps, pipeline behavior, validation rules, current quality checklist, special cases, commands. | Absorbs `QUESTION-FORMAT-SPEC.md`, `TAG-TAXONOMY.md`, and the still-active quality guidance from `META.MD` Part 2 |
| `NOTES.md` | Historical audit log and known-issue tracker. Not required reading for routine generation. | Keeps parser-corruption findings, Prescriber's rewrite queue, DSM-5 conversion audit, stabilization history, and any archival quality examples that should not remain in the active spec |
| `PLAN.md` | Progress tracker and current inventory/status snapshot. Separate concern. | Receives the current inventory/integrity summary from `META.MD` Part 1 |

### Files Removed After Absorption
- `QUESTION-FORMAT-SPEC.md` → absorbed into SCHEMA.md
- `TAG-TAXONOMY.md` → absorbed into SCHEMA.md
- `META.MD` → split deliberately: current inventory/integrity snapshot → `PLAN.md`; active quality guidance → `SCHEMA.md`; archival bootstrap/audit material → `NOTES.md` or explicit archive

### Agent Reading Path After Consolidation
An agent generating questions reads **2 files**:
1. `CLAUDE.md` (or `AGENTS.md`) — quick-start, workflow, critical rules
2. `SCHEMA.md` — complete format spec, tags, validation, quality checklist

That's it. No more "also read QUESTION-FORMAT-SPEC.md, TAG-TAXONOMY.md, META.MD Part 2."

---

## What Must NOT Be Lost

During consolidation, verify these are preserved somewhere:

| Content | Current Location | Target Location |
|---------|-----------------|-----------------|
| NBME quality standards (cover-the-options, distractor rules, etc.) | META.MD Part 2 | SCHEMA.md (quality section) |
| Good/bad question examples | META.MD Part 2 | NOTES.md (reference) or SCHEMA.md (if still useful for agents) |
| Prescriber's Guide per-medication rewrite analysis | NOTES.md | NOTES.md (stays) |
| 24 corrupted files list with line numbers | NOTES.md | NOTES.md (stays) |
| Legacy tag migration maps | TAG-TAXONOMY.md | SCHEMA.md (migration section) |
| Content gap analysis (thin inhalants, cocaine, etc.) | TAG-TAXONOMY.md | SCHEMA.md or PLAN.md |
| Pipeline commands (`pnpm content:import:drafts`, etc.) | QUESTION-FORMAT-SPEC.md | SCHEMA.md (commands section) |
| Validation rejection table (what the importer rejects) | QUESTION-FORMAT-SPEC.md | SCHEMA.md (validation section) |
| Per-chapter completion checkboxes | PLAN.md | PLAN.md (stays) |
| Current inventory + integrity snapshot (948 total, exceptions, fast-check commands) | META.MD Part 1 | PLAN.md (current status) or NOTES.md (if historical context is needed) |
| Special-case source/folder rules (Prescriber's recall-only, full-book conversion folders, correction notice folder) | SCHEMA.md | SCHEMA.md (special cases section) |
| Prescriber's Guide QID / source exceptions | SCHEMA.md | SCHEMA.md (QID + special cases sections) |
| Unsupported / future YAML field guidance (`citation`, `doi`, etc.) | SCHEMA.md + QUESTION-FORMAT-SPEC.md | SCHEMA.md (future extensions / unsupported fields section) |
| Tag taxonomy decision history, display order, and UI rationale | TAG-TAXONOMY.md | SCHEMA.md (runtime taxonomy notes) or explicit archive |
| DSM-5 conversion audit and stabilization history | NOTES.md | NOTES.md (stays) |
| Prescriber's Guide ~19 off-target rewrites (PENDING) | NOTES.md | NOTES.md (stays) |

---

## Relationship to DEBT-338

DEBT-338 has a "Content Instruction File Consolidation" section that describes this same plan. That section is now marked done there and cross-references this archived debt doc.

**Sequencing (historical):**
1. ~~Phase 1: Strict parser validation~~ — done (2026-03-24)
2. ~~DEBT-339 local consolidation in this repo~~ — done (2026-03-25)
3. ~~Transplant consolidated docs to external `addiction-final-2026` repo~~ — done (2026-03-27)
4. ~~Fix 24 corrupted files (external repo) — guided by the consolidated docs~~ — done (2026-03-27)
5. Phase 2: YAML frontmatter migration (both repos)

Consolidation should happen BEFORE Phase 2 because Phase 2 changes the question format. Updating 8 fragmented files for the new format will introduce inconsistencies. Consolidate first, then update the consolidated docs once.

---

## Additional Content That Should Be In the Consolidated Docs

When consolidating, also ensure these are clearly documented (from DEBT-338 findings):

1. **The ideal question format** — a complete example showing the current correct format with clinical pearl before wrong-answer section, one bullet per choice, `### Reference` at end
2. **The future ideal format** — a complete example showing YAML frontmatter with `explanation` field on each choice (Phase 2 target, so agents know where we're heading)
3. **The 24 corrupted files** — a clear list of what needs fixing in the external repo, already in NOTES.md but should be easily findable
4. **The Prescriber's Guide off-target rewrite queue (~19 questions)** — still pending per NOTES.md
5. **Special-case source rules** — Prescriber's recall-only format, full-book conversion folders, and the therapy correction-note folder must remain easy to find
6. **Current validation path** — `pnpm content:import:drafts -- --dry-run` and the fact that there is no separate dedicated validator script should remain documented somewhere current

---

## Acceptance Criteria

- [x] `SCHEMA.md` absorbs the active content of `QUESTION-FORMAT-SPEC.md`: current-format example, frontmatter contract, markdown body contract, answer/shuffling notes, tag flow summary, validation rejection table, commands, and author checklist
- [x] `SCHEMA.md` absorbs the active content of `TAG-TAXONOMY.md`: canonical tag tables, migration maps, taxonomy rationale/display order, and content-gap priorities
- [x] `SCHEMA.md` absorbs the still-active authoring guidance from `META.MD` Part 2: NBME quality principles, distractor rules, explanation standards, quality self-check, and archival examples are either omitted deliberately from the active spec or preserved in `NOTES.md`
- [x] `PLAN.md` becomes the single current inventory/progress tracker: total counts, source-level counts, per-chapter completion, known no-question exceptions, and fast-check commands
- [x] `NOTES.md` retains historical audits and ongoing queues: Prescriber's relevance audit, DSM-5 conversion audit, stabilization history, parser-corruption audit, rewrite queues, and archival bootstrap context
- [x] Any section of `META.MD`, `QUESTION-FORMAT-SPEC.md`, or `TAG-TAXONOMY.md` not moved into `SCHEMA.md` or `PLAN.md` is explicitly preserved in `NOTES.md` rather than silently dropped
- [x] `QUESTION-FORMAT-SPEC.md`, `TAG-TAXONOMY.md`, and `META.MD` are removed intentionally in this repo after their destination content is verified
- [x] `CLAUDE.md` and `AGENTS.md` now share the same reading path and high-level rules while delegating the full spec/checklist to `SCHEMA.md`
- [x] `SCHEMA.md` includes both a complete current-format example and a clear Phase 2 target-format example
- [x] An agent can generate a correctly formatted question by reading only `CLAUDE.md` (or `AGENTS.md`) plus `SCHEMA.md`; `NOTES.md` and `PLAN.md` are optional reference, not required reading
- [x] No information was lost during local consolidation (verified against the "What Must NOT Be Lost" table above)
- [x] Consolidated files are synced to the external `addiction-final-2026` repo
- [x] Absorbed legacy files are removed or archived in the external repo only after the destination content is verified there
