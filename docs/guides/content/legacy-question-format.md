# Legacy Question Format

> **Status:** Historical format, retained pending owner review; not valid for new drafts
> **Purpose:** Preserve the previous authoring and operational guidance until its unique content has been reconciled. New drafts use [the active schema](../../../content/drafts/questions/SCHEMA.md) and [the importer](../../../scripts/draft-question-import.ts). The `answer:` field and `## Choices` examples below are historical and rejected by the active importer.
>
> This described the importer as of 2026-03-24; the current importer rejects this format. For today's rules, read
> `scripts/draft-question-import.ts`, `lib/content/schemas.ts`,
> `scripts/seed/question-parser.ts`, and `scripts/seed-helpers.ts`.

---

## 1. Draft Question Format (Historical Syntax)

The clinical explanation and reference were corrected on 2026-10-18; the
legacy syntax below remains intentionally invalid for the current importer.

```markdown
---
qid: bradley-2007-001
type: recall
difficulty: medium
substances: [alcohol]
topics: [screening-diagnosis]
treatments: []
diagnoses: [alcohol-use-disorder]
source: bradley-2007
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

In the cited primary-care validation, thresholds of >=3 for women and >=4
for men gave the best combined sensitivity and specificity for alcohol misuse.

**Clinical pearl:** A positive screening result warrants further assessment;
it does not establish a diagnosis by itself.

**Why other answers are wrong:**
- A) A threshold of 2 is below the supported threshold for women.
- C) A threshold of 4 was supported for men, not women, in this validation.
- D) A threshold of 5 exceeds the supported threshold for women.

### Reference

Bradley KA, DeBenedetti AF, Volk RJ, et al. AUDIT-C as a brief screen for
alcohol misuse in primary care. Alcohol Clin Exp Res. 2007;31(7):1208-1217.
doi:10.1111/j.1530-0277.2007.00403.x. https://pubmed.ncbi.nlm.nih.gov/17451397/

```

---

## 2. YAML Frontmatter Fields (Historical)

As of 2026-03-24. The active schema drops `answer` and adds YAML `choices`; its
frontmatter table is current.

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

**Code source of truth:** `lib/content/draft-taxonomy.ts`

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

## 5. Markdown Body Structure (Historical)

This section describes the importer as of 2026-03-24. The active schema
(`content/drafts/questions/SCHEMA.md`) replaces it: choices live in YAML, and a
terminal `### Reference` is required.

### `## Question` (or `## Stem`)

Drafts could use `## Question` or `## Stem`. The importer accepted both and
emitted `## Stem` in generated MDX.

Rules:

- Supports normal Markdown.
- Lead-in should end with `?`.
- Vignettes should preserve clinical order and pass the cover-the-options test.

### `## Choices`

Choices were parsed from bullets under `## Choices`.

Rules:

- 2-5 choices were allowed by the pipeline; the authoring standard was 4.
- Labels had to be `A-E`.
- Accepted delimiters were `)`, `.`, or `:`.
- The correct answer was identified only by the YAML `answer` field.
- Label order was recommended but not code-enforced.

### `## Explanation`

The explanation block could contain three logical parts:

1. General explanation
2. `Why other answers are wrong` per-choice bullets
3. `### Reference`

Parser behavior then:

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

Runtime and UI behavior then:

- If some incorrect choices have explanations and others do not, the UI omits
  only the missing ones and still renders the wrong-answer section for the
  remaining explained choices.

### `### Reference`

`### Reference` was supported, with one parser constraint: it was extracted
into `reference_md` only when it appeared inside `## Explanation` after the
`Why other answers are wrong` subsection. If the wrong-answer heading was
missing, the whole explanation body was treated as general explanation and
`reference_md` stayed `null`.

Authoring convention then:

- Put `### Reference` at the end of `## Explanation`.
- Use AMA-style citation text.
- It was parser-supported but not schema-required; the active schema requires it.

---

## 6. Answer Field and Choice Shuffling (Historical Answer Field)

In the historical format, the `answer` field marked which authored choice was
correct. The active schema marks it in YAML `choices` instead:

```yaml
answer: B
```

Pipeline behavior then:

1. Draft choices were plain text bullets, not `correct: true/false` objects.
2. The importer converted `answer: B` into MDX `choices[].correct`.
3. Seed enforced exactly one correct choice before insert or update, as it still does.
4. Runtime presentation shuffles choices deterministically per user and
   question, so authored letters are not guaranteed to match displayed letters.
   This is still true.

The authoring implication still holds: do not try to pre-randomize choices.

---

## 7. How Tags and References Flowed Through the System (Historical)

As of 2026-03-24. The active schema carries wrong-answer explanations in YAML
`choices` instead of a `Why other answers are wrong` section.

```text
Draft YAML                         Import                    MDX / Seed / UI
──────────                         ──────                    ───────────────
topics: [screening-diagnosis]  ->  display names looked up  -> tags.kind = topic
substances: [alcohol]          ->  from draft-taxonomy.ts    -> tags stored in DB
treatments: [naltrexone]                                    -> practice/history
diagnoses: [aud]                                            -> hide diagnosis

## Explanation                  ->  carried into MDX        -> seed splits into:
  general text                                                  explanation_md
  Why other answers are wrong                                   choice explanations
  ### Reference                                                 reference_md
```

---

## 8. What the System Validated (Historical Rejection Points)

As of 2026-03-24, including the retired `answer` field and heading rules. The
active schema lists today's validations.

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

## 10. Current Commands

The historical examples above are not current importer input. Convert them to
the [active schema](../../../content/drafts/questions/SCHEMA.md) first, then use
its fresh-output staging commands and the content pipeline's reviewed placement
procedure. A dry run validates input without writing; a real import requires an
empty output directory. Seeding needs an explicit `DATABASE_URL`, remote-target
acknowledgment where applicable, and no active release. The placeholder option,
`pnpm db:seed --include-placeholders`, works only on a local test database: the
managed seed and the direct `pnpm db:seed` both refuse it for any non-local
target, whatever `DB_TARGET_ACK` says.

---

## 11. Unsupported or Convention-Only Areas

### Structured Citation Frontmatter

A terminal `### Reference` in the markdown body is required today. Structured YAML fields
such as `citation:` or `doi:` are not. Do not add them until the draft schema
allows them.

### Diagnosis UI Exposure

Diagnosis tags are stored and validated, but current Practice and History
filters intentionally hide them.

### Global Uniqueness

The importer rejects duplicate QIDs within its input batch, and the database
has a unique slug constraint. Neither proves uniqueness across separate private
source repositories; avoiding reuse across them remains an authoring duty.

---

## 12. Current Authoring Checklist

- [ ] Use the active schema's YAML `choices` with one correct answer and an explanation for each wrong answer; omit legacy `answer` and `## Choices`.
- [ ] Each question begins with `---` followed immediately by `qid:`.
- [ ] Use canonical topic/substance/treatment slugs and kebab-case source/diagnosis identifiers.
- [ ] Include `## Question`, `## Explanation` and its required terminal `### Reference`.
- [ ] Keep QIDs unique, write `recall.md` or `vignettes.md`, and pass the importer dry run.
- [ ] Review clinical accuracy and question quality separately from structural acceptance.

---

## 13. Related Documents

- [content-taxonomy.md](../../product/content-taxonomy.md)
- [tag-taxonomy.md](../../architecture/tag-taxonomy.md)
- [content-pipeline.md](../../architecture/content-pipeline.md)
- `lib/content/draft-taxonomy.ts`
- `lib/content/schemas.ts`
- `scripts/draft-question-import.ts`
- `scripts/import-draft-questions.ts`
- `scripts/seed/question-parser.ts`
- `scripts/seed-helpers.ts`
