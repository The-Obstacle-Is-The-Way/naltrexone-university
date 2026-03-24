# Question Format Spec — Single Source of Truth

> **Status:** Active
> **Last Updated:** 2026-03-24
> **Purpose:** Complete reference for authoring draft questions that pass
> cleanly through the draft -> import -> MDX -> seed -> database -> UI
> pipeline.
>
> This document is intentionally code-backed. When in doubt, verify against
> `scripts/draft-question-import.ts`, `lib/content/schemas.ts`,
> `scripts/seed/question-parser.ts`, and `scripts/seed-helpers.ts`.

---

## 1. Draft Question Format (Complete Example)

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

**Clinical pearl:** The AUDIT-C is a fast, well-validated screening tool for
unhealthy alcohol use in primary care.

**Why other answers are wrong:**
- A) This is too sensitive for the standard female cutoff and would overcall
  unhealthy use.
- C) This is the standard male cutoff, not the standard female cutoff.
- D) This threshold is too high and would miss many at-risk patients.

### Reference

White AM, Castle IP, Hingson RW, Powell PA. Using death certificates to
explore changes in alcohol-related mortality in the United States, 1999 to
2017. Alcohol Clin Exp Res. 2020;44(1):178-187.
```

---

## 2. YAML Frontmatter Fields

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `qid` | string | Non-empty string. Becomes the output MDX `slug` | `white-2020-001` |
| `type` | enum | `recall` or `vignette` | `recall` |
| `difficulty` | enum | `easy`, `medium`, or `hard` | `medium` |
| `substances` | string[] | At least one canonical substance slug | `[alcohol]` |
| `topics` | string[] | At least one canonical topic slug | `[screening-diagnosis]` |
| `source` | string | Non-empty source identifier | `white-2020` |
| `answer` | enum | Correct answer letter: `A`, `B`, `C`, `D`, or `E` | `B` |

### Recommended Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `treatments` | string[] | Canonical treatment slugs when a medication is discussed by name | `[naltrexone, acamprosate]` |
| `diagnoses` | string[] | Free-form kebab-case diagnosis slugs | `[alcohol-use-disorder]` |

### Importer Enforcement Details

- Frontmatter is strict. Unknown YAML keys are rejected.
- `treatments` and `diagnoses` default to `[]` when omitted.
- `qid` and `source` are validated as non-empty strings during draft parse.
- `answer` must match `A-E`.
- `diagnoses` must be kebab-case slugs.
- During draft -> MDX conversion, `qid` is revalidated by
  `QuestionFrontmatterSchema.slug`, so non-kebab-case QIDs fail before write.

### QID Policy (Authoring Convention)

- Keep `qid` globally unique across the question bank.
- Default format: `{source}-{number}`.
- Number sequentially within each source (`001`, `002`, `003`, ...).
- Never reuse a `qid`, even if a question is later removed.
- Prescriber's guide exception: include the medication in the `qid` when a
  shared `source` value would otherwise collide
  (example: `stahls-naltrexone-001` with `source: stahls-8e`).

---

## 3. Canonical Tag Vocabularies

These are the only valid canonical values for topic, substance, and treatment.

**Code source of truth:** `lib/content/draftTaxonomy.ts`

### Topic (13 values)

| Slug | Display Name |
|------|--------------|
| `screening-diagnosis` | Screening & Diagnosis |
| `epidemiology-prevention` | Epidemiology & Prevention |
| `pharmacology-neuroscience` | Pharmacology & Neuroscience |
| `intoxication-toxicology` | Intoxication & Toxicology |
| `withdrawal-management` | Withdrawal Management |
| `treatment-pharmacotherapy` | Treatment & Pharmacotherapy |
| `psychosocial-interventions` | Psychosocial Interventions |
| `co-occurring-disorders` | Co-occurring Disorders |
| `medical-complications` | Medical Complications |
| `harm-reduction` | Harm Reduction |
| `ethics-legal` | Ethics & Legal |
| `special-populations` | Special Populations |
| `general` | General |

### Substance (11 values)

| Slug | Display Name |
|------|--------------|
| `alcohol` | Alcohol |
| `cannabis` | Cannabis |
| `cocaine` | Cocaine |
| `hallucinogens` | Hallucinogens |
| `inhalants` | Inhalants |
| `opioids` | Opioids |
| `polysubstance` | Polysubstance |
| `sedatives` | Sedatives |
| `stimulants` | Stimulants |
| `tobacco` | Tobacco |
| `other` | Other |

### Treatment (12 values)

| Slug | Display Name |
|------|--------------|
| `acamprosate` | Acamprosate |
| `buprenorphine` | Buprenorphine |
| `bupropion` | Bupropion |
| `disulfiram` | Disulfiram |
| `gabapentin` | Gabapentin |
| `methadone` | Methadone |
| `naloxone` | Naloxone |
| `naltrexone` | Naltrexone |
| `nrt` | NRT |
| `topiramate` | Topiramate |
| `varenicline` | Varenicline |
| `other-treatment` | Other |

Diagnosis has no canonical list. Use kebab-case slugs and let the importer
title-case the display name.

---

## 4. Legacy Slug Migration Map

Old topic slugs that still appear in source material should be remapped before
import:

| Old Topic Slug | New Canonical Slug |
|----------------|-------------------|
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
| `topic` | DELETE — retag manually based on content |
| `toxicology` | `intoxication-toxicology` |
| `treatment` | `treatment-pharmacotherapy` |
| `withdrawal` | `withdrawal-management` |

---

## 5. Markdown Body Structure

### `## Question` (or `## Stem`)

Drafts may use `## Question` or `## Stem`. The importer accepts both and emits
`## Stem` in generated MDX.

Rules:

- Supports normal Markdown.
- Lead-in should end with `?`.
- Vignettes should preserve clinical order and pass the cover-the-options test.

### `## Choices`

Choices are parsed from bullets under `## Choices`.

Rules:

- 2-5 choices are allowed by the pipeline; the current authoring standard is 4.
- Labels must be `A-E`.
- Accepted delimiters are `)`, `.`, or `:`.
- The correct answer is identified only by the YAML `answer` field.
- Label order is recommended but not code-enforced.

### `## Explanation`

The explanation block can contain three logical parts:

1. General explanation
2. `Why other answers are wrong` per-choice bullets
3. `### Reference`

Current parser behavior:

- The wrong-answer heading is matched case-insensitively, with optional
  bold/underline markers and an optional trailing `:`.
- Per-choice bullets can start with `-`, `*`, or `+`.
- Bullet labels can use `A)`, `A.`, or `A:`.
- Parsing stops at the next markdown heading.
- If a wrong-answer bullet references a choice label not present in the
  question, seed fails.

Authoring guidance:

- Provide a non-blank explanation bullet for every incorrect choice.
- Do not repeat the wrong choice text inside the explanation bullet. The UI
  already renders the choice text above the explanation.
- Use the general explanation for the correct-answer teaching point.
- Use the per-choice bullets to teach why each incorrect option is wrong.

Runtime/UI behavior:

- If some incorrect choices have explanations and others do not, the UI omits
  only the missing ones and still renders the wrong-answer section for the
  remaining explained choices.

### `### Reference`

`### Reference` is supported today, but with one important parser constraint:
it is extracted into `reference_md` only when it appears inside `## Explanation`
after the `Why other answers are wrong` subsection. If the wrong-answer heading
is missing entirely, the whole explanation body is treated as general
explanation and `reference_md` remains `null`.

Current authoring convention:

- Put `### Reference` at the end of `## Explanation`.
- Use AMA-style citation text.
- Treat it as parser-supported but not schema-required.

---

## 6. Answer Field and Choice Shuffling

The `answer` field marks which authored choice is correct:

```yaml
answer: B
```

Pipeline behavior:

1. Draft choices are plain text bullets, not `correct: true/false` objects.
2. The importer converts `answer: B` into MDX `choices[].correct`.
3. Seed enforces exactly one correct choice before insert/update.
4. Runtime presentation shuffles choices deterministically per user and
   question, so authored letters are not guaranteed to match displayed letters.

Authoring implication: write the best answer at the letter you specify in
`answer`; do not try to pre-randomize choices.

---

## 7. How Tags and References Flow Through the System

```text
Draft YAML                         Import                    MDX / Seed / UI
──────────                         ──────                    ───────────────
topics: [screening-diagnosis]  ->  display names looked up  -> tags.kind = topic
substances: [alcohol]          ->  from draftTaxonomy.ts    -> tags stored in DB
treatments: [naltrexone]                                    -> practice/history
diagnoses: [aud]                                            -> hide diagnosis

## Explanation                  ->  carried into MDX        -> seed splits into:
  general text                                                  explanation_md
  Why other answers are wrong                                   choice explanations
  ### Reference                                                 reference_md
```

---

## 8. What the System Validates (Rejection Points)

| Validation | Where |
|-----------|-------|
| Unknown draft frontmatter key | Draft parse (`.strict()`) |
| Non-canonical topic / substance / treatment slug | Draft parse / MDX schema |
| Missing or empty `topics` / `substances` | Draft parse / MDX schema / seed |
| Empty `qid` or `source` | Draft parse |
| Non-kebab-case diagnosis slug | Draft parse |
| Non-kebab-case `qid` | MDX schema (`slug` regex) |
| `answer` not `A-E` | Draft parse |
| `type` not `recall` / `vignette` | Draft parse |
| `difficulty` not `easy` / `medium` / `hard` | Draft parse |
| Missing required headings or bad heading order | Draft parse |
| Fewer than 2 choices or more than 5 choices | Draft parse / MDX schema |
| Duplicate choice labels | MDX schema |
| Duplicate tag slugs in one question | MDX schema |
| More than one or zero correct choices after conversion | MDX schema |
| `domain` tags or non-canonical runtime tags in MDX | Seed validation |
| Wrong-answer explanation references unknown label | Seed validation |

---

## 9. File Organization

### Multi-question Draft Files

Each draft file can contain multiple questions. Discovery depends on the exact
splitter pattern `^---\nqid:`:

- each question block must start with `---`
- `qid:` must be the first frontmatter key on the next line

### Draft Directory Structure

```text
content/drafts/questions/
├── article-based-pathway/{chapter}/{paper}/
│   ├── {paper}.md
│   ├── recall.md
│   └── vignettes.md
├── prescribers-guide/{nn}-{medication}/
│   └── recall.md
└── ...
```

### Import Output

`pnpm content:import:drafts` defaults to:

- input root: `content/drafts/questions`
- output root: `content/questions/imported`
- status: `draft`

Output path shape:

```text
content/questions/imported/<source-group>/<source>/<qid>.mdx
```

---

## 10. Commands

```bash
# Validate drafts without writing files
pnpm content:import:drafts -- --dry-run

# Import drafts as draft status
pnpm content:import:drafts

# Import drafts as published status
pnpm content:import:drafts -- --status published

# Seed generated MDX into the database
pnpm db:seed

# Include placeholders during seed
SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed
```

---

## 11. Unsupported or Convention-Only Areas

### Structured Citation Frontmatter

`### Reference` in the markdown body is supported today. Structured YAML fields
such as `citation:` or `doi:` are not. Do not add them until the draft schema
allows them.

### Diagnosis UI Exposure

Diagnosis tags are stored and validated, but current Practice and History
filters intentionally hide them.

### Global Uniqueness

The code validates non-empty and kebab-case `qid` values, but it does not
centrally enforce global uniqueness across the entire corpus. That remains an
authoring responsibility.

---

## 12. Quick Checklist for Draft Authors

- [ ] Every `qid` is globally unique
- [ ] Each block starts with `---` followed immediately by `qid:`
- [ ] `answer` is in YAML, not marked in the choices
- [ ] `topics`, `substances`, and `treatments` use canonical slugs
- [ ] Diagnoses are kebab-case slugs
- [ ] File names are `recall.md` or `vignettes.md`
- [ ] `## Question` / `## Choices` / `## Explanation` are present
- [ ] Choices are plausible, homogeneous, and avoid cueing
- [ ] Wrong-answer bullets explain reasoning, not just correctness
- [ ] `### Reference` appears after the wrong-answer subsection if you want it
      stored separately
- [ ] `pnpm content:import:drafts -- --dry-run` passes

---

## 13. Related Documents

- [tag-taxonomy-golden-spec.md](./tag-taxonomy-golden-spec.md)
- [tag-taxonomy-pipeline.md](./tag-taxonomy-pipeline.md)
- [content-pipeline.md](../practice-engine/content-pipeline.md)
- `lib/content/draftTaxonomy.ts`
- `lib/content/schemas.ts`
- `scripts/draft-question-import.ts`
- `scripts/import-draft-questions.ts`
- `scripts/seed/question-parser.ts`
- `scripts/seed-helpers.ts`
