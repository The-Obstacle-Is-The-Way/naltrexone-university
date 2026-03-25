# NTX University Question Bank Schema

**Purpose:** Single source of truth for active question authoring in `content/drafts/questions/`.

**Version:** 1.13
**Last Updated:** March 25, 2026
**Status:** Active consolidated spec

**Read This With:**
- `CLAUDE.md` or `AGENTS.md` — quick-start workflow for the agent you are using
- `PLAN.md` — current inventory, integrity snapshot, and progress tracking
- `NOTES.md` — historical audits, parser-corruption file list, Prescriber's rewrite queue, archival reference material
- `docs/debt/debt-338-seed-parser-silent-wrong-answer-section-corruption.md` — parser hardening + Phase 2 roadmap

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.13 | 2026-03-25 | Consolidated `QUESTION-FORMAT-SPEC.md`, `TAG-TAXONOMY.md`, and active `META.MD` guidance into one active authoring spec; this file now owns the current-format contract, taxonomy, pipeline behavior, validation rules, and canonical quality checklist. |
| 1.12 | 2026-03-24 | Added an explicit parser-safety rule that wrong-answer bullet bodies must stay plain-paragraph text only (no nested lists/headings/other indentation-sensitive markdown). |
| 1.11 | 2026-03-24 | Split wrong-answer explanation guidance into an explicit authoring rule plus runtime fallback note so the checklist no longer conflates content expectations with UI behavior. |
| 1.10 | 2026-03-13 | Clarified wrong-answer explanation rule: do not prefix with choice text (full text or short labels before a colon); start directly with reasoning. |
| 1.9 | 2026-03-06 | Added explicit wrong-answer explanation authoring rules to the quality checklist (do not restate full choice text; every wrong answer requires an explanation). |
| 1.8 | 2026-02-18 | Synced with runtime importer behavior (2-5 choices allowed, validation commands updated, legacy skill-file references removed). |
| 1.7 | 2026-02-18 | Added strict frontmatter note, treatment guidance, and cross-references to the then-separate pipeline/taxonomy docs. |
| 1.6 | 2026-02-18 | Canonical taxonomy alignment (Topic/Substance/Treatment), removed legacy domain guidance, added treatment canonical list. |
| 1.5 | 2026-02-04 | Documented source-only full-conversion folder and special-case sections. |
| 1.4 | 2026-02-04 | Clarified QID rules for multi-entry sources. |
| 1.2 | 2026-02-01 | Standardized to 6 recall + 6 vignette per paper, equal difficulty distribution (4/4/4). |
| 1.1 | 2026-02-01 | Changed `id` to `qid`, moved `answer` to frontmatter, made `topics` and `substances` arrays. |
| 1.0 | 2026-02-01 | Initial schema. |

---

## How to Use This File

1. Read `CLAUDE.md` or `AGENTS.md` first for the workflow and agent-specific framing.
2. Use this file for the complete active authoring contract.
3. Use `PLAN.md` only when you need current inventory/progress context.
4. Use `NOTES.md` only when you need historical audit context, the 24-file parser-corruption list, or the Prescriber's rewrite queue.

**Important:** This file documents the **current authoring format**. The future Phase 2 YAML `choices[].explanation` format is documented later as a target state only. Do not author new questions in that future format until DEBT-338 Phase 2 is explicitly implemented in both repos.

---

## Question Targets

| Metric | Value |
|--------|-------|
| Questions per standard source paper | 12 |
| Recall questions | 6 (in `recall.md`) |
| Vignette questions | 6 (in `vignettes.md`) |
| Easy | 4 per paper (2 recall, 2 vignette) |
| Medium | 4 per paper (2 recall, 2 vignette) |
| Hard | 4 per paper (2 recall, 2 vignette) |
| Total (ABPN article-based pathway, 40 papers) | 480 |

**Default rule:** Other sections in this repo (`asam-guidelines`, `cochrane`, `personal-papers`, `50-studies-every-psychiatrist-should-know`, `therapy`) also follow the 12-question target unless a special-case rule below says otherwise.

---

## Special Cases

### Prescriber's Guide Medications (Recall Only)

Folder: `questions/prescribers-guide/` (app-repo path: `content/drafts/questions/prescribers-guide/`)

- Each medication has **4 recall questions**.
- There is **no `vignettes.md`** for Prescriber's Guide medication folders.
- Medication folders use numeric prefixes (for example `01-acamprosate`, `23-naltrexone`).
- QID format: `qid: stahls-[medication]-[number]` (example: `stahls-naltrexone-001`)
- `source` should be `stahls-8e` in this repo so imported output does not split across edition-based directories.
- Every Prescriber's Guide question must have an explicit addiction-psychiatry hook. The fast filter lives in `CLAUDE.md` / `AGENTS.md`, and the pending off-target rewrite queue lives in `NOTES.md`.

### Prescriber's Guide Full Conversion (No Questions)

These paths are source-only references and intentionally have no `recall.md` or `vignettes.md`:

- `questions/prescribers-guide/stahls-prescribers-guide.md`
- `questions/prescribers-guide/stahls-chunked/`

### Therapy Correction Notice (No Questions)

Folder: `questions/article-based-pathway/09-therapy/2024-cooperman-more-trial-correction/`

This is a correction-note source folder. It intentionally has no generated questions.

---

## Current Authoring Contract

### Complete Current-Format Example

```markdown
---
qid: white-2020-001
type: recall
difficulty: medium
substances: [alcohol]
topics: [screening-diagnosis]
treatments: [naltrexone]
diagnoses: [alcohol-use-disorder]
source: white-2020
answer: B
---

## Question

A 52-year-old woman presents for a routine visit. She reports drinking
wine "a few times a week." Her physician decides to administer the AUDIT-C.

What is the recommended AUDIT-C cutoff score for identifying unhealthy
alcohol use in women?

## Choices

- A) 2 or more points
- B) 3 or more points
- C) 4 or more points
- D) 5 or more points

## Explanation

The AUDIT-C uses sex-specific cutoffs: >=3 for women and >=4 for men.
Women achieve higher blood alcohol concentrations than men at equivalent
doses due to lower body water content and reduced gastric ADH activity.

**Clinical pearl:** The AUDIT-C is the most validated brief screening tool
in primary care, taking under 1 minute to administer.

**Why other answers are wrong:**
- A) A score of >=2 is too sensitive, leading to excessive false positives
  in clinical practice and unnecessary follow-up.
- C) A score of >=4 is the male cutoff. Using it for women misses
  at-risk female drinkers who metabolize alcohol differently.
- D) A score of >=5 would miss the majority of at-risk drinkers
  regardless of sex.

### Reference

White AM, Castle IP, Hingson RW, Powell PA. Using death certificates to
explore changes in alcohol-related mortality in the United States, 1999 to
2017. Alcohol Clin Exp Res. 2020;44(1):178-187.
```

### YAML Frontmatter Fields

#### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `qid` | string | Non-empty kebab-case string. Used as the output MDX `slug`. | `white-2020-001` |
| `type` | enum | `recall` or `vignette` | `recall` |
| `difficulty` | enum | `easy`, `medium`, or `hard` | `medium` |
| `substances` | string[] | At least one canonical substance slug | `[alcohol]` |
| `topics` | string[] | At least one canonical topic slug | `[screening-diagnosis]` |
| `source` | string | Non-empty source identifier | `white-2020` |
| `answer` | enum | Correct answer letter: `A`, `B`, `C`, `D`, or `E` | `B` |

#### Recommended Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `treatments` | string[] | Canonical treatment slugs when a specific medication is discussed by name | `[naltrexone, acamprosate]` |
| `diagnoses` | string[] | Free-form kebab-case diagnosis slugs | `[alcohol-use-disorder]` |

**When to include `treatments`:** If the stem, correct answer, or explanation discusses a specific medication by name, tag it.

**When to include `diagnoses`:** When the question tests a specific DSM-5 / ICD diagnosis. Diagnosis tags are stored in the database but are not exposed in the current practice filter UI.

#### Strict Frontmatter Rules

- The importer uses `DraftFrontmatterSchema.strict()`. Unknown YAML keys are rejected.
- `treatments` and `diagnoses` default to `[]` when omitted.
- `qid` and `source` must be non-empty strings.
- During draft -> MDX conversion, `qid` is re-validated against the output `slug` regex, so non-kebab-case QIDs fail.

#### QID Policy

Default format:

```text
{source}-{number}
```

Examples:
- `white-2020-001`
- `jones-2023-005`
- `stahls-naltrexone-001`

Rules:
- QIDs must be globally unique across the question bank.
- Number sequentially within each source (`001`, `002`, `003`, ...).
- Never reuse a QID, even if a question is deleted.
- For multi-entry sources like Prescriber's Guide, include a stable sub-identifier (for example a medication name) to keep IDs unique and meaningful.

### Markdown Body Contract

The current draft body uses three required sections:

1. `## Question`
2. `## Choices`
3. `## Explanation`

#### Multi-Question File Rule

Each draft `.md` file can contain multiple question blocks separated by `---`.

**Critical splitter rule:** every question block must start with `---`, and `qid:` must be the first frontmatter key on the next line. The splitter looks for `^---\nqid:`.

#### `## Question`

This section contains the stem. `## Stem` is also accepted by the importer, but `## Question` is the preferred heading for current authoring.

Rules:
- Supports normal markdown.
- Lead-in must end with a question mark.
- Should pass the cover-the-options test.
- Vignettes should follow clinical order: demographics -> history -> exam/findings -> studies/labs -> treatment context -> question.

#### `## Choices`

Use a bullet list with 2-5 options. Standard authoring target is 4 choices.

```markdown
## Choices

- A) First choice text
- B) Second choice text
- C) Third choice text
- D) Fourth choice text
```

Rules:
- Labels must be uppercase `A`-`E`.
- Valid delimiters are `)`, `.`, or `:`.
- The correct answer is set only in YAML `answer`, not by marking a choice in the body.
- Label sequence is strongly preferred even though the parser is not using sequence as the primary validity check.
- All choices should be homogeneous and plausible.
- Do not use "all of the above" or "none of the above".

#### `## Explanation`

This section has three parts in strict order:

1. General explanation of why the correct answer is right
2. `**Clinical pearl:**`
3. `**Why other answers are wrong:**` with one bullet per wrong choice

```markdown
## Explanation

General explanation of the correct answer. Teach the concept, mechanism,
or clinical reasoning.

**Clinical pearl:** Practical takeaway for real-world patient care.

**Why other answers are wrong:**
- A) Explain the misconception or error in reasoning.
- C) Teach why choice C is wrong.
- D) Correct the clinical misunderstanding behind D.

### Reference

AMA-format citation.
```

#### Wrong-Answer Section Rules (Current Strict Contract)

These rules reflect the current strict parser validation implemented under DEBT-338 Phase 1:

- `**Clinical pearl:**` must appear **before** `**Why other answers are wrong:**`.
- Use **exactly one bullet per wrong choice**. Never combine labels like `- A, B, D)`.
- Every wrong-answer bullet must have a **non-blank body**.
- Bullet labels must be `A`-`E` only.
- Do not put any non-empty stray text before the first valid wrong-answer bullet.
- Do not use numbered lists (`1.` / `1)`).
- Do not put heading-style lines inside the wrong-answer subsection. The only allowed terminating heading is an exact `### Reference`.
- Do not put any non-bullet text after the last bullet except blank lines and the terminal `### Reference` heading.
- Bullet bodies must stay **plain paragraph text with optional inline emphasis only**. Do not use nested lists, numbered sublists, blockquotes, code blocks, or indentation-sensitive markdown inside a wrong-answer bullet.
- Do **not** prefix the wrong-answer explanation with the choice text (full text or short label before a colon). Start directly with the reasoning.

**Runtime behavior note:** If a wrong-answer explanation is missing or blank in the stored content, the UI omits only that choice's explanation and still renders the wrong-answer section for choices that have content. That runtime fallback does **not** relax the authoring standard; every wrong answer should still have a real explanation.

#### `### Reference`

Every question must end the explanation with a `### Reference` subsection.

Rules:
- AMA-style citation.
- Placed at the very end of `## Explanation`.
- Same `source` usually means the same citation text across all questions from that source.
- For Prescriber's Guide questions, cite the textbook edition.

### Answer Field and Choice Shuffling

`answer` in frontmatter is the sole source of truth for which authored choice is correct:

```yaml
answer: B
```

Pipeline behavior:
- Draft authoring keeps choices unmarked in `## Choices`.
- During draft -> MDX conversion, the matching choice becomes `correct: true`.
- In the database, choices store `is_correct: boolean`.
- In the UI, choices are shuffled deterministically per `(userId, questionId)`.

**Authoring implication:** Put the correct answer at whichever letter you specify in `answer`; the system handles the rest.

---

## Canonical Taxonomy

**Code source of truth:** `lib/content/draftTaxonomy.ts`

### Topic (13 values)

Display order on the Practice page: **Topic -> Substance -> Treatment**

| # | Slug | Display Name |
|---|------|--------------|
| 1 | `screening-diagnosis` | Screening & Diagnosis |
| 2 | `epidemiology-prevention` | Epidemiology & Prevention |
| 3 | `pharmacology-neuroscience` | Pharmacology & Neuroscience |
| 4 | `intoxication-toxicology` | Intoxication & Toxicology |
| 5 | `withdrawal-management` | Withdrawal Management |
| 6 | `treatment-pharmacotherapy` | Treatment & Pharmacotherapy |
| 7 | `psychosocial-interventions` | Psychosocial Interventions |
| 8 | `co-occurring-disorders` | Co-occurring Disorders |
| 9 | `medical-complications` | Medical Complications |
| 10 | `harm-reduction` | Harm Reduction |
| 11 | `ethics-legal` | Ethics & Legal |
| 12 | `special-populations` | Special Populations |
| 13 | `general` | General |

### Substance (11 values)

| # | Slug | Display Name |
|---|------|--------------|
| 1 | `alcohol` | Alcohol |
| 2 | `cannabis` | Cannabis |
| 3 | `cocaine` | Cocaine |
| 4 | `hallucinogens` | Hallucinogens |
| 5 | `inhalants` | Inhalants |
| 6 | `opioids` | Opioids |
| 7 | `polysubstance` | Polysubstance |
| 8 | `sedatives` | Sedatives |
| 9 | `stimulants` | Stimulants |
| 10 | `tobacco` | Tobacco |
| 11 | `other` | Other |

### Treatment (12 values)

Medications only.

| # | Slug | Display Name |
|---|------|--------------|
| 1 | `acamprosate` | Acamprosate |
| 2 | `buprenorphine` | Buprenorphine |
| 3 | `bupropion` | Bupropion |
| 4 | `disulfiram` | Disulfiram |
| 5 | `gabapentin` | Gabapentin |
| 6 | `methadone` | Methadone |
| 7 | `naloxone` | Naloxone |
| 8 | `naltrexone` | Naltrexone |
| 9 | `nrt` | NRT |
| 10 | `topiramate` | Topiramate |
| 11 | `varenicline` | Varenicline |
| 12 | `other-treatment` | Other |

> Treatment "Other" uses `other-treatment`, not `other`, because tag slugs are globally unique across kinds.

### Diagnosis

No canonical list. Use kebab-case (for example `alcohol-use-disorder`, `opioid-use-disorder`).

### Migration Maps

#### Exam Section -> Topic

| Old Exam Section | New Topic |
|------------------|-----------|
| Co-occurring & Medical Complications | Split: psychiatric comorbidity -> `co-occurring-disorders`, medical consequences -> `medical-complications` |
| Epidemiology & Prevention | `epidemiology-prevention` |
| Ethics, Legal & Policy | `ethics-legal` |
| General | `general` |
| Pharmacology & Neuroscience | `pharmacology-neuroscience` |
| Psychosocial Interventions | `psychosocial-interventions` |
| Screening & Diagnosis | `screening-diagnosis` |
| Treatment & Pharmacotherapy | `treatment-pharmacotherapy` |

#### Old Topic -> New Topic

| Old Topic Slug | New Topic Slug |
|----------------|----------------|
| `comorbidity` | `co-occurring-disorders` |
| `diagnosis` | `screening-diagnosis` |
| `epidemiology` | `epidemiology-prevention` |
| `ethics-legal` | `ethics-legal` |
| `harm-reduction` | `harm-reduction` |
| `intoxication` | `intoxication-toxicology` |
| `medical-complications` | `medical-complications` |
| `neurobiology` | `pharmacology-neuroscience` |
| `pharmacology` | `pharmacology-neuroscience` |
| `psychosocial` | `psychosocial-interventions` |
| `psychotherapy` | `psychosocial-interventions` |
| `screening` | `screening-diagnosis` |
| `special-populations` | `special-populations` |
| `topic` | DELETE - retag manually based on content |
| `toxicology` | `intoxication-toxicology` |
| `treatment` | `treatment-pharmacotherapy` |
| `withdrawal` | `withdrawal-management` |

#### Old Substance -> New Substance

- All 10 prior published values carry over unchanged.
- `inhalants` was added as a canonical value.
- `caffeine` was dropped from the draft taxonomy because it is not a supported runtime filter value here.

#### Old Treatment -> New Treatment

| Old Treatment Slug | New Treatment Slug |
|--------------------|--------------------|
| `buprenorphine` | `buprenorphine` |
| `naloxone` | `naloxone` |
| `naltrexone` | `naltrexone` |

New treatment tags added during taxonomy cleanup: `acamprosate`, `bupropion`, `disulfiram`, `gabapentin`, `methadone`, `nrt`, `topiramate`, `varenicline`, `other-treatment`.

### Content Gaps (Post-Migration Priorities)

These tags are expected to remain thin and should be treated as content-generation priorities:

- **Substances:** inhalants, cocaine, hallucinogens
- **Treatments:** acamprosate, disulfiram, varenicline, NRT, topiramate, gabapentin, methadone, bupropion

### Runtime / UI Notes

- The runtime filter UI intentionally shows **Topic -> Substance -> Treatment** only.
- `diagnosis` tags are stored in the database but intentionally hidden from the current practice filter UI.
- "Leave empty to include all" behavior remains unchanged.

### Implementation Status (SPEC-033)

The canonical taxonomy migration is already implemented:

- Content was migrated off legacy domain tags and non-canonical topic slugs.
- Import and seed code enforce canonical topic / substance / treatment values.
- Runtime filters already use Topic -> Substance -> Treatment.
- Historical cleanup artifacts like the old domain-tag migration script are retired.

---

## Pipeline and Validation

### File Organization

```text
content/drafts/questions/
├── article-based-pathway/{chapter}/{paper}/
│   ├── {paper}.md
│   ├── recall.md
│   └── vignettes.md
├── prescribers-guide/{nn}-{medication}/
│   └── recall.md
├── cochrane/{review}/
│   ├── recall.md
│   └── vignettes.md
└── ... (other source families follow the same pattern)
```

`pnpm content:import:drafts` scans only `**/recall.md` and `**/vignettes.md`.

### Import Output

```text
content/questions/imported/
├── article-based-pathway/{source}/{qid}.mdx
├── prescribers-guide/{source}/{qid}.mdx
└── ...
```

### Commands

```bash
# Validate drafts without writing files
pnpm content:import:drafts -- --dry-run

# Import drafts -> MDX (draft status)
pnpm content:import:drafts

# Import drafts -> MDX (published status)
pnpm content:import:drafts -- --status published

# Seed MDX -> database
pnpm db:seed

# Include placeholders while seeding
SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed

# Full pipeline
pnpm content:import:drafts -- --status published && pnpm db:seed
```

There is currently **no separate dedicated question-validator script** in this repo. `pnpm content:import:drafts -- --dry-run` is the current structural validation path.

### Tag / Answer Flow Summary

- `answer: B` in draft frontmatter becomes `correct: true` on the matching MDX choice.
- Draft tag slugs are expanded into `{ slug, name, kind }` objects during import.
- The seed step validates canonical tag kinds/slugs and writes tags plus `question_tags` relations.
- Per-choice explanations are currently extracted from markdown under `**Why other answers are wrong:**`.

### Validation Rejection Table

Your draft will be rejected if any of these fail:

| Validation | Where | Typical Error |
|-----------|-------|---------------|
| Unknown draft frontmatter key | Import script (`.strict()`) | `Unrecognized key(s) in object` |
| `topics` contains non-canonical slug | Import schema | `Invalid enum value` |
| `substances` contains non-canonical slug | Import schema | `Invalid enum value` |
| `treatments` contains non-canonical slug | Import schema | `Invalid enum value` |
| Missing `topics` or empty array | Import schema | `Array must contain at least 1 element` |
| Missing `substances` or empty array | Import schema | `Array must contain at least 1 element` |
| `qid` missing or empty | Import schema | `String must contain at least 1 character` |
| `qid` not kebab-case | Output MDX schema | Regex failure on `slug` |
| `source` missing or empty | Import schema | `String must contain at least 1 character` |
| `answer` not `A`-`E` | Import schema | `Invalid enum value` |
| `type` not `recall` / `vignette` | Import schema | `Invalid enum value` |
| `difficulty` not `easy` / `medium` / `hard` | Import schema | `Invalid enum value` |
| `diagnoses` contains non-kebab-case slug | Import schema | `tag slugs must be kebab-case` |
| Missing required headings / bad heading order | Import parser | `Missing required heading` / `Invalid heading order` |
| Fewer than 2 parsed choices | Import parser | `Choices parsing failed: expected at least 2 choices` |
| No matching choice for `answer` | Output MDX schema | `choices must contain exactly 1 correct=true` |
| Duplicate choice labels | Output MDX schema | `choice labels must be unique` |
| More than 5 choices | Output MDX schema | `Array must contain at most 5 element(s)` |
| Duplicate tag slugs in one question | Output MDX schema | `tag slugs must be unique` |
| Missing topic or substance tags in MDX | Output MDX schema / seed validation | `at least one topic tag is required` / `at least one substance tag is required` |
| `domain` tag kind present in MDX | Seed script | `... has domain tag ... which is not allowed` |
| Wrong-answer explanation references unknown choice label | Seed script | `Explanation references choice label` |
| Wrong-answer subsection violates DEBT-338 strict validation | Seed script | slugged fail-fast error pointing at the offending line |

### Current Known Seed Debt

DEBT-338 found **24 currently corrupted imported files**:
- 23 clinical-pearl-after-bullets contaminations
- 1 combined-label wrong-answer bullet

The full file list and draft line numbers live in `NOTES.md`. Use that file for repair work in the external repo. Do not re-document the full list elsewhere.

---

## NBME / Board-Style Quality Principles

### Question Philosophy

- Test **application of knowledge**, not isolated recall of trivia.
- Focus on clinically important concepts a practicing addiction psychiatrist or addiction medicine physician would use.
- Every question should teach something.
- Prefer common/high-yield problems over zebras.

### Stem / Vignette Structure

Every vignette should, when relevant, flow through:

1. Demographics
2. Setting
3. Chief complaint / presenting problem
4. Focused history
5. Relevant exam / mental status / labs
6. Lead-in question

Keep only the details needed to support the clinical task.

### Lead-In Rules

- Must end with a question mark.
- Must be answerable without seeing the choices.
- Must ask a specific clinical task.

Preferred lead-ins:
- "Which of the following is the most likely diagnosis?"
- "Which of the following is the most appropriate next step in management?"
- "Which of the following is the most appropriate pharmacotherapy?"
- "Which mechanism best explains this presentation?"

Avoid:
- "Which of the following is true?"
- "Which statement is correct?"
- "All of the following EXCEPT..."

### Distractor Rules

- Target 4 options total unless there is a compelling reason to use 5.
- Distractors must be homogeneous.
- Distractors must be clinically plausible.
- The correct answer should not be obviously longer or more qualified.
- Avoid absurd options, pure number-variation distractors, and absolute language.
- Distractors should represent real misconceptions or reasonable alternatives in the differential.

### What to Test

- Mechanism of action and pharmacology
- Clinical decision-making
- Diagnosis from presentation
- Evidence-based clinical implications
- Safety / overdose / withdrawal / interactions
- Special populations and co-occurring disorders

### What Never to Test

- Sample sizes or participant counts
- Number of studies in a review
- P-values or confidence intervals
- Publication dates or journal trivia
- Exact epidemiologic percentages unless the number itself is directly clinically actionable
- Study design minutiae unless the learning objective is evidence quality

### Explanation Standards

Every explanation should include:

1. Why the correct answer is correct
2. Why each wrong answer is wrong
3. A clinical pearl

If a source paper matters, teach the **clinical implication**, not the paper's trivia.

### Explanation Anti-Patterns

Do not:
- Say only "this is incorrect"
- Say only "this overestimates / underestimates the value"
- Restate the full choice text before the explanation
- Write explanations shorter than the stem unless the concept is extremely simple
- Put the clinical pearl after the wrong-answer bullets

### Difficulty Calibration

Use the operational distribution:

| File | Easy | Medium | Hard |
|------|------|--------|------|
| `recall.md` | 2 | 2 | 2 |
| `vignettes.md` | 2 | 2 | 2 |

### Question Type Distribution

Use the operational split:
- 6 recall questions per standard source paper
- 6 vignette questions per standard source paper

Even recall items should stay clinically meaningful and avoid raw fact regurgitation.

---

## Canonical Quality Checklist

Use this checklist before saving or transplanting question files:

- [ ] Current format is being used (do **not** author Phase 2 structured `choices[]` yet)
- [ ] Each question has the required frontmatter keys: `qid`, `type`, `difficulty`, `substances`, `topics`, `source`, `answer`
- [ ] `qid` is globally unique and follows the source-based naming policy
- [ ] `substances` and `topics` use canonical slugs and array syntax
- [ ] `treatments` is included when a specific medication is discussed by name
- [ ] `diagnoses`, if used, are kebab-case
- [ ] File is named `recall.md` or `vignettes.md` so the importer will discover it
- [ ] `## Question`, `## Choices`, and `## Explanation` are present
- [ ] Lead-in ends with `?` and passes the cover-the-options test
- [ ] Choices are homogeneous, plausible, and free of obvious length cues
- [ ] No "all of the above" / "none of the above"
- [ ] Explanation teaches the concept, not just the answer key
- [ ] `**Clinical pearl:**` appears before `**Why other answers are wrong:**`
- [ ] There is exactly one wrong-answer bullet per wrong choice
- [ ] Wrong-answer bullet bodies are plain paragraph text only
- [ ] Wrong-answer explanations do not prefix with any form of the choice text
- [ ] Every wrong answer has a non-blank explanation
- [ ] Nothing appears between the last wrong-answer bullet and `### Reference` except blank lines
- [ ] `### Reference` is present at the end of the explanation with an AMA-format citation
- [ ] Question tests clinical concepts, not study trivia/statistics
- [ ] Prescriber's Guide questions have an explicit addiction-psychiatry hook
- [ ] `pnpm content:import:drafts -- --dry-run` passes in the app repo

---

## Unsupported / Future YAML Fields

These keys are **not currently supported** by the importer and will be rejected if added now:

- `evidence`
- `certainty`
- `citation`
- `doi`

Current citation source of truth remains the `### Reference` subsection in `## Explanation`.

---

## Phase 2 Target Format (DEBT-338 Future State)

**Status:** Target only. Do not author new questions in this format yet.

The long-term goal is to move per-choice explanations out of freeform markdown and into structured choice data.

### Future Target Example

```markdown
---
qid: white-2020-001
type: recall
difficulty: medium
substances: [alcohol]
topics: [screening-diagnosis]
source: white-2020
choices:
  - label: A
    text: 2 or more points
    correct: false
    explanation: A score of >=2 is too sensitive for the validated female cutoff.
  - label: B
    text: 3 or more points
    correct: true
  - label: C
    text: 4 or more points
    correct: false
    explanation: A score of >=4 is the male cutoff and misses at-risk women.
  - label: D
    text: 5 or more points
    correct: false
    explanation: A score of >=5 misses too many at-risk drinkers.
---

## Question

A 52-year-old woman presents for a routine visit. She reports drinking
wine "a few times a week." Her physician decides to administer the AUDIT-C.

What is the recommended AUDIT-C cutoff score for identifying unhealthy
alcohol use in women?

## Explanation

The AUDIT-C uses sex-specific cutoffs: >=3 for women and >=4 for men.

**Clinical pearl:** The AUDIT-C is the most validated brief screening tool
in primary care.

### Reference

White AM, Castle IP, Hingson RW, Powell PA. Using death certificates to
explore changes in alcohol-related mortality in the United States, 1999 to
2017. Alcohol Clin Exp Res. 2020;44(1):178-187.
```

Phase 2 implications:
- `choices[]` becomes structured authoring data, not just imported MDX output.
- `## Choices` and `**Why other answers are wrong:**` become unnecessary.
- `parseChoiceExplanations()` can retire from per-choice parsing and keep only general explanation + reference extraction.

Until that migration is implemented, author against the **current** contract documented above.
