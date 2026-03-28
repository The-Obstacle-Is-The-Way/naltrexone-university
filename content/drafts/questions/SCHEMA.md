# NTX University Question Bank Schema

**Purpose:** Single source of truth for active question authoring in this repo's `questions/` tree, mirrored to `content/drafts/questions/` in the app repo.

**Version:** 2.0
**Last Updated:** March 28, 2026
**Status:** Active consolidated spec

**Read This With:**
- `CLAUDE.md` or `AGENTS.md` -- quick-start workflow for the agent you are using
- `PLAN.md` -- current inventory, integrity snapshot, and progress tracking
- `NOTES.md` -- historical audits, parser-corruption file list, Prescriber's rewrite queue, archival reference material
- `docs/debt/debt-338-seed-parser-silent-wrong-answer-section-corruption.md` -- parser hardening + Phase 2 roadmap

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-03-28 | Phase 2 is now the current authoring format. Structured `choices[]` YAML replaces `answer`, `## Choices`, and `**Why other answers are wrong:**`. Frontmatter key order canonicalized. Always double-quote `text` and `explanation` values. |
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

**Important:** As of 2026-03-28 (DEBT-02 migration), Phase 2 structured `choices[]` YAML is the current authoring format. All 948 existing questions have been migrated. Author all new questions in this format.

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

## Current Authoring Contract (Phase 2)

### Complete Example

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
choices:
  - label: A
    text: "2 or more points"
    correct: false
    explanation: "A score of >=2 is too sensitive, leading to excessive false positives in clinical practice and unnecessary follow-up."
  - label: B
    text: "3 or more points"
    correct: true
  - label: C
    text: "4 or more points"
    correct: false
    explanation: "A score of >=4 is the male cutoff. Using it for women misses at-risk female drinkers who metabolize alcohol differently."
  - label: D
    text: "5 or more points"
    correct: false
    explanation: "A score of >=5 would miss the majority of at-risk drinkers regardless of sex."
---

## Question

A 52-year-old woman presents for a routine visit. She reports drinking
wine "a few times a week." Her physician decides to administer the AUDIT-C.

What is the recommended AUDIT-C cutoff score for identifying unhealthy
alcohol use in women?

## Explanation

The AUDIT-C uses sex-specific cutoffs: >=3 for women and >=4 for men.
Women achieve higher blood alcohol concentrations than men at equivalent
doses due to lower body water content and reduced gastric ADH activity.

**Clinical pearl:** The AUDIT-C is the most validated brief screening tool
in primary care, taking under 1 minute to administer.

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
| `choices` | object[] | 2-5 choice objects (see below) | see example |

#### Choice Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `label` | enum | `A`, `B`, `C`, `D`, or `E` |
| `text` | string | Choice text, always double-quoted |
| `correct` | boolean | `true` for exactly one choice, `false` for all others |
| `explanation` | string | Wrong-answer explanation, always double-quoted. Present on wrong choices only. Never on the correct choice. |

**YAML quoting rule:** Always double-quote `text` and `explanation` values. No exceptions. The corpus contains colons, embedded quotes, and `#` characters that break unquoted YAML.

#### Recommended Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `treatments` | string[] | Canonical treatment slugs when a specific medication is discussed by name | `[naltrexone, acamprosate]` |
| `diagnoses` | string[] | Free-form kebab-case diagnosis slugs | `[alcohol-use-disorder]` |

**When to include `treatments`:** If the stem, correct answer, or explanation discusses a specific medication by name, tag it.

**When to include `diagnoses`:** When the question tests a specific DSM-5 / ICD diagnosis. Diagnosis tags are stored in the database but are not exposed in the current practice filter UI.

#### Canonical Frontmatter Key Order

All frontmatter must use this key order:

```yaml
qid:
type:
difficulty:
substances:
topics:
treatments:    # only if present
diagnoses:     # only if present
source:
choices:
```

`qid` must always be the first key. The splitter depends on `---\nqid:` as the block delimiter.

#### Strict Frontmatter Rules

- The importer uses `DraftFrontmatterSchema.strict()`. Unknown YAML keys are rejected.
- `treatments` and `diagnoses` default to `[]` when omitted.
- `qid` and `source` must be non-empty strings.
- During draft to MDX conversion, `qid` is re-validated against the output `slug` regex, so non-kebab-case QIDs fail.
- Exactly one choice must have `correct: true`.
- A correct choice must NOT have an `explanation` field.
- Every wrong choice must have a non-empty `explanation`.

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

The draft body uses two required sections:

1. `## Question`
2. `## Explanation`

There is no `## Choices` section. Choice data (text, correctness, and per-choice wrong-answer explanations) lives in the YAML `choices[]` frontmatter.

#### Multi-Question File Rule

Each draft `.md` file can contain multiple question blocks separated by `---`.

**Critical splitter rule:** every question block must start with `---`, and `qid:` must be the first frontmatter key on the next line. The splitter looks for `^---\nqid:`.

#### `## Question`

This section contains the stem. `## Stem` is also accepted by the importer, but `## Question` is the preferred heading for current authoring.

Rules:
- Supports normal markdown.
- Lead-in must end with a question mark.
- Should pass the cover-the-options test.
- Vignettes should follow clinical order: demographics, history, exam/findings, studies/labs, treatment context, question.

#### `## Explanation`

This section has two or three parts:

1. General explanation of why the correct answer is right
2. `**Clinical pearl:**` (recommended but optional; 100 existing questions lack one)
3. `### Reference`

Per-choice wrong-answer explanations are in the YAML `choices[].explanation` fields, not in the markdown body.

```markdown
## Explanation

General explanation of the correct answer. Teach the concept, mechanism,
or clinical reasoning.

**Clinical pearl:** Practical takeaway for real-world patient care.

### Reference

AMA-format citation.
```

**Do not include** `**Why other answers are wrong:**` or per-choice bullets in the body. That data belongs in the YAML frontmatter.

#### `### Reference`

Every question must end the explanation with a `### Reference` subsection.

Rules:
- AMA-style citation.
- Placed at the very end of `## Explanation`.
- Same `source` usually means the same citation text across all questions from that source.
- For Prescriber's Guide questions, cite the textbook edition.

### Choice and Answer Handling

The correct answer is identified by `correct: true` on exactly one choice in the YAML `choices[]` array.

Pipeline behavior:
- Draft authoring puts all choice data (label, text, correctness, wrong-answer explanations) in YAML frontmatter.
- During draft to MDX conversion, `choices[]` is carried through directly.
- In the database, choices store `is_correct: boolean` and `explanation_md`.
- In the UI, choices are shuffled deterministically per `(userId, questionId)`.

**Authoring implication:** Mark exactly one choice as `correct: true`. All other choices get `correct: false` plus an `explanation`.

---

## Canonical Taxonomy

**Code source of truth:** `lib/content/draftTaxonomy.ts`

### Topic (13 values)

Display order on the Practice page: **Topic, Substance, Treatment**

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

#### Exam Section to Topic

| Old Exam Section | New Topic |
|------------------|-----------|
| Co-occurring & Medical Complications | Split: psychiatric comorbidity maps to `co-occurring-disorders`, medical consequences map to `medical-complications` |
| Epidemiology & Prevention | `epidemiology-prevention` |
| Ethics, Legal & Policy | `ethics-legal` |
| General | `general` |
| Pharmacology & Neuroscience | `pharmacology-neuroscience` |
| Psychosocial Interventions | `psychosocial-interventions` |
| Screening & Diagnosis | `screening-diagnosis` |
| Treatment & Pharmacotherapy | `treatment-pharmacotherapy` |

#### Old Topic to New Topic

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

#### Old Substance to New Substance

- All 10 prior published values carry over unchanged.
- `inhalants` was added as a canonical value.
- `caffeine` was dropped from the draft taxonomy because it is not a supported runtime filter value here.

#### Old Treatment to New Treatment

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

- The runtime filter UI intentionally shows **Topic, Substance, Treatment** only.
- `diagnosis` tags are stored in the database but intentionally hidden from the current practice filter UI.
- "Leave empty to include all" behavior remains unchanged.

### Implementation Status (SPEC-033)

The canonical taxonomy migration is already implemented:

- Content was migrated off legacy domain tags and non-canonical topic slugs.
- Import and seed code enforce canonical topic / substance / treatment values.
- Runtime filters already use Topic, Substance, Treatment.
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

# Import drafts to MDX (draft status)
pnpm content:import:drafts

# Import drafts to MDX (published status)
pnpm content:import:drafts -- --status published

# Seed MDX to database
pnpm db:seed

# Include placeholders while seeding
SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed

# Full pipeline
pnpm content:import:drafts -- --status published && pnpm db:seed
```

This repo does include local helper scripts (for example `validate_questions.py`), but `pnpm content:import:drafts -- --dry-run` in the app repo remains the canonical structural validation path.

### Tag / Answer Flow Summary

- `choices[]` in draft frontmatter carries `correct: true/false` and `explanation` directly into the MDX output.
- Draft tag slugs are expanded into `{ slug, name, kind }` objects during import.
- The seed step validates canonical tag kinds/slugs and writes tags plus `question_tags` relations.
- Per-choice explanations are read from YAML `choices[].explanation` (no markdown parsing needed).

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
| `type` not `recall` / `vignette` | Import schema | `Invalid enum value` |
| `difficulty` not `easy` / `medium` / `hard` | Import schema | `Invalid enum value` |
| `diagnoses` contains non-kebab-case slug | Import schema | `tag slugs must be kebab-case` |
| Missing `choices` or fewer than 2 choices | Import schema | `Array must contain at least 2 element(s)` |
| No choice with `correct: true` | Import schema | `choices must contain exactly 1 correct=true` |
| Correct choice has `explanation` | Import schema | `correct choice must not have explanation` |
| Wrong choice missing `explanation` | Import schema | `wrong choice must have explanation` |
| Duplicate choice labels | Output MDX schema | `choice labels must be unique` |
| More than 5 choices | Output MDX schema | `Array must contain at most 5 element(s)` |
| Missing required headings / bad heading order | Import parser | `Missing required heading` / `Invalid heading order` |
| Duplicate tag slugs in one question | Output MDX schema | `tag slugs must be unique` |
| Missing topic or substance tags in MDX | Output MDX schema / seed validation | `at least one topic tag is required` / `at least one substance tag is required` |
| `domain` tag kind present in MDX | Seed script | `... has domain tag ... which is not allowed` |

### Historical Seed Debt (Resolved)

DEBT-338 found 24 corrupted imported files caused by regex parsing of wrong-answer sections. These were fixed in DEBT-01 and the regex parsing was eliminated by DEBT-02 (Phase 2 migration). The full historical file list lives in `NOTES.md`.

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
- Restate the full choice text before the wrong-answer explanation
- Write explanations shorter than the stem unless the concept is extremely simple

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

**Frontmatter:**
- [ ] Phase 2 format: structured `choices[]` in YAML (no `answer:`, no `## Choices`, no `**Why other answers are wrong:**`)
- [ ] Frontmatter key order: `qid, type, difficulty, substances, topics, treatments, diagnoses, source, choices`
- [ ] `qid` is globally unique and follows the source-based naming policy
- [ ] `substances` and `topics` use canonical slugs and array syntax
- [ ] `treatments` is included when a specific medication is discussed by name
- [ ] `diagnoses`, if used, are kebab-case
- [ ] File is named `recall.md` or `vignettes.md` so the importer will discover it

**Choices:**
- [ ] Exactly one choice has `correct: true`, all others `correct: false`
- [ ] Correct choice has NO `explanation` field
- [ ] Every wrong choice has a non-empty `explanation`
- [ ] `text` and `explanation` values are always double-quoted
- [ ] Wrong-answer explanations do not prefix with any form of the choice text
- [ ] Choices are homogeneous, plausible, and free of obvious length cues
- [ ] No "all of the above" / "none of the above"

**Body:**
- [ ] `## Question` and `## Explanation` are present (no `## Choices`)
- [ ] Lead-in ends with `?` and passes the cover-the-options test
- [ ] Explanation teaches the concept, not just the answer key
- [ ] `**Clinical pearl:**` is present (recommended for all new questions)
- [ ] `### Reference` is present at the end of the explanation with an AMA-format citation
- [ ] No `**Why other answers are wrong:**` in the body (that data is in YAML)

**General:**
- [ ] Question tests clinical concepts, not study trivia/statistics
- [ ] Prescriber's Guide questions have an explicit addiction-psychiatry hook
- [ ] `pnpm content:import:drafts -- --dry-run` passes in the app repo

---

## Unsupported / Retired YAML Fields

These keys are **not supported** by the importer and will be rejected:

- `answer` (retired in Phase 2; replaced by `choices[].correct`)
- `evidence`
- `certainty`
- `citation`
- `doi`

Current citation source of truth remains the `### Reference` subsection in `## Explanation`.

---

## Migration History

### Phase 2 (DEBT-02, 2026-03-28)

Migrated all 948 questions from legacy format to structured `choices[]` YAML. Changes:
- `answer: B` replaced by `correct: true` on the matching choice
- `## Choices` section removed from markdown body (choice data now in YAML)
- `**Why other answers are wrong:**` section removed from markdown body (per-choice explanations now in YAML `explanation` fields)
- Frontmatter key order canonicalized across all 170 files
- All `text` and `explanation` values double-quoted

The legacy format (with `answer`, `## Choices`, and wrong-answer bullets in the body) is no longer used. See `docs/debt/DEBT-02-phase2-yaml-frontmatter-migration.md` for the full spec.
