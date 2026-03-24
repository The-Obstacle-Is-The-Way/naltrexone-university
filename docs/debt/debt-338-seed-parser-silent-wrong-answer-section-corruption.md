# DEBT-338: Seed Parser Silently Accepts Malformed Wrong-Answer Sections

**Priority:** P1
**Created:** 2026-03-24
**Updated:** 2026-03-24 (verified findings — live data corruption confirmed in 24 files)
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

### Verified NOT Present (0 files)

A scan of all 948 imported MDX files confirmed zero instances of:
- Invalid labels outside A–E (e.g., `- F)`)
- Stray non-bullet text before the first bullet (other than the clinical pearl pattern)
- Duplicate labels
- Empty wrong-answer sections (heading present, zero bullets)

These remain latent risks that the parser would silently accept, but they are not present in the current corpus.

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

Content instruction files (`QUESTION-FORMAT-SPEC.md`, `SCHEMA.md`, `CLAUDE.md`, `AGENTS.md`) have been updated with explicit ordering rules to prevent recurrence.

See [NOTES.md](../../content/drafts/questions/NOTES.md) in the content drafts directory for the full affected file list with line numbers.

### Track 2: Parser Hardening (This Repo)

**Phase 1 — Strict Validation (near-term)**

Follow TDD. Tighten `parseChoiceExplanations()` so malformed wrong-answer sections throw instead of silently degrading:

- Once inside the wrong-answer subsection, any non-empty, non-blank line before the first valid bullet is an error
- Any bullet-like line with a label outside A–E is an error
- Any duplicate parsed label is an error
- If the subsection heading exists with non-empty content but zero valid bullets survive parsing, throw
- Combined-label patterns (comma-separated) are an error with an actionable message
- Numbered-list items used in place of `- A)` bullets are an error
- Heading-like lines inside a bullet body are an error unless they begin a legitimate section break after the bullet list is finished
- Indentation-sensitive nested markdown inside wrong-answer bullets is rejected until/unless the parser can preserve it structurally

Error messages must include enough context (slug, line content) for content authors to fix quickly.

Well-formed partial coverage (some choices have explanations, some don't) remains valid per DEBT-336.

**Phase 2 — Move Per-Choice Explanations to YAML Frontmatter (long-term)**

The root cause of DEBT-338 is architectural: per-choice explanations are **structured data** (keyed to a specific choice label) stored in **unstructured markdown** (freeform text parsed by regex). No amount of regex hardening or AST parsing eliminates this fundamental mismatch — you're always heuristically extracting structure from prose.

The correct fix is to put structured data where structured data belongs: in YAML frontmatter, next to the choice it describes.

The choices already have three of four fields in frontmatter (`label`, `text`, `correct`). The missing fourth field is `explanation`. After Phase 2, the `**Why other answers are wrong:**` markdown section is eliminated entirely.

**Current format (structured data in markdown — fragile):**
```yaml
choices:
  - label: "A"
    text: "TAPS is preferred because..."
    correct: false
```
```markdown
**Why other answers are wrong:**
- A) The extra questions in TAPS did not improve performance...
```

**Phase 2 format (structured data in YAML — no parsing ambiguity):**
```yaml
choices:
  - label: "A"
    text: "TAPS is preferred because..."
    correct: false
    explanation: "The extra questions in TAPS did not improve performance; simplicity is preferred in busy clinical settings."
```

This is the industry-standard approach for structured quiz/question content. The Galaxy Project training platform, Electric Book template, and other educational content systems all co-locate per-choice feedback with the choice definition in structured data rather than parsing it from prose.

**Why not AST parsing?** An AST parser (remark/unified) is a better way to guess at structured data in markdown. YAML frontmatter means you don't have to guess at all. gray-matter (already used) parses it, Zod (already used) validates it. The parser gets **simpler**, not more complex.

**Phase 2 implementation scope:**
1. Add optional `explanation` field to `QuestionFrontmatterSchema` and `DraftFrontmatterSchema` (Zod)
2. Read `explanation` directly from frontmatter choices in `buildSeedRepFromParsed()` — no more per-choice markdown regex parsing
3. `parseChoiceExplanations()` simplifies to: extract general explanation + reference only
4. The `**Why other answers are wrong:**` section becomes unnecessary (parser can warn if present for backwards compat during migration)
5. Migrate content in external `addiction-final-2026` repo — move per-choice explanations from markdown body into YAML `explanation` field on each choice
6. Update import pipeline (`scripts/draft-question-import.ts`) to carry `explanation` through from draft to MDX
7. Update authoring docs and agent instructions

**Multiline explanations** work fine with YAML block scalars:
```yaml
    explanation: >
      The extra questions in TAPS did not improve diagnostic performance
      compared to shorter tools. In busy clinical settings, simplicity
      and equivalent accuracy favor the shorter instruments.
```

**Phase 2 can be incremental.** Support both formats during migration: if `explanation` is present in frontmatter, use it; if not, fall back to the Phase 1 markdown parser. This allows gradual migration without a flag day.

---

## Content Instruction File Consolidation (Before Phase 2)

### The Problem

The content instruction files in `content/drafts/questions/` are copied to the external `addiction-final-2026` repo where agents generate and edit questions. There are currently **8 files**, and they have significant overlap and fragmentation:

| File | Purpose | Problem |
|------|---------|---------|
| `AGENTS.md` | Agent-specific quick-start | Overlaps with CLAUDE.md; both have quality checklists |
| `CLAUDE.md` | Claude Code quick-start | Overlaps with AGENTS.md; both have quality checklists |
| `META.MD` | NBME quality standards (Part 2) | Part 1 is an outdated inventory; Part 2 is the real value |
| `NOTES.md` | Audit findings, corruption log | Historical reference; growing unboundedly |
| `PLAN.md` | Progress tracker | Needed but separate concern |
| `QUESTION-FORMAT-SPEC.md` | Complete pipeline spec | Overlaps heavily with SCHEMA.md |
| `SCHEMA.md` | YAML format, tags, quality checklist | Overlaps heavily with QUESTION-FORMAT-SPEC.md |
| `TAG-TAXONOMY.md` | Canonical tag tables | Could be a section of SCHEMA.md |

An agent working on questions has to read 4+ files just to understand the format. Quality rules are scattered across at least 3 files (AGENTS.md, CLAUDE.md, SCHEMA.md) and must be kept manually in sync. This is unsustainable and directly contributed to the formatting inconsistencies that caused DEBT-338.

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

Before Phase 2 content migration, consolidate to **4 files**:

| File | Content | Audience |
|------|---------|----------|
| `CLAUDE.md` | Quick-start for Claude Code agents: workflow, critical rules, quality checklist, vocabularies. Single file an agent reads to generate questions. | Claude Code / agent sessions |
| `AGENTS.md` | Quick-start for non-Claude agents: same structure as CLAUDE.md but adapted for other agent interfaces. | Other agent interfaces |
| `SCHEMA.md` | Single source of truth for format: YAML frontmatter spec, tag taxonomy, pipeline behavior, validation rules. Absorbs QUESTION-FORMAT-SPEC.md and TAG-TAXONOMY.md. | Agents + humans |
| `NOTES.md` | Historical audit log and known-issue tracker. Not required reading for question generation — reference only. Absorbs META.MD Part 2 quality standards into SCHEMA.md; audit history stays here. | Humans reviewing quality |

`PLAN.md` stays as-is (progress tracker, separate concern). `META.MD`, `QUESTION-FORMAT-SPEC.md`, and `TAG-TAXONOMY.md` get absorbed and removed.

### Consolidation Must Happen Before Phase 2

Phase 2 changes the question format (adding `explanation` to YAML frontmatter, removing the `**Why other answers are wrong:**` markdown section). If we update 8 fragmented files for the new format, we'll introduce new inconsistencies. Consolidate first, then update the consolidated docs once for Phase 2.

### Sequencing

1. **Phase 1** (this repo): Strict parser validation — code changes only, no doc restructuring needed
2. **Fix 24 corrupted files** (external repo): Content alignment using current format
3. **Consolidate instruction files** (both repos): Reduce 8 → 4 files, ensure single source of truth
4. **Phase 2** (both repos): Add `explanation` to YAML frontmatter, update consolidated docs, migrate content

---

## Acceptance Criteria

### Phase 1 (Strict Validation — Near-Term)

- [ ] `scripts/seed-helpers.test.ts` has regression coverage for: stray non-bullet text, invalid labels (F–Z), duplicate labels, combined-label bullets, heading-with-no-valid-bullets, clinical-pearl-after-bullets
- [ ] `scripts/seed-helpers.test.ts` also covers: top-level numbered lists, heading-like lines inside a bullet body, `### Reference` inside a bullet body, inline markdown inside a bullet body, and CRLF input
- [ ] `scripts/seed.test.ts` verifies `parseSeedQuestionFile()` fails fast on malformed wrong-answer sections
- [ ] Errors identify the offending question slug and offending line content
- [ ] Well-formed partial wrong-answer sections still parse successfully
- [ ] Phase 1 rejects indentation-sensitive nested markdown inside wrong-answer bullets unless/until the parser can preserve it structurally
- [ ] No malformed content is silently dropped or silently attached to the wrong choice explanation
- [ ] Content alignment in external repo is complete (24 files fixed, re-imported, re-seeded)
- [ ] Content instruction files updated with explicit ordering rules (done 2026-03-24)

### Instruction File Consolidation (Before Phase 2)

- [ ] QUESTION-FORMAT-SPEC.md absorbed into SCHEMA.md (pipeline behavior, format rules)
- [ ] TAG-TAXONOMY.md absorbed into SCHEMA.md (canonical tag tables)
- [ ] META.MD Part 2 quality standards absorbed into SCHEMA.md; historical audit content moved to NOTES.md or archived
- [ ] CLAUDE.md and AGENTS.md updated to reference consolidated SCHEMA.md; no duplicated quality rules
- [ ] Consolidated files synced to external `addiction-final-2026` repo
- [ ] Agents can generate correct questions by reading only CLAUDE.md (or AGENTS.md) + SCHEMA.md

### Phase 2 (YAML Frontmatter Migration)

- [ ] `QuestionFrontmatterSchema` and `DraftFrontmatterSchema` accept optional `explanation` field on each choice
- [ ] `buildSeedRepFromParsed()` reads `explanation` from frontmatter when present, falls back to markdown parser when absent
- [ ] `parseChoiceExplanations()` no longer needed for per-choice data once all content is migrated
- [ ] Import pipeline carries `explanation` through draft → MDX conversion
- [ ] All 948+ question files migrated to YAML `explanation` field in external repo
- [ ] `**Why other answers are wrong:**` markdown section no longer required by any pipeline stage
- [ ] All existing tests pass; new tests cover YAML-sourced explanations

---

## Relationship to Existing Debt

- [DEBT-335](../_archive/debt/debt-335-remove-all-or-nothing-wrong-answer-guard.md): UI-side fix — show whatever explanations exist (resolved)
- [DEBT-336](./debt-336-content-markdown-quality-pass.md): external content completeness/format cleanup (C1–C4)
- DEBT-338: internal parser validation so malformed content cannot silently corrupt seeded data
