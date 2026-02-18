# Question Format Spec — Single Source of Truth

> **Status:** Active
> **Last Updated:** 2026-02-18
> **Purpose:** Complete reference for authoring draft questions that will pass cleanly through the import → MDX → seed → database → UI pipeline.
>
> This is the ONE document that defines what a draft question must look like.

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

The AUDIT-C uses sex-specific cutoffs: ≥3 for women and ≥4 for men.
Women achieve higher blood alcohol concentrations than men at equivalent
doses due to lower body water content and reduced gastric ADH activity.

**Clinical pearl:** The AUDIT-C is the most validated brief screening tool
in primary care, taking under 1 minute to administer.

**Why other answers are wrong:**
- A) A score of ≥2 is too sensitive, leading to excessive false positives
  in clinical practice and unnecessary follow-up.
- C) A score of ≥4 is the male cutoff. Using it for women misses
  at-risk female drinkers who metabolize alcohol differently.
- D) A score of ≥5 would miss the majority of at-risk drinkers
  regardless of sex.
```

---

## 2. YAML Frontmatter Fields

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `qid` | string | Globally unique question ID. Format: `{source}-{number}` | `white-2020-001` |
| `type` | enum | `recall` or `vignette` | `recall` |
| `difficulty` | enum | `easy`, `medium`, or `hard` | `medium` |
| `substances` | string[] | At least one canonical substance slug (see §3) | `[alcohol]` |
| `topics` | string[] | At least one canonical topic slug (see §3) | `[screening-diagnosis]` |
| `source` | string | Paper/textbook identifier | `white-2020` |
| `answer` | enum | Correct answer letter: `A`, `B`, `C`, `D`, or `E` | `B` |

### Recommended Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `treatments` | string[] | Canonical treatment slugs when a specific medication is discussed (see §3) | `[naltrexone, acamprosate]` |
| `diagnoses` | string[] | Free-form kebab-case diagnosis slugs | `[alcohol-use-disorder]` |

**When to include `treatments`:** If the question stem, correct answer, or explanation discusses a specific medication by name, tag it. For prescriber's guide questions, always include the medication being discussed.

**When to include `diagnoses`:** When the question tests a specific DSM-5 / ICD diagnosis. Currently stored in the database but not exposed in the practice UI.

### QID Rules

- Must be globally unique across the entire 948+ question bank
- Format: `{source}-{number}` (e.g., `white-2020-001`)
- Number sequentially within each source (001, 002, 003...)
- Never reuse a QID, even if you delete a question
- **Prescriber's guide exception:** QID includes medication name for clarity (e.g., `stahls-naltrexone-001`) because many questions share the same `source: stahls-8e`

---

## 3. Canonical Tag Vocabularies

These are the ONLY valid values. The import script rejects anything else.

**Code source of truth:** `lib/content/draftTaxonomy.ts`

### Topic (13 values)

| Slug | Display Name (auto-populated) |
|------|------|
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
|------|------|
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
|------|------|
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

> **Note:** Treatment "Other" uses `other-treatment` (not `other`) because slugs are globally unique across all tag kinds, and `other` is already used by substances.

### Diagnosis (free-form)

No canonical list. Use kebab-case (e.g., `alcohol-use-disorder`, `opioid-use-disorder`). Display names are auto-generated from the slug by title-casing.

---

## 4. Legacy Slug Migration Map

If your existing drafts use old slugs, here is the mapping. **All old slugs will be rejected by the import script.**

| Old Topic Slug | New Canonical Slug |
|----------------|-------------------|
| `treatment` | `treatment-pharmacotherapy` |
| `pharmacology` | `pharmacology-neuroscience` |
| `epidemiology` | `epidemiology-prevention` |
| `comorbidity` | `co-occurring-disorders` |
| `psychotherapy` | `psychosocial-interventions` |
| `withdrawal` | `withdrawal-management` |
| `diagnosis` | `screening-diagnosis` |
| `screening` | `screening-diagnosis` |
| `toxicology` | `intoxication-toxicology` |
| `neurobiology` | `pharmacology-neuroscience` |
| `intoxication` | `intoxication-toxicology` |

---

## 5. Markdown Body Structure

The body after the YAML frontmatter has three required sections, identified by `##` headings.

### `## Question` (or `## Stem`)

The question stem. For recall questions, this is a direct clinical question. For vignette questions, this is a clinical scenario followed by a lead-in question ending with `?`.

**Rules:**
- Supports full Markdown (bold, italic, lists, tables)
- Lead-in must end with a question mark
- Must pass the "cover-the-options" test — a knowledgeable test-taker should be able to formulate an answer before seeing the choices
- Vignettes follow clinical order: demographics → history → physical → labs → treatment → question

### `## Choices`

4-5 answer options as a bullet list. Each bullet follows the format `- X) Choice text` where X is A-E.

```markdown
## Choices

- A) First choice text
- B) Second choice text
- C) Third choice text
- D) Fourth choice text
```

**Rules:**
- Labels must be uppercase A-E, sequential
- The correct answer is specified in the YAML `answer` field, NOT marked in the choices
- Standard is 4 choices (the system supports 2-5)
- All choices must be plausible and homogeneous (same category of thing)
- The correct answer must not be longer than distractors (length cue)
- No "all of the above" or "none of the above"

### `## Explanation`

Two parts: a general explanation, then per-choice explanations.

```markdown
## Explanation

General explanation of the correct answer. Explain the underlying
concept, mechanism, or clinical reasoning. Include relevant context
that helps the learner understand WHY this is correct.

**Clinical pearl:** A practical takeaway for clinical practice.

**Why other answers are wrong:**
- A) Why choice A is wrong — explain the misconception or error
  in reasoning. Multi-line explanations are fine; indent continuation
  lines.
- C) Why choice C is wrong — teach something useful, don't just
  say "this is incorrect."
- D) Why choice D is wrong — each wrong-answer explanation should
  correct a common misconception.
```

**How this is parsed by the system:**

The seed script splits the explanation into two parts at the `**Why other answers are wrong:**` heading:

1. **General explanation** — everything ABOVE that heading. Stored in `questions.explanation_md`. Displayed to all users after answering.

2. **Per-choice explanations** — each `- X)` bullet below the heading is parsed into a separate explanation keyed by choice label. Stored in `choices.explanation_md`. Displayed next to the specific wrong choice in the feedback UI.

**Important:**
- The heading must be exactly `**Why other answers are wrong:**` (bold, with or without colon)
- Each bullet must start with `- X)` where X matches a choice label (A-E)
- You do NOT need to include the correct answer in the per-choice section (it's already covered by the general explanation)
- If you omit the "Why other answers are wrong" section entirely, per-choice explanations will be empty — the general explanation still displays
- Multi-line explanations work — indent continuation lines under the bullet

---

## 6. How the Answer Field Works

The `answer` field in YAML specifies which choice letter is correct:

```yaml
answer: B
```

**In the draft:** Choices are NOT marked correct/incorrect — they're all just `- X) text`. The `answer` field is the sole indicator.

**During import (`pnpm content:import:drafts`):** The import script maps `answer: B` to `correct: true` on the matching choice object in the output MDX:

```yaml
# Output MDX (generated, do not hand-edit)
choices:
  - label: A
    text: "First choice"
    correct: false
  - label: B
    text: "Correct choice"
    correct: true     # ← derived from answer: B
  - label: C
    text: "Third choice"
    correct: false
```

**In the database:** Each choice row has `is_correct: boolean`. Exactly one choice per question is `true`.

**In the UI:** Choices are shuffled per-user using a deterministic seed (`userId + questionId`). The user sees different letter labels than the authored labels, but the correct choice is always the same.

---

## 7. Choice Shuffling (What Authors Need to Know)

**You do NOT need to randomize answers.** Always put the correct answer at whichever letter the `answer` field specifies. The system handles randomization:

1. Choices are stored in the database in canonical order (A=1, B=2, C=3, D=4)
2. At display time, choices are shuffled deterministically per `(userId, questionId)` pair
3. Each user sees a different letter ordering, but the same user always sees the same order for the same question
4. The feedback UI correctly maps explanations to the shuffled positions

**Implication for authoring:** Write choices in whatever order makes sense. Put the correct answer at the letter you specify in `answer`. The system handles the rest.

---

## 8. How Tags Flow Through the System

```text
Draft YAML                    Import Script               MDX Output
─────────────                 ──────────────              ──────────
substances: [alcohol]    →    Looks up display name  →    tags:
topics: [screening-        from draftTaxonomy.ts          - slug: alcohol
  diagnosis]               (you never write display         name: Alcohol
treatments: [naltrexone]     names in drafts)               kind: substance
diagnoses: [aud]                                          - slug: screening-diagnosis
                                                            name: Screening & Diagnosis
                                                            kind: topic
                                                          - slug: naltrexone
                                                            name: Naltrexone
                                                            kind: treatment
                                                          - slug: aud
                                                            name: Aud
                                                            kind: diagnosis

MDX Output                    Seed Script                 Database
──────────                    ───────────                 ────────
tags:                    →    Validates against       →   tags table:
  - slug: alcohol              canonical lists             id, slug, name, kind
    name: Alcohol              Rejects non-canonical
    kind: substance            Requires ≥1 topic       question_tags table:
  ...                          Requires ≥1 substance     questionId, tagId (junction)

Database                      UI
────────                      ──
tags table              →     Practice page filter pills:
  kind=topic                    Topic: [Screening & Diagnosis] [Pharmacology...]
  kind=substance                Substance: [Alcohol] [Opioids] ...
  kind=treatment                Treatment: [Naltrexone] [Acamprosate] ...
  kind=diagnosis                (diagnosis: stored but NOT shown in UI)
```

---

## 9. What the System Validates (Rejection Points)

Your draft will be **rejected** if any of these fail:

| Validation | Where | Error |
|-----------|-------|-------|
| `topics` contains non-canonical slug | Import script (Zod) | `Invalid enum value` |
| `substances` contains non-canonical slug | Import script (Zod) | `Invalid enum value` |
| `treatments` contains non-canonical slug | Import script (Zod) | `Invalid enum value` |
| Missing `topics` or empty array | Import script (Zod) | `Array must contain at least 1 element` |
| Missing `substances` or empty array | Import script (Zod) | `Array must contain at least 1 element` |
| `qid` missing or empty | Import script (Zod) | `String must contain at least 1 character` |
| `answer` not A-E | Import script (Zod) | `Invalid enum value` |
| `type` not recall/vignette | Import script (Zod) | `Invalid enum value` |
| Tag with `kind: domain` | Seed script | `domain tag not allowed` |
| Duplicate tag slugs in one question | Seed script (Zod) | `tag slugs must be unique` |

---

## 10. What's Currently Missing From the System

### Citations / References

**Not yet implemented.** There is no `citation`, `reference`, or `doi` field in the draft schema, MDX schema, or database. When this is added, it should include:

- A structured citation field in draft YAML (e.g., `citation: "White AM, et al. JAMA. 2020;323(2):130-131."`)
- A DOI field (e.g., `doi: "10.1001/jama.2019.20318"`)
- Pipeline support to carry these through import → MDX → seed → database → UI

For now, include citation information in the explanation text if relevant:

```markdown
## Explanation

According to White et al. (JAMA, 2020), the AUDIT-C uses sex-specific
cutoffs...
```

### Diagnosis UI Exposure

Diagnosis tags are stored in the database but intentionally hidden from the practice filter UI. They may be surfaced in a future version.

---

## 11. File Organization

### Multi-question files

Each draft `.md` file can contain multiple questions, separated by `---`:

```markdown
---
qid: source-001
type: recall
...
---

## Question
...

---

---
qid: source-002
type: recall
...
---

## Question
...
```

### Directory structure

```text
content/drafts/questions/
├── article-based-pathway/{chapter}/{paper}/
│   ├── {paper}.md          ← source paper (Markdown conversion)
│   ├── recall.md           ← 6 recall questions
│   └── vignettes.md        ← 6 vignette questions
├── prescribers-guide/{nn}-{medication}/
│   └── recall.md           ← 4 recall questions (no vignettes)
├── cochrane/{review}/
│   ├── recall.md
│   └── vignettes.md
└── ... (other sources follow same pattern)
```

### Import output

`pnpm content:import:drafts` reads from `content/drafts/questions/` and writes one MDX file per question to `content/questions/imported/`:

```text
content/questions/imported/
├── article-based-pathway/{source}/{qid}.mdx
├── prescribers-guide/{source}/{qid}.mdx
└── ...
```

---

## 12. Commands

```bash
# Validate drafts without writing files
pnpm content:import:drafts -- --dry-run

# Import drafts → MDX (as draft status)
pnpm content:import:drafts

# Import drafts → MDX (as published, so questions appear in app)
pnpm content:import:drafts -- --status published

# Seed MDX → database
pnpm db:seed

# Seed without placeholders (production)
SEED_INCLUDE_PLACEHOLDERS=false pnpm db:seed

# Full pipeline: import + seed
pnpm content:import:drafts -- --status published && pnpm db:seed
```

---

## 13. Quick Checklist for Draft Authors

Before submitting questions:

- [ ] Every `qid` is globally unique (`{source}-{number}`)
- [ ] `answer` is in YAML frontmatter (A-E), NOT marked in choices
- [ ] `substances` uses canonical slugs from §3 (array, even for single values)
- [ ] `topics` uses canonical slugs from §3 (NOT old slugs like `pharmacology`)
- [ ] `treatments` included when a specific medication is discussed
- [ ] `## Question`, `## Choices`, `## Explanation` sections all present
- [ ] Lead-in ends with `?` and passes cover-the-options test
- [ ] 4 choices, all plausible, homogeneous, no length cues
- [ ] Explanation has general section + `**Why other answers are wrong:**` with per-choice bullets
- [ ] Per-choice explanations teach concepts, not just "this is incorrect"
- [ ] Clinical pearl included
- [ ] Tests clinical application, NOT study statistics or sample sizes
- [ ] `pnpm content:import:drafts -- --dry-run` passes

---

## Related Documents

- `lib/content/draftTaxonomy.ts` — Code source of truth for canonical tag slugs
- `docs/content/tag-taxonomy-golden-spec.md` — Canonical tag tables with display names
- `docs/content/tag-taxonomy-pipeline.md` — How tags flow through the system
- `docs/practice-engine/content-pipeline.md` — Full pipeline architecture (import, seed, shuffle, render)
- `docs/dev/deployment-procedure.md` — How to deploy and sync databases
- `lib/content/schemas.ts` — Zod validation schemas (MDX format)
- `scripts/draft-question-import.ts` — Import script (draft → MDX conversion)
- `scripts/seed.ts` — Seed script (MDX → database)
- `scripts/seed-helpers.ts` — Per-choice explanation parser
