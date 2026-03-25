# DEBT-339: Consolidate Question Instruction Files

**Priority:** P2
**Created:** 2026-03-25
**Source:** DEBT-338 consolidation section, extracted into standalone debt doc
**Scope:** `content/drafts/questions/*.md` instruction files (synced to external `addiction-final-2026` repo)
**Prerequisite for:** DEBT-338 Phase 2 (YAML frontmatter migration)

---

## Problem

There are **8 instruction files** in `content/drafts/questions/` that tell agents how to generate and format questions. These files are manually copied to the external `addiction-final-2026` repo. They have significant overlap and fragmentation:

| File | Lines | Purpose | Problem |
|------|-------|---------|---------|
| `AGENTS.md` | ~137 | Agent quick-start | ~95% identical to CLAUDE.md; both have critical rules, checklists, vocabularies |
| `CLAUDE.md` | ~130 | Claude Code quick-start | ~95% identical to AGENTS.md; must be manually kept in sync |
| `META.MD` | ~317 | Inventory + archival quality standards | Part 1 duplicates PLAN.md/NOTES.md; Part 2 has formatting examples that predate DEBT-338 |
| `NOTES.md` | ~860 | Audit log, corruption findings | Historical reference; growing unboundedly; duplicates inventory from PLAN.md |
| `PLAN.md` | ~225 | Progress tracker | Useful; duplicates inventory from META.MD/NOTES.md |
| `QUESTION-FORMAT-SPEC.md` | ~616 | Complete pipeline spec | Heavily overlaps SCHEMA.md (both cover YAML format, tags, validation, checklist) |
| `SCHEMA.md` | ~352 | YAML format, tags, checklist | Heavily overlaps QUESTION-FORMAT-SPEC.md |
| `TAG-TAXONOMY.md` | ~200 | Canonical tag tables | Could be a section of SCHEMA.md |

**An agent must read 4+ files** just to understand the question format. Quality rules (DEBT-338 ordering, one-bullet-per-choice, no-choice-text-prefix) are scattered across at least 4 files and must be kept manually in sync. This drift risk directly contributed to the formatting inconsistencies that caused DEBT-338.

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
948 total questions, 480 article-based, per-chapter completion status appears in:
- META.MD Part 1
- NOTES.md
- PLAN.md

### Quick-Start Instructions (duplicated 2x)
Workflow, critical rules, vocabularies, Prescriber's Guide addiction-relevance filter appear in:
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
| `CLAUDE.md` | Claude Code agent quick-start. Single file to read for question generation. Critical rules, quality checklist, vocabularies. | Stays largely as-is; removes duplicated rules that now live in SCHEMA.md |
| `AGENTS.md` | Non-Claude agent quick-start. Same structure as CLAUDE.md. | Stays largely as-is; same deduplication |
| `SCHEMA.md` | **Single source of truth** for format: YAML frontmatter spec, tag taxonomy with migration maps, pipeline behavior, validation rules, quality checklist, commands. | Absorbs `QUESTION-FORMAT-SPEC.md` (pipeline spec, commands, validation table, format examples) and `TAG-TAXONOMY.md` (canonical tag tables, migration maps, content gaps) |
| `NOTES.md` | Historical audit log and known-issue tracker. NOT required reading for generation. | Receives META.MD Part 2 archival quality examples; keeps audit findings, corruption log, Prescriber's Guide rewrite queue |
| `PLAN.md` | Progress tracker. Separate concern. | Receives META.MD Part 1 inventory data (single source of truth for question counts, per-chapter status) |

### Files Removed After Absorption
- `QUESTION-FORMAT-SPEC.md` → absorbed into SCHEMA.md
- `TAG-TAXONOMY.md` → absorbed into SCHEMA.md
- `META.MD` → split: Part 1 inventory → PLAN.md; Part 2 archival quality standards → NOTES.md or archived; active quality guidance → SCHEMA.md

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
| Prescriber's Guide 19 off-target rewrites (PENDING) | NOTES.md | NOTES.md (stays) |

---

## Relationship to DEBT-338

DEBT-338 has a "Content Instruction File Consolidation" section that describes this same plan. After DEBT-339 is resolved, that section of DEBT-338 can be marked done and cross-referenced here.

**Sequencing (from DEBT-338):**
1. ~~Phase 1: Strict parser validation~~ — done
2. Fix 24 corrupted files (external repo) — pending
3. **DEBT-339: Consolidate instruction files (both repos)** ← this doc
4. Phase 2: YAML frontmatter migration (both repos)

Consolidation should happen BEFORE Phase 2 because Phase 2 changes the question format. Updating 8 fragmented files for the new format will introduce inconsistencies. Consolidate first, then update the consolidated docs once.

---

## Additional Content That Should Be In the Consolidated Docs

When consolidating, also ensure these are clearly documented (from DEBT-338 findings):

1. **The ideal question format** — a complete example showing the current correct format with clinical pearl before wrong-answer section, one bullet per choice, `### Reference` at end
2. **The future ideal format** — a complete example showing YAML frontmatter with `explanation` field on each choice (Phase 2 target, so agents know where we're heading)
3. **The 24 corrupted files** — a clear list of what needs fixing in the external repo, already in NOTES.md but should be easily findable
4. **The Prescriber's Guide 19 off-target rewrites** — still PENDING per NOTES.md

---

## Acceptance Criteria

- [ ] QUESTION-FORMAT-SPEC.md content absorbed into SCHEMA.md (pipeline spec, commands, validation table, format examples)
- [ ] TAG-TAXONOMY.md content absorbed into SCHEMA.md (canonical tag tables, migration maps, content gaps)
- [ ] META.MD redistributed: active quality guidance → SCHEMA.md; inventory → PLAN.md; archival content → NOTES.md or archived
- [ ] QUESTION-FORMAT-SPEC.md, TAG-TAXONOMY.md, META.MD removed from both repos
- [ ] CLAUDE.md and AGENTS.md reference consolidated SCHEMA.md; no duplicated quality rules (rules live in SCHEMA.md, quick-starts reference them)
- [ ] SCHEMA.md includes complete current-format example AND Phase 2 target-format example
- [ ] Consolidated files synced to external `addiction-final-2026` repo
- [ ] An agent can generate correctly formatted questions by reading only CLAUDE.md + SCHEMA.md
- [ ] No information was lost during consolidation (verified against "What Must NOT Be Lost" table above)
