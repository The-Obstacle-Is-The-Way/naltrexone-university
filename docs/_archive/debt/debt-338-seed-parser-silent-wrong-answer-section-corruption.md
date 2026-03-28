# DEBT-338: Seed Parser Silently Accepts Malformed Wrong-Answer Sections

**Priority:** P1
**Created:** 2026-03-24
**Updated:** 2026-03-28 (Phase 2 implemented and merged — PR #254)
**Status:** Resolved — Phase 1 hardening, 24-file content repair, instruction-file consolidation, external repo sync, and Phase 2 YAML frontmatter migration are all complete. Post-migration legacy path cleanup tracked separately in [DEBT-341](./debt-341-post-migration-legacy-path-removal.md).
**Source:** Codebase-wide audit after DEBT-335 / adjacent to [DEBT-336](../../debt/debt-336-content-markdown-quality-pass.md)
**Scope:** legacy seed-parser hardening, content format alignment in external `addiction-final-2026` repo, and Phase 2 migration across draft schemas, draft import, MDX schemas, and seed parsing

---

## Historical Problem / Remaining Architectural Debt

Before Phase 1 hardening and the 2026-03-27 content repair, `parseChoiceExplanations()` in `scripts/seed-helpers.ts` did line-by-line regex parsing of the `**Why other answers are wrong:**` section with silent append/drop behavior. Its fundamental logic was:

1. If a line matches `CHOICE_BULLET_PATTERN` → start a new choice
2. If a line doesn't match and a bullet is open → **silently append to that bullet's body**
3. If a line doesn't match and no bullet is open → **silently drop the line**

That meant any non-bullet content inside the wrong-answer section was either silently eaten by whatever choice happened to be "open," or silently dropped. There was no concept of "this line doesn't belong here — error."

**This was not hypothetical. Before the 2026-03-27 repair, it corrupted live data in the database.**

Phase 1 fixed the silent-corruption behavior by failing fast, and the 24 malformed files were repaired and re-seeded. At that point, the remaining debt was architectural: per-choice explanations were still stored as prose that had to be parsed out of markdown instead of being authored as structured data. Phase 2 later resolved that by moving them into YAML frontmatter.

---

## Historical Verified Live Corruption

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

All were in `content/questions/imported/article-based-pathway/`. The same ordering issue existed in the corresponding draft source files in the external `addiction-final-2026` repo and was fixed there on 2026-03-27.

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

### The Pre-Phase-1 Append-or-Drop Logic (historical)

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

### The Historical Validation Gap in `buildSeedRepFromParsed()`

`buildSeedRepFromParsed()` checks that parsed labels exist in frontmatter choices, but does NOT check:
- Whether any content was silently dropped during parsing
- Whether non-bullet content was appended to a bullet
- Whether all incorrect choices have explanations
- Whether the wrong-answer section heading exists but produced zero parsed bullets

---

## Two-Track Fix Plan

### Track 1: Content Alignment (External Repo) — Complete 2026-03-27

The 24 affected files required formatting fixes in the `addiction-final-2026` external repo, then re-import. These were content-level fixes, not parser changes:

1. **23 files**: Move `**Clinical Pearl:**` paragraph ABOVE the `**Why other answers are wrong:**` heading
2. **1 file** (`palis-2022`): Split `- A, B, D)` combined bullet into three individual bullets: `- A)`, `- B)`, `- D)`

The consolidated instruction stack in this repo (`SCHEMA.md`, `CLAUDE.md`, `AGENTS.md`, `PLAN.md`, `NOTES.md`) now documents the ordering rules that prevent recurrence. The external repo has the synced copies as of 2026-03-27.

See [NOTES.md](../../content/drafts/questions/NOTES.md) in the content drafts directory for the full affected file list with line numbers.

### Track 2: Parser Hardening (This Repo)

**Phase 1 — Strict Validation (implemented 2026-03-24)**

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

**Phase 2 — Move Per-Choice Explanations to YAML Frontmatter (implemented 2026-03-28 in PR #254)**

The root cause of DEBT-338 is architectural: per-choice explanations are **structured data** (keyed to a specific choice label) stored in **unstructured markdown** (freeform text parsed by regex). No amount of regex hardening or AST parsing eliminates this fundamental mismatch — you're always heuristically extracting structure from prose.

The correct fix is to put structured data where structured data belongs: in YAML frontmatter, next to the choice it describes.

The imported MDX format already has three of four choice fields in frontmatter (`label`, `text`, `correct`). The missing fourth field is `explanation`. The external **draft** format does **not** currently have structured choices in YAML at all; it still uses `answer` in frontmatter plus a `## Choices` markdown section. That means the Phase 2 end-state requires changing the draft authoring contract too, not just the seed parser.

### Design Decisions (Locked 2026-03-27)

These five decisions are the canonical Phase 2 contract and must match the app-repo implementation spec plus the external-repo migration spec.

1. **Change the authoring source too.** Draft files in the external repo also use structured `choices[]` YAML with `explanation`.
2. **Post-migration markdown body keeps only prose.** General explanation + clinical pearl + `### Reference`. The `**Why other answers are wrong:**` heading and bullets go away.
3. **Only wrong choices get `explanation`.** Correct choice NEVER gets it. Validation: `correct: true` + `explanation` present = reject.
4. **No hybrid questions.** A question is either fully legacy format or fully new format. Mixing the two is rejected.
5. **`qid:` stays first.** The draft file splitter (`splitDraftQuestionsFile()`) depends on `---\nqid:` as the block delimiter unless that splitter is deliberately hardened.

Decision 3 still implies different enforcement points during migration:
- Draft-side new-format questions can require `explanation` on every wrong choice immediately, because the draft parser knows whether the question is legacy or new-format.
- Imported MDX cannot require that at the bare `ChoiceFrontmatterSchema` boundary until legacy MDX is gone, because the schema alone cannot distinguish legacy MDX from new-format MDX during migration.
- The stronger "all wrong choices in a new-format question must have `explanation`" rule therefore lives at the whole-question parsing boundary until post-migration tightening removes the legacy path.

### Current vs Phase 2 Format

**Current imported MDX format (structured data in markdown — fragile):**
```yaml
---
slug: "palis-2022-001"
difficulty: "easy"
status: "published"
tags:
  - slug: "opioids"
    name: "Opioids"
    kind: "substance"
  - slug: "stimulants"
    name: "Stimulants"
    kind: "substance"
  - slug: "epidemiology-prevention"
    name: "Epidemiology & Prevention"
    kind: "topic"
choices:
  - label: "A"
    text: "Concurrent use decreases fatal overdose risk..."
    correct: false
  - label: "B"
    text: "Concurrent use approximately doubles the hazard..."
    correct: true
  - label: "C"
    text: "Concurrent use has no effect..."
    correct: false
  - label: "D"
    text: "Concurrent use only increases risk if injection..."
    correct: false
---

## Stem

According to Palis et al. (2022), how does concurrent use of opioids and stimulants affect the risk of fatal overdose?
```
```markdown
## Explanation

Palis et al. (2022) found that concurrent users had more than twice the hazard of fatal overdose...

**Clinical pearl:** The belief that stimulants can prevent opioid overdose is false and dangerous.

**Why other answers are wrong:**
- A) This is a dangerous misconception; stimulants do NOT protect against opioid overdose
- C) The hazard was significantly elevated, not unchanged
- D) The study found elevated risk overall, not limited to injection-only use

### Reference

Palis H, Xavier C, Dobrer S, et al. Concurrent use of opioids and stimulants and risk of fatal overdose: a cohort study. BMC Public Health. 2022;22:2084.
```

**Phase 2 format (structured data in YAML — no parsing ambiguity):**
```yaml
---
slug: "palis-2022-001"
difficulty: "easy"
status: "published"
tags:
  - slug: "opioids"
    name: "Opioids"
    kind: "substance"
  - slug: "stimulants"
    name: "Stimulants"
    kind: "substance"
  - slug: "epidemiology-prevention"
    name: "Epidemiology & Prevention"
    kind: "topic"
choices:
  - label: "A"
    text: "Concurrent use decreases fatal overdose risk..."
    correct: false
    explanation: "This is a dangerous misconception; stimulants do NOT protect against opioid overdose."
  - label: "B"
    text: "Concurrent use approximately doubles the hazard..."
    correct: true
  - label: "C"
    text: "Concurrent use has no effect..."
    correct: false
    explanation: "The hazard was significantly elevated, not unchanged."
  - label: "D"
    text: "Concurrent use only increases risk if injection..."
    correct: false
    explanation: "The study found elevated risk overall, not limited to injection-only use."
---

## Stem

According to Palis et al. (2022), how does concurrent use of opioids and stimulants affect the risk of fatal overdose?
```
```markdown
## Explanation

Palis et al. (2022) found that concurrent users had more than twice the hazard of fatal overdose...

**Clinical pearl:** The belief that stimulants can prevent opioid overdose is false and dangerous.

### Reference

Palis H, Xavier C, Dobrer S, et al. Concurrent use of opioids and stimulants and risk of fatal overdose: a cohort study. BMC Public Health. 2022;22:2084.
```

Per-choice feedback lives with the choice definition in structured data instead of being reverse-parsed from prose. The `**Why other answers are wrong:**` section is gone — that information now lives in YAML where it can't get corrupted by the parser.

**Why not AST parsing?** An AST parser (remark/unified) is a better way to guess at structured data in markdown. YAML frontmatter means you don't have to guess at all. gray-matter (already used) parses it, Zod (already used) validates it. The parser gets **simpler**, not more complex.

### Phase 2 Draft Authoring Format

The draft authoring source must move too. The new-format draft contract is:

- `choices[]` lives in YAML frontmatter
- `answer` is removed for migrated questions
- `## Choices` is removed for migrated questions
- `## Explanation` keeps only general explanation prose, clinical pearl, and `### Reference`

**Phase 2 draft format (new authoring source-of-truth):**
```markdown
---
qid: palis-2022-001
type: recall
difficulty: easy
substances: [opioids, stimulants]
topics: [epidemiology-prevention]
source: palis-2022
choices:
  - label: A
    text: "Concurrent use decreases fatal overdose risk because stimulants counteract opioid respiratory depression"
    correct: false
    explanation: "This is a dangerous misconception; stimulants do NOT protect against opioid overdose."
  - label: B
    text: "Concurrent use approximately doubles the hazard of fatal overdose compared to opioid use alone"
    correct: true
  - label: C
    text: "Concurrent use has no effect on fatal overdose risk"
    correct: false
    explanation: "The hazard was significantly elevated, not unchanged."
  - label: D
    text: "Concurrent use only increases risk if injection is the route of administration"
    correct: false
    explanation: "The study found elevated risk for the concurrent-use group overall and does not report that the increased hazard is limited to injection-only use."
---

## Question

According to Palis et al. (2022), how does concurrent use of opioids and stimulants affect the risk of fatal overdose compared to using opioids only?

## Explanation

Palis et al. (2022) found that "people who used both opioids and stimulants had more than twice the hazard of fatal overdose (HR: 2.02, 95% CI: 1.47-2.78, p<0.001) compared to people who used opioids only." This finding directly contradicts the dangerous misperception that stimulants protect against opioid overdose.

**Clinical pearl:** The belief that stimulants can prevent opioid overdose by counteracting respiratory depression is false and dangerous. Clinicians should actively address this misconception with patients.

### Reference

Palis H, Xavier C, Dobrer S, et al. Concurrent use of opioids and stimulants and risk of fatal overdose: a cohort study. BMC Public Health. 2022;22:2084.
```

### Phase 2 Implementation Scope

1. Extend the imported MDX `ChoiceFrontmatterSchema` with optional `explanation` and validate at the content-schema boundary that `correct: true` forbids `explanation`
2. Redesign the **draft-side** schema (currently `DraftFrontmatterSchema` in `scripts/draft-question-import.ts`) so migrated draft files use structured `choices[]` YAML objects (`label`, `text`, `correct`, `explanation`) instead of `answer` + `## Choices`
3. Support **two whole-question formats** during migration:
   - Legacy question: `answer` + `## Choices` + markdown wrong-answer bullets
   - New-format question: `choices[]` in frontmatter, no `answer`, no `## Choices`, no markdown wrong-answer bullets
4. Reject hybrid questions during migration. A single question must not mix old and new sources of truth (for example `answer` plus `choices[]`, or YAML per-choice explanations plus a markdown `**Why other answers are wrong:**` subsection)
5. Update `parseDraftQuestionBlock()` / `convertDraftQuestionToMdx()` / `scripts/import-draft-questions.ts` to parse and emit both whole-question formats during migration
6. Update `buildSeedRepFromParsed()` to branch on question format:
   - New-format MDX: read wrong-choice `explanation` directly from frontmatter, and still split `generalExplanation` from `referenceMd`
   - Legacy MDX: continue using `parseChoiceExplanations()` for per-choice data
   - Enforce "all wrong choices have `explanation`" at this whole-question boundary for new-format MDX until legacy MDX is retired
7. Preserve or deliberately replace the current draft splitter contract. Today `splitDraftQuestionsFile()` requires `qid:` to be the first frontmatter key after `---`; Phase 2 must either keep that authoring rule or harden the splitter
8. After the corpus migration is complete, `parseChoiceExplanations()` simplifies to: extract general explanation + reference only (no more per-choice parsing)
9. The `**Why other answers are wrong:**` section becomes unnecessary in both repos once all content is migrated
10. Update authoring docs (`SCHEMA.md`, `CLAUDE.md`, `AGENTS.md`), sync them to the external repo, then re-import / re-seed

**Multiline explanations** work fine with YAML block scalars:
```yaml
    explanation: >
      The extra questions in TAPS did not improve diagnostic performance
      compared to shorter tools. In busy clinical settings, simplicity
      and equivalent accuracy favor the shorter instruments.
```

**Phase 2 can be incremental at the question level.** Support both legacy questions and new-format questions during migration, but do **not** allow a single question to mix the two representations. That avoids dual-source drift and makes validation decidable. On the draft side, `parseDraftQuestionBlock()` and `convertDraftQuestionToMdx()` must temporarily support both whole-question formats until the corpus is fully migrated.

**Current external corpus note (verified 2026-03-28):** the external draft repo currently has 170 `recall.md` / `vignettes.md` files and 948 question blocks. All 948 legacy questions currently have `## Choices`, `**Why other answers are wrong:**`, and three wrong-answer bullets matching the three wrong choices. That means the migration script should fail if a wrong choice lacks a matching explanation bullet; silent omission is no longer the right behavior for the live corpus.

---

## Content Instruction File Consolidation (Before Phase 2)

This consolidation track is now also tracked explicitly as [DEBT-339](../_archive/debt/debt-339-consolidate-question-instruction-files.md).

**Status:** Consolidation is complete in both repos (local 2026-03-25, external sync 2026-03-27).

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
2. ~~**Consolidate instruction files** ([DEBT-339](../_archive/debt/debt-339-consolidate-question-instruction-files.md))~~ — done (2026-03-25)
3. ~~**Transplant consolidated docs** to external `addiction-final-2026` repo~~ — done (2026-03-27)
4. ~~**Fix 24 corrupted files** (external repo → re-import → re-seed)~~ — done (2026-03-27): all 24 files fixed, re-imported (`pnpm content:import:drafts -- --status published`), and re-seeded (`pnpm db:seed`) with zero errors. 948 questions pass strict validation. 24 updated in DB, 924 unchanged.
5. **Phase 2** (both repos): Add `explanation` to YAML frontmatter, update consolidated docs, migrate content

### Resolution Snapshot (2026-03-28)

1. **Phase 1 is done.** The seed parser fails fast on malformed wrong-answer sections.
2. **Instruction-file consolidation is done.** Reading path: `CLAUDE.md` + `SCHEMA.md`.
3. **Content alignment is done.** All 24 corrupted files were fixed in the external repo, re-imported, and re-seeded. The strict parser accepts all 948 questions.
4. **Phase 2 is done.** Per-choice wrong-answer explanations now live in YAML frontmatter in both repos, and the markdown `**Why other answers are wrong:**` section is gone from the live corpus.
5. **Only post-migration cleanup remains, and it is separate debt.** The legacy compatibility code paths that still exist for safety are tracked in [DEBT-341](./debt-341-post-migration-legacy-path-removal.md).

### What To Do Next

DEBT-338 itself is resolved. The follow-up queue is:

1. Execute [DEBT-341](./debt-341-post-migration-legacy-path-removal.md) to remove the now-dead legacy parser / dual-format compatibility paths
2. Run the full verification gate again after DEBT-341 cleanup (`pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`)
3. Keep unrelated cleanup separate (for example [DEBT-342](./debt-342-idempotency-backward-compat-guard.md))

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

**Design decisions (locked 2026-03-27):** (1) Change the authoring source too. (2) Post-migration markdown body keeps only prose. (3) Only wrong choices get `explanation`. (4) No hybrid questions. (5) `qid:` stays first unless the splitter is deliberately hardened.

- [x] Imported MDX `ChoiceFrontmatterSchema` accepts optional `explanation` and forbids it on `correct: true` choices
- [x] Draft-side schema supports both whole-question formats during migration: legacy (`answer` + `## Choices`) and new-format (`choices[]` in frontmatter, no `answer`, no `## Choices`)
- [x] New-format draft example is documented in `SCHEMA.md` and shows that migrated questions remove both `answer` and `## Choices`
- [x] `parseDraftQuestionBlock()` / `convertDraftQuestionToMdx()` support both whole-question formats during migration and reject invalid hybrid questions
- [x] `buildSeedRepFromParsed()` reads per-choice `explanation` from frontmatter for new-format questions and uses markdown parsing only for legacy questions
- [x] `buildSeedRepFromParsed()` rejects new-format questions whose wrong choices are missing `explanation`
- [x] General explanation and `referenceMd` still parse correctly for new-format questions even though `**Why other answers are wrong:**` is gone
- [x] Legacy-path deletion was intentionally split out into [DEBT-341](./debt-341-post-migration-legacy-path-removal.md) instead of being bundled into DEBT-338 closure
- [x] Import pipeline carries `explanation` through draft → MDX conversion for new-format questions
- [x] The draft splitter contract is explicit: either `qid:` remains first after `---` or `splitDraftQuestionsFile()` is hardened so richer frontmatter ordering cannot break imports
- [x] All 948+ question files migrated in external repo: per-choice explanations in YAML, `**Why other answers are wrong:**` section removed from markdown body
- [x] Post-migration markdown body contains only: general explanation, clinical pearl, `### Reference`
- [x] Migrated content is re-imported and `pnpm db:seed` succeeds against the full corpus
- [x] All existing tests pass; new tests cover legacy questions, new-format questions, invalid hybrid questions, YAML-sourced explanations, reference extraction without a wrong-answer heading, and the correct-choice-has-no-explanation validation

### Debt Closure / Exit Condition

DEBT-338 should remain open until all of the following are true:

- [x] The 24 known corrupted files are fixed in the external repo and re-imported here
- [x] `pnpm db:seed` succeeds against the full imported corpus with Phase 1 validation enabled
- [x] Instruction-file consolidation is complete in both repos
- [x] Per-choice explanations are stored in structured YAML authoring data and carried through import/seed
- [x] Markdown parsing is no longer required for per-choice wrong-answer explanations in the live corpus; only cleanup of the dormant legacy path remains in [DEBT-341](./debt-341-post-migration-legacy-path-removal.md)

---

## Relationship to Existing Debt

- [DEBT-335](../_archive/debt/debt-335-remove-all-or-nothing-wrong-answer-guard.md): UI-side fix — show whatever explanations exist (resolved)
- [DEBT-336](../../debt/debt-336-content-markdown-quality-pass.md): external content completeness/format cleanup (C1–C4)
- DEBT-338: internal parser validation so malformed content cannot silently corrupt seeded data
