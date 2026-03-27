# DEBT-338: Seed Parser Silently Accepts Malformed Wrong-Answer Sections

**Priority:** P1
**Created:** 2026-03-24
**Updated:** 2026-03-27 (Phase 1 done, content alignment done, consolidation done; Phase 2 design decisions locked — only implementation remains)
**Status:** Open — only Phase 2 (YAML frontmatter migration) remains; all other work is complete
**Source:** Codebase-wide audit after DEBT-335 / adjacent to [DEBT-336](./debt-336-content-markdown-quality-pass.md)
**Scope:** `scripts/seed-helpers.ts` parser validation, content format alignment in external `addiction-final-2026` repo, long-term parser architecture

---

## Problem

`parseChoiceExplanations()` in `scripts/seed-helpers.ts` does line-by-line regex parsing of the `**Why other answers are wrong:**` section. Its fundamental logic is:

1. If a line matches `CHOICE_BULLET_PATTERN` → start a new choice
2. If a line doesn't match and a bullet is open → **silently append to that bullet's body**
3. If a line doesn't match and no bullet is open → **silently drop the line**

This means any non-bullet content inside the wrong-answer section is either silently eaten by whatever choice happens to be "open," or silently dropped. There is no concept of "this line doesn't belong here — error."

**This is not hypothetical. It is corrupting live data in the database right now.**

---

## Verified Live Corruption

### Pattern 1: Clinical Pearl Contamination (23 files)

When a `**Clinical Pearl:**` paragraph appears AFTER the wrong-answer bullets instead of before them, the parser appends the clinical pearl text to the last choice's explanation. The learner sees the clinical pearl jammed into a wrong-answer card instead of in the general explanation.

**Example** — `levy-2023-006.mdx`:

```markdown
**Why other answers are wrong:**
- A) The extra questions in TAPS did not improve performance...
- B) While BSTAD had excellent sensitivity for some substances...
- C) S2BI did not have superior specificity...

**Clinical Pearl:** The S2BI showed higher rates of substance use disclosure...
```

The parser produces: choice C explanation = `"S2BI did not have superior specificity...\n\n**Clinical Pearl:** The S2BI showed higher rates..."` — the clinical pearl is contaminating C's wrong-answer explanation.

**Affected files (23):**

| Source Paper | Files |
|-------------|-------|
| jones-2023 | jones-2023-001, -002, -006, -007, -008 |
| levy-2023 | levy-2023-001, -003, -004, -005, -006, -007, -008 |
| nelson-2022 | nelson-2022-001, -003, -004, -005, -006, -007, -008, -011, -012 |
| white-2020 | white-2020-004, -012 |

All are in `content/questions/imported/article-based-pathway/`. The same ordering issue exists in the corresponding draft source files in the external `addiction-final-2026` repo.

### Pattern 2: Combined-Label Bullet Drop (1 file)

`palis-2022-002.mdx` uses `- A, B, D) While descriptive, these are not the specific term cited in the literature` to explain three wrong answers in a single bullet. The regex `CHOICE_BULLET_PATTERN` cannot match this (the comma after `A` breaks the delimiter group). Since no prior bullet is open, the entire line is silently dropped. All three choice explanations are `null`.

**Affected file:** `content/questions/imported/article-based-pathway/palis-2022/palis-2022-002.mdx`

### Verified NOT Present (0 additional files)

A scan of all 948 imported MDX files confirmed zero **additional** instances of:
- Invalid labels outside A–E (e.g., `- F)`)
- Duplicate labels
- Missing wrong-answer headings
- Literally blank wrong-answer subsections (heading present, then only blank lines until the next heading)

The single combined-label file (`palis-2022-002`) is already tracked above and is also the only current case where the heading contains non-empty content but zero valid parsed bullets / non-bullet content before the first valid bullet.

Windows line endings are **not** part of the problem: `parseChoiceExplanations()` normalizes `\r\n` / `\r` to `\n` before parsing.

### Additional Latent Risks (Verified Parser Behavior, Not Present in Current Corpus)

These patterns are not present in the current 948-file corpus, but they are real parser hazards verified against the live implementation:

- **Top-level numbered lists are silently ignored.** If an author writes `1. A is wrong` / `2. B is wrong` under the wrong-answer heading instead of `- A)` bullets, no per-choice explanations are parsed.
- **Heading-like lines inside an open bullet terminate parsing.** Because the loop checks `SECTION_HEADING_PATTERN` before bullet/continuation handling, a line such as `### Reference` or `### Note` inside a bullet body ends the wrong-answer subsection immediately.
- **`### Reference` inside a bullet body is reclassified as question reference content.** The current implementation will store everything after that heading in `referenceMd`, even if the author intended it to remain inside the choice explanation.
- **Indentation-sensitive nested markdown is flattened.** Continuation lines are appended with `trimStart()`, so inline markdown like bold/italic survives, but nested lists, blockquotes, code blocks, and other indentation-sensitive constructs do not preserve their original structure.

---

## Root Cause Analysis

### The Regex

```
CHOICE_BULLET_PATTERN = /^\s*[-*+]\s*([A-Ea-e])\s*(?:[).:])+\s*(.*)$/
```

This matches single-letter labels A–E with one or more delimiters from `).:`  It does NOT match:
- Labels outside A–E (silently treated as continuation text)
- Combined labels like `A, B, D)` (comma breaks the match)
- Labels without a delimiter (e.g., `- A ` with no `)`, `.`, or `:`)
- Numbered lists like `1. A is wrong` (silently dropped unless a valid bullet is already open)

### The Append-or-Drop Logic (`scripts/seed-helpers.ts:75-101`)

```
for (const [offset, line] of lines.slice(headingIndex + 1).entries()) {
    // ...heading break...
    const bulletMatch = line.match(CHOICE_BULLET_PATTERN);
    if (bulletMatch) { commitCurrent(); currentLabel = ...; continue; }
    if (!currentLabel) { continue; }        // ← SILENT DROP
    if (!line.trim()) { currentBodyLines.push(''); continue; }
    currentBodyLines.push(line.trimStart()); // ← SILENT APPEND
}
```

Line 91–92: if no bullet is open, non-matching content is silently dropped.
Line 100: if a bullet IS open, non-matching content is silently appended to that bullet.

Neither case produces an error. Neither case distinguishes "legitimate multi-line continuation" from "content that shouldn't be here."

### The Validation Gap (`scripts/seed/question-parser.ts:57-63`)

`buildSeedRepFromParsed()` checks that parsed labels exist in frontmatter choices, but does NOT check:
- Whether any content was silently dropped during parsing
- Whether non-bullet content was appended to a bullet
- Whether all incorrect choices have explanations
- Whether the wrong-answer section heading exists but produced zero parsed bullets

---

## Two-Track Fix Required

### Track 1: Content Alignment (External Repo)

The 24 affected files need formatting fixes in the `addiction-final-2026` external repo, then re-import. These are content-level fixes, not parser changes:

1. **23 files**: Move `**Clinical Pearl:**` paragraph ABOVE the `**Why other answers are wrong:**` heading
2. **1 file** (`palis-2022`): Split `- A, B, D)` combined bullet into three individual bullets: `- A)`, `- B)`, `- D)`

The consolidated instruction stack in this repo (`SCHEMA.md`, `CLAUDE.md`, `AGENTS.md`, `PLAN.md`, `NOTES.md`) now documents the ordering rules that prevent recurrence. The external repo still needs the synced copies.

See [NOTES.md](../../content/drafts/questions/NOTES.md) in the content drafts directory for the full affected file list with line numbers.

### Track 2: Parser Hardening (This Repo)

**Phase 1 — Strict Validation (near-term)**

Follow TDD. Tighten `parseChoiceExplanations()` so malformed wrong-answer sections throw instead of silently degrading:

- Once inside the wrong-answer subsection, any non-empty, non-blank line before the first valid bullet is an error
- Any bullet-like line with a label outside A–E is an error
- Any duplicate parsed label is an error
- Any recognized choice bullet whose body is blank / whitespace-only is an error
- If the subsection heading exists but zero valid bullets survive parsing, throw (including literally blank wrong-answer subsections where the heading is followed only by blank lines / EOF)
- Combined-label patterns (comma-separated) are an error with an actionable message
- Numbered-list items used in place of `- A)` bullets are an error
- After the first valid bullet, only blank lines, valid continuation paragraphs, additional valid bullets, and the terminal `### Reference` heading are allowed
- Heading-like lines inside the wrong-answer subsection are an error unless they are the terminal `### Reference` heading
- Indentation-sensitive nested markdown inside wrong-answer bullets is rejected until/unless the parser can preserve it structurally

Error messages must include enough context (slug, line content) for content authors to fix quickly.

Well-formed partial coverage (some choices have explanations, some don't) remains valid per DEBT-336.

**Phase 2 — Move Per-Choice Explanations to YAML Frontmatter (long-term)**

The root cause of DEBT-338 is architectural: per-choice explanations are **structured data** (keyed to a specific choice label) stored in **unstructured markdown** (freeform text parsed by regex). No amount of regex hardening or AST parsing eliminates this fundamental mismatch — you're always heuristically extracting structure from prose.

The correct fix is to put structured data where structured data belongs: in YAML frontmatter, next to the choice it describes.

The imported MDX format already has three of four choice fields in frontmatter (`label`, `text`, `correct`). The missing fourth field is `explanation`. The external **draft** format does **not** currently have structured choices in YAML at all; it still uses `answer` in frontmatter plus a `## Choices` markdown section. That means the Phase 2 end-state requires changing the draft authoring contract too, not just the seed parser.

### Design Decisions (Locked 2026-03-27)

**Decision 1: Change the authoring source too, not just the imported side.**

If we only add `explanation` to the imported MDX YAML and keep the external draft repo using markdown bullets, we just move the fragile regex parsing from the seeder to the importer. The root cause stays alive. Fix it at the source: draft files in the external repo also adopt structured `choices[]` YAML objects with `explanation` fields.

**Decision 2: Post-migration markdown body keeps general explanation + clinical pearl + reference only.**

Today the `## Explanation` section contains everything mashed together: general explanation, clinical pearl, per-choice wrong-answer bullets, and reference. After migration:
- **Stays in markdown body:** General explanation paragraph, clinical pearl, `### Reference` — these are prose, not structured data
- **Moves to YAML frontmatter:** Per-choice wrong-answer explanations — these are structured data keyed to a specific choice label
- **Goes away entirely:** The `**Why other answers are wrong:**` heading and its bullet list

**Decision 3: Only wrong choices get `explanation`. The correct answer does not.**

The correct answer's "explanation" is the general explanation paragraph + clinical pearl in the markdown body. That's what the UI displays under "Correct Answer." Adding an optional `explanation` to the correct choice would create inconsistency (some questions have it, some don't) with no clear UI purpose — it would compete with the general explanation. The data model is clean as-is:
- Correct answer → explained by general explanation + clinical pearl (markdown body)
- Wrong answers → explained by per-choice `explanation` field (YAML frontmatter)

Validation rule: if `correct: true`, `explanation` must be absent. If `correct: false`, `explanation` is required (optional during migration, required after).

### Current vs Phase 2 Format

**Current imported MDX format (structured data in markdown — fragile):**
```yaml
choices:
  - label: "A"
    text: "TAPS is preferred because..."
    correct: false
  - label: "D"
    text: "Shorter tools are recommended..."
    correct: true
```
```markdown
## Explanation

The TAPS contains more questions and takes longer to administer...

**Clinical pearl:** The S2BI showed higher rates of substance use disclosure...

**Why other answers are wrong:**
- A) The extra questions in TAPS did not improve performance...
- B) While BSTAD had excellent sensitivity for some substances...
- C) S2BI did not have superior specificity...

### Reference
Levy S, Brogna M, et al. ...
```

**Phase 2 format (structured data in YAML — no parsing ambiguity):**
```yaml
choices:
  - label: "A"
    text: "TAPS is preferred because..."
    correct: false
    explanation: "The extra questions in TAPS did not improve performance; simplicity is preferred in busy clinical settings."
  - label: "B"
    text: "BSTAD is preferred..."
    correct: false
    explanation: "While BSTAD had excellent sensitivity for some substances, no single tool was recommended over others based on psychometric properties alone."
  - label: "C"
    text: "S2BI is preferred..."
    correct: false
    explanation: "S2BI did not have superior specificity; the recommendation was based on efficiency and equivalent performance across shorter tools."
  - label: "D"
    text: "Shorter tools are recommended..."
    correct: true
```
```markdown
## Explanation

The TAPS contains more questions and takes longer to administer...

**Clinical pearl:** The S2BI showed higher rates of substance use disclosure...

### Reference
Levy S, Brogna M, et al. ...
```

Per-choice feedback lives with the choice definition in structured data instead of being reverse-parsed from prose. The `**Why other answers are wrong:**` section is gone — that information now lives in YAML where it can't get corrupted by the parser.

**Why not AST parsing?** An AST parser (remark/unified) is a better way to guess at structured data in markdown. YAML frontmatter means you don't have to guess at all. gray-matter (already used) parses it, Zod (already used) validates it. The parser gets **simpler**, not more complex.

### Phase 2 Implementation Scope

1. Add `explanation` field to the imported MDX `ChoiceFrontmatterSchema` — required on wrong choices, forbidden on correct choice (optional on all during migration)
2. Redesign the **draft-side** schema (currently `DraftFrontmatterSchema` in `scripts/draft-question-import.ts`) so draft files also use structured `choices[]` YAML objects (`label`, `text`, `correct`, `explanation`)
3. Update `parseDraftQuestionBlock()` / `convertDraftQuestionToMdx()` / `scripts/import-draft-questions.ts` to support both the legacy draft format (`answer` + `## Choices` + markdown wrong-answer section) and the new structured draft format during migration
4. Read `explanation` directly from frontmatter choices in `buildSeedRepFromParsed()` when present; fall back to the Phase 1 markdown parser when absent
5. After the migration is complete, `parseChoiceExplanations()` simplifies to: extract general explanation + reference only (no more per-choice parsing)
6. The `**Why other answers are wrong:**` section becomes unnecessary in both repos once all content is migrated
7. Update authoring docs (`SCHEMA.md`, `CLAUDE.md`, `AGENTS.md`) and re-import / re-seed

**Multiline explanations** work fine with YAML block scalars:
```yaml
    explanation: >
      The extra questions in TAPS did not improve diagnostic performance
      compared to shorter tools. In busy clinical settings, simplicity
      and equivalent accuracy favor the shorter instruments.
```

**Phase 2 can be incremental.** Support both formats during migration: if `explanation` is present in frontmatter, use it; if not, fall back to the Phase 1 markdown parser. On the draft side, that means `parseDraftQuestionBlock()` and `convertDraftQuestionToMdx()` must temporarily support both the legacy `answer` + `## Choices` format and the new structured choice format. This allows gradual migration without a flag day.

---

## Content Instruction File Consolidation (Before Phase 2)

This consolidation track is now also tracked explicitly as [DEBT-339](./debt-339-consolidate-question-instruction-files.md).

**Status:** Local consolidation complete in this repo (2026-03-25). External repo sync remains pending.

### The Problem (Pre-DEBT-339 Local Consolidation Snapshot)

Before DEBT-339 was executed in this repo, the content instruction files in `content/drafts/questions/` were copied to the external `addiction-final-2026` repo as **8 separate files** with significant overlap and fragmentation:

| File | Purpose | Problem |
|------|---------|---------|
| `AGENTS.md` | Agent-specific quick-start | Overlaps with CLAUDE.md; both have quality checklists |
| `CLAUDE.md` | Claude Code quick-start | Overlaps with AGENTS.md; both have quality checklists |
| `META.MD` | Current inventory/integrity checks + archival bootstrap appendix | Useful quality guidance is mixed with historical examples and inventory/progress context |
| `NOTES.md` | Audit findings, corruption log | Historical reference; growing unboundedly |
| `PLAN.md` | Progress tracker | Needed but separate concern |
| `QUESTION-FORMAT-SPEC.md` | Complete pipeline spec | Overlaps heavily with SCHEMA.md |
| `SCHEMA.md` | YAML format, tags, quality checklist | Overlaps heavily with QUESTION-FORMAT-SPEC.md |
| `TAG-TAXONOMY.md` | Canonical tag tables | Could be a section of SCHEMA.md |

An agent working on questions had to read 4+ files just to understand the format. Quality rules were scattered across at least 4 files (`AGENTS.md`, `CLAUDE.md`, `SCHEMA.md`, and `QUESTION-FORMAT-SPEC.md`) and had to be kept manually in sync. That setup was unsustainable, increased drift risk, and likely contributed to the formatting inconsistencies behind DEBT-338.

### Two-Repo Workflow

```
content/drafts/questions/*.md, *.MD  (instruction files — tracked in git)
        ↕  manually copied
addiction-final-2026/questions/*.md, *.MD  (same instruction files)
addiction-final-2026/questions/**/*.md     (actual question content — authored here)
        ↓  pnpm content:import:drafts
content/questions/imported/**/*.mdx        (imported MDX — gitignored)
        ↓  pnpm db:seed
database                                   (production data)
```

The instruction files must be accurate in BOTH repos. Consolidation reduces the surface area that needs to stay in sync.

### Ideal Consolidation Target

Before Phase 2 content migration, reduce the active tracked-doc surface from **8 files to 5 total**: **4 core instruction/reference files plus `PLAN.md` as the separate progress tracker**.

| File | Content | Audience |
|------|---------|----------|
| `CLAUDE.md` | Quick-start for Claude Code agents: workflow, critical rules, quality checklist, vocabularies. Single file an agent reads to generate questions. | Claude Code / agent sessions |
| `AGENTS.md` | Quick-start for non-Claude agents: same structure as CLAUDE.md but adapted for other agent interfaces. | Other agent interfaces |
| `SCHEMA.md` | Single source of truth for format: YAML frontmatter spec, tag taxonomy, migration maps, pipeline behavior, validation rules. Absorbs QUESTION-FORMAT-SPEC.md and TAG-TAXONOMY.md. | Agents + humans |
| `NOTES.md` | Historical audit log and known-issue tracker. Not required reading for question generation — reference only. Receives any inventory / integrity snapshots or audit notes that should not live in the active schema spec. | Humans reviewing quality |

`PLAN.md` stays as-is (progress tracker, separate concern). `QUESTION-FORMAT-SPEC.md` and `TAG-TAXONOMY.md` get absorbed and removed. `META.MD` should either be archived entirely or split so that any still-useful current inventory / integrity notes move into `PLAN.md` or `NOTES.md`, while active quality guidance moves into `SCHEMA.md`.

### Consolidation Before Phase 2 (Operationally Recommended)

Phase 2 changes the question format in a major way. If we update 8 fragmented files for the new format, we'll introduce new inconsistencies. Consolidate first, then update the consolidated docs once for Phase 2.

### Sequencing

1. ~~**Phase 1** (this repo): Strict parser validation~~ — done (2026-03-24)
2. ~~**Consolidate instruction files** ([DEBT-339](./debt-339-consolidate-question-instruction-files.md))~~ — done (2026-03-25)
3. ~~**Transplant consolidated docs** to external `addiction-final-2026` repo~~ — done (2026-03-27)
4. ~~**Fix 24 corrupted files** (external repo → re-import → re-seed)~~ — done (2026-03-27): all 24 files fixed, re-imported (`pnpm content:import:drafts -- --status published`), and re-seeded (`pnpm db:seed`) with zero errors. 948 questions pass strict validation. 24 updated in DB, 924 unchanged.
5. **Phase 2** (both repos): Add `explanation` to YAML frontmatter, update consolidated docs, migrate content

### Current State (2026-03-27)

1. **Phase 1 is done.** The seed parser fails fast on malformed wrong-answer sections.
2. **Instruction-file consolidation is done.** Reading path: `CLAUDE.md` + `SCHEMA.md`.
3. **Content alignment is done.** All 24 corrupted files fixed in external repo, re-imported, re-seeded. The strict parser accepts all 948 questions.
4. **The only remaining work is Phase 2:** Move per-choice explanations from markdown body into YAML frontmatter `explanation` field. This is a future structural change, not urgent.

### What To Do Next

If this Phase 1 PR is merged, the recommended next queue is:

1. ~~External repo: sync the consolidated docs from this repo~~ — done (2026-03-27)
2. ~~External repo: fix the 23 clinical-pearl ordering files and the 1 combined-label file~~ — done (2026-03-27)
3. ~~External repo + this repo: re-import the repaired content~~ — done (2026-03-27)
4. ~~This repo: verify `pnpm db:seed` succeeds against the repaired imported corpus~~ — done (2026-03-27, 948 pass, 24 updated, 924 unchanged)
5. Both repos: execute Phase 2 YAML migration and retire markdown parsing for per-choice explanations

**Everything except Phase 2 is complete.** Phase 2 is a future structural migration and is not urgent.

---

## Acceptance Criteria

### Phase 1 (Strict Validation — Implemented 2026-03-24)

- [x] `scripts/seed-helpers.test.ts` has regression coverage for: stray non-bullet text, invalid labels (F–Z), duplicate labels, combined-label bullets, heading-with-no-valid-bullets (including heading-only blank sections), clinical-pearl-after-bullets
- [x] `scripts/seed-helpers.test.ts` also covers: top-level numbered lists, heading-like lines inside a bullet body, `### Reference` inside a bullet body, inline markdown inside a bullet body, and CRLF input
- [x] `scripts/seed-helpers.test.ts` covers recognized bullets with blank / whitespace-only bodies
- [x] `scripts/seed.test.ts` verifies `parseSeedQuestionFile()` fails fast on malformed wrong-answer sections
- [x] Errors identify the offending question slug and offending line content
- [x] Well-formed partial wrong-answer sections still parse successfully
- [x] Phase 1 rejects indentation-sensitive nested markdown inside wrong-answer bullets unless/until the parser can preserve it structurally
- [x] Only `### Reference` is accepted as a legal heading that terminates the wrong-answer list under the current format
- [x] No malformed content is silently dropped or silently attached to the wrong choice explanation
- [x] Verified against real corrupted files: `levy-2023-006.mdx` and `palis-2022-002.mdx` both throw with actionable slugged errors
- [x] Corpus-wide parse of all 948 imported MDX files fails on exactly 24 files (23 clinical pearl + 1 combined label), matching DEBT-338 findings
- [x] Content instruction files updated with explicit ordering rules (done 2026-03-24)
- [x] Content alignment in external repo is complete (24 files fixed, re-imported, re-seeded — 2026-03-27, 948 questions pass strict validation)

### Instruction File Consolidation (Before Phase 2)

- [x] QUESTION-FORMAT-SPEC.md absorbed into SCHEMA.md (pipeline behavior, format rules, commands)
- [x] TAG-TAXONOMY.md absorbed into SCHEMA.md (canonical tag tables + migration maps + remaining useful content-gap guidance)
- [x] Useful current META.MD content is redistributed deliberately: active quality guidance into SCHEMA.md, inventory/progress context into PLAN.md or NOTES.md, archival bootstrap content archived or clearly marked as non-authoring reference
- [x] CLAUDE.md and AGENTS.md updated to reference consolidated SCHEMA.md; no duplicated quality rules
- [x] Agents can generate correct questions by reading only CLAUDE.md (or AGENTS.md) + SCHEMA.md
- [x] Consolidated files synced to external `addiction-final-2026` repo (2026-03-27)

### Phase 2 (YAML Frontmatter Migration)

**Design decisions (locked 2026-03-27):** (1) Change draft authoring source too, not just imported MDX. (2) Post-migration markdown body keeps general explanation + clinical pearl + reference only. (3) Only wrong choices get `explanation`; correct answer is explained by the general explanation in the markdown body.

- [ ] Imported MDX `ChoiceFrontmatterSchema` accepts `explanation` field — required on wrong choices (`correct: false`), forbidden on correct choice (`correct: true`); optional on all during migration
- [ ] Draft-side schema (`DraftFrontmatterSchema`) redesigned so draft files use structured `choices[]` YAML objects with `explanation` on wrong choices
- [ ] `parseDraftQuestionBlock()` / `convertDraftQuestionToMdx()` support both the legacy draft format and the new structured draft format during migration
- [ ] `buildSeedRepFromParsed()` reads `explanation` from frontmatter when present, falls back to markdown parser when absent
- [ ] `parseChoiceExplanations()` no longer needed for per-choice data once all content is migrated — simplifies to extracting general explanation + reference only
- [ ] Import pipeline carries `explanation` through draft → MDX conversion
- [ ] All 948+ question files migrated in external repo: per-choice explanations in YAML, `**Why other answers are wrong:**` section removed from markdown body
- [ ] Post-migration markdown body contains only: general explanation, clinical pearl, `### Reference`
- [ ] Migrated content is re-imported and `pnpm db:seed` succeeds against the full corpus
- [ ] All existing tests pass; new tests cover YAML-sourced explanations and the correct-choice-has-no-explanation validation

### Debt Closure / Exit Condition

DEBT-338 should remain open until all of the following are true:

- [ ] The 24 known corrupted files are fixed in the external repo and re-imported here
- [ ] `pnpm db:seed` succeeds against the full imported corpus with Phase 1 validation enabled
- [ ] Instruction-file consolidation is complete in both repos
- [ ] Per-choice explanations are stored in structured YAML authoring data and carried through import/seed
- [ ] Markdown parsing is no longer required for per-choice wrong-answer explanations

---

## Relationship to Existing Debt

- [DEBT-335](../_archive/debt/debt-335-remove-all-or-nothing-wrong-answer-guard.md): UI-side fix — show whatever explanations exist (resolved)
- [DEBT-336](./debt-336-content-markdown-quality-pass.md): external content completeness/format cleanup (C1–C4)
- DEBT-338: internal parser validation so malformed content cannot silently corrupt seeded data
