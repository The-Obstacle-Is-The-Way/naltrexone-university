# Question Format Spec — Single Source of Truth

> **Status:** Active
> **Last Updated:** 2026-03-24
> **Purpose:** Complete reference for authoring draft questions that will pass cleanly through the import → MDX → seed → database → UI pipeline.
>
> This is the primary pipeline reference; use it together with `SCHEMA.md`.

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

### Reference

White AM, Castle IP, Hingson RW, Powell PA. Using death certificates to explore changes in alcohol-related mortality in the United States, 1999 to 2017. Alcohol Clin Exp Res. 2020;44(1):178-187.
```

---

## 2. YAML Frontmatter Fields

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `qid` | string | Non-empty, kebab-case string. Used as the output MDX `slug` | `white-2020-001` |
| `type` | enum | `recall` or `vignette` | `recall` |
| `difficulty` | enum | `easy`, `medium`, or `hard` | `medium` |
| `substances` | string[] | At least one canonical substance slug (see §3) | `[alcohol]` |
| `topics` | string[] | At least one canonical topic slug (see §3) | `[screening-diagnosis]` |
| `source` | string | Non-empty source identifier | `white-2020` |
| `answer` | enum | Correct answer letter: `A`, `B`, `C`, `D`, or `E` | `B` |

### Recommended Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `treatments` | string[] | Canonical treatment slugs when a specific medication is discussed (see §3) | `[naltrexone, acamprosate]` |
| `diagnoses` | string[] | Free-form kebab-case diagnosis slugs | `[alcohol-use-disorder]` |

**When to include `treatments`:** If the question stem, correct answer, or explanation discusses a specific medication by name, tag it. For prescriber's guide questions, always include the medication being discussed.

**When to include `diagnoses`:** When the question tests a specific DSM-5 / ICD diagnosis. Currently stored in the database but not exposed in the practice UI.

### Importer enforcement details

- Frontmatter is strict: unknown YAML keys are rejected (`DraftFrontmatterSchema.strict()`).
- `treatments` and `diagnoses` default to `[]` when omitted.
- `qid` and `source` are validated as non-empty strings at draft parse time.
- During draft → MDX conversion, `qid` is re-validated by `QuestionFrontmatterSchema.slug` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), so non-kebab-case QIDs fail.

### QID Policy (authoring convention)

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

The body after the YAML frontmatter has three required sections, identified by `##` headings.

### `## Question` (or `## Stem`)

The question stem. For recall questions, this is a direct clinical question. For vignette questions, this is a clinical scenario followed by a lead-in question ending with `?`.

**Rules:**
- Supports full Markdown (bold, italic, lists, tables)
- Lead-in must end with a question mark
- Must pass the "cover-the-options" test — a knowledgeable test-taker should be able to formulate an answer before seeing the choices
- Vignettes follow clinical order: demographics → history → physical → labs → treatment → question

### `## Choices`

2-5 answer options as a bullet list. Standard is 4; the pipeline allows 2-5.

Draft parser bullet pattern:
- Must start with `-`
- Label must be uppercase `A`-`E`
- Delimiter can be `)`, `.`, or `:`

```markdown
## Choices

- A) First choice text
- B) Second choice text
- C) Third choice text
- D) Fourth choice text
```

**Rules:**
- Labels must be uppercase A-E
- The correct answer is specified in the YAML `answer` field, NOT marked in the choices
- Import parse requires at least 2 parsed choices; MDX schema enforces max 5 choices
- Label sequence is recommended, not strictly enforced
- All choices must be plausible and homogeneous (same category of thing)
- The correct answer must not be longer than distractors (length cue)
- No "all of the above" or "none of the above"

### `## Explanation`

Three parts in strict order: general explanation, then clinical pearl, then per-choice explanations.

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

### Reference

Citation in AMA format.
```

> **⚠️ CRITICAL ORDERING RULE — Read This**
>
> The `**Clinical pearl:**` paragraph **MUST appear BEFORE** the `**Why other answers are wrong:**` heading. The parser treats everything after the wrong-answer heading as part of the per-choice section until it hits a markdown heading (`###`). If the clinical pearl comes after the bullets, it gets silently appended to the last choice's wrong-answer explanation — corrupting the data the learner sees.
>
> **This is not theoretical.** 23 imported questions are currently corrupted by this exact pattern. See [DEBT-338](../../docs/debt/debt-338-seed-parser-silent-wrong-answer-section-corruption.md) and [NOTES.md](./NOTES.md) for the full affected file list.

**Correct ordering:**
```markdown
General explanation paragraph.

**Clinical pearl:** Practical takeaway.     ← BEFORE wrong-answer section

**Why other answers are wrong:**
- A) Reason A is wrong.
- C) Reason C is wrong.

### Reference
```

**WRONG ordering (causes data corruption):**
```markdown
**Why other answers are wrong:**
- A) Reason A is wrong.
- C) Reason C is wrong.

**Clinical pearl:** This gets appended to C's explanation!  ← CORRUPTED
```

**Wrong-answer explanation format rules:**
- **Do NOT prefix the explanation with any form of the choice text** (neither the full text nor a shortened label). The UI already displays the full choice text above the explanation. Any prefix, even a 2-3 word summary, creates a redundant, hard-to-read block. Start directly with the reasoning.
- **Bad (full text):** `- A) Administer an additional dose of extended-release naltrexone 1 week before surgery: Administering another injection would extend the duration...`
- **Bad (short label):** `- A) Suspend participation for one week: Suspension contradicts the CM principle...`
- **Good:** `- A) Administering another injection would extend the duration of opioid receptor blockade and make postoperative opioid analgesia ineffective.`
- **Good:** `- A) Suspension contradicts the CM principle of maintaining continuous engagement and providing immediate reinforcement opportunities.`
- **One bullet per choice.** Do NOT combine multiple choices into a single bullet (e.g., `- A, B, D) They are all wrong because...`). The parser cannot match combined labels — the entire line will be silently dropped. Each wrong choice needs its own bullet.
- **Keep bullet bodies to plain paragraph text plus inline emphasis only.** Do NOT put nested lists, numbered sublists, blockquotes, code blocks, or heading-style lines inside a wrong-answer bullet. The current parser is line-based: it flattens indentation-sensitive markdown and treats heading-style lines as section breaks.
- Every wrong answer should have an explanation. Missing or blank wrong-answer explanations are excluded from the UI, and the `Why other answers are wrong` section still renders for the choices that have content.

**How this is parsed by the system:**

The seed script splits the explanation into parts at the `**Why other answers are wrong:**` heading:

1. **General explanation** — everything ABOVE that heading (including `**Clinical pearl:**`). Stored in `questions.explanation_md`. Displayed to all users after answering.

2. **Per-choice explanations** — each `- X)` bullet below the heading is parsed into a separate explanation keyed by choice label. Stored in `choices.explanation_md`. Displayed next to the specific wrong choice in the feedback UI.

3. **Reference** — everything after the `### Reference` heading. Stored in `questions.reference_md`.

**Parser rules (what the seed script does):**
- Heading match is case-insensitive; bold/underline markers are optional; trailing `:` is optional
- Per-choice bullets can start with `-`, `*`, or `+`
- Bullet label can use `A)` / `A.` / `A:` (and lowercase is normalized to uppercase)
- Only labels A–E are recognized. Any other label is invisible to the parser.
- Parsing stops at the next markdown heading (`#`..`######`)
- Numbered lists are NOT recognized as per-choice entries; use `- A)` / `- B)` bullets only
- **Any non-bullet line after the heading is either silently dropped (if no bullet is open yet) or silently appended to the current bullet's body.** This is the source of the clinical pearl corruption bug — see DEBT-338.
- Because continuation lines are `trimStart()`ed, indentation-sensitive nested markdown is not preserved inside choice explanations
- You do NOT need to include the correct answer in the per-choice section (it's already covered by the general explanation)
- If you omit the "Why other answers are wrong" section entirely, per-choice explanations will be empty — the general explanation still displays
- Per-choice labels must exist in the question's choices, or seed fails

### `### Reference`

AMA-format citation for the source paper. Placed at the very end of the `## Explanation` section, after all per-choice bullets.

```markdown
### Reference

Sees KL, Delucchi KL, Masson C, et al. Methadone maintenance vs 180-day psychosocially enriched detoxification for treatment of opioid dependence. JAMA. 2000;283(10):1303-1310.
```

**Format:** Abbreviated AMA (American Medical Association) style:
- Up to 3 authors listed, then "et al." for additional authors
- `AuthorLast Initials, AuthorLast Initials, et al. Article title. Journal Abbreviation. Year;Vol(Issue):Pages.`
- Use standard NLM journal abbreviations
- No DOI required in-line (DOI support is planned as a future YAML field)

**Rules:**
- Every question MUST have a `### Reference` section
- The `### Reference` heading stops per-choice bullet parsing (the seed script stops at markdown headings)
- All questions from the same `source` will have the same citation text
- For prescriber's guide questions, cite the textbook edition (e.g., `Stahl SM. Stahl's Essential Psychopharmacology: Prescriber's Guide. 8th ed. Cambridge University Press; 2024.`)

**How this is parsed by the system:**

The seed script extracts `### Reference` content into `questions.reference_md`.
In the UI, it renders at the very bottom of the explanation block, below the
per-choice cards.

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

**In the database:** Each choice row has `is_correct: boolean`. The pipeline enforces exactly one `true` before insert/update.

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
| Unknown draft frontmatter key | Import script (Zod `.strict()`) | `Unrecognized key(s) in object` |
| `topics` contains non-canonical slug | Import script (Zod) | `Invalid enum value` |
| `substances` contains non-canonical slug | Import script (Zod) | `Invalid enum value` |
| `treatments` contains non-canonical slug | Import script (Zod) | `Invalid enum value` |
| Missing `topics` or empty array | Import script (Zod) | `Array must contain at least 1 element` |
| Missing `substances` or empty array | Import script (Zod) | `Array must contain at least 1 element` |
| `qid` missing or empty | Import script (Zod) | `String must contain at least 1 character` |
| `qid` not kebab-case (fails MDX `slug` regex) | MDX schema (`QuestionFrontmatterSchema`) | `Invalid` (regex failure on `slug`) |
| `source` missing or empty | Import script (Zod) | `String must contain at least 1 character` |
| `answer` not A-E | Import script (Zod) | `Invalid enum value` |
| `type` not recall/vignette | Import script (Zod) | `Invalid enum value` |
| `difficulty` not easy/medium/hard | Import script (Zod) | `Invalid enum value` |
| `diagnoses` contains non-kebab-case slug | Import script (Zod) | `tag slugs must be kebab-case` |
| Missing required headings / bad heading order | Import parser | `Missing required heading` / `Invalid heading order` |
| Choices parse fewer than 2 options | Import parser | `Choices parsing failed: expected at least 2 choices` |
| No matching choice for `answer` (0 or >1 correct after conversion) | MDX schema (`QuestionFrontmatterSchema`) | `choices must contain exactly 1 correct=true` |
| Duplicate choice labels | MDX schema (`QuestionFrontmatterSchema`) | `choice labels must be unique` |
| More than 5 choices | MDX schema (`QuestionFrontmatterSchema`) | `Array must contain at most 5 element(s)` |
| Duplicate tag slugs in one question | MDX schema (`QuestionFrontmatterSchema`) | `tag slugs must be unique` |
| Missing topic or substance tags in MDX | MDX schema + seed validation | `at least one topic tag is required` / `at least one substance tag is required` |
| Tag with `kind: domain` in MDX | Seed script | `Question \"...\" has domain tag \"...\" which is not allowed` |
| Per-choice explanation references label not in choices | Seed script | `Explanation references choice label` |

---

## 10. Future Extensions and Remaining Gaps

### Citations / References

**Content format: implemented. Pipeline support: implemented.**

Every question now includes a `### Reference` section at the end of the `## Explanation` block with an AMA-format citation (see section 5 for full spec). This is the content source of truth.

`### Reference` is parsed into `questions.reference_md` and rendered in the UI
today. The remaining possible enhancement here is structured citation metadata,
for example future `citation:` or `doi:` YAML fields, if the authoring workflow
ever needs machine-readable references in addition to the canonical markdown
section.

**Do NOT add `citation:` or `doi:` to draft YAML yet** -- `DraftFrontmatterSchema.strict()` will reject unknown keys.

### Diagnosis UI Exposure

Diagnosis tags are stored in the database but intentionally hidden from the practice filter UI. They may be surfaced in a future version.

---

## 11. File Organization

### Multi-question files

Each draft `.md` file can contain multiple questions, separated by `---`:

**Important splitter rule:** each question block must start with `---` followed immediately by `qid:` on the next line. (`splitDraftQuestionsFile()` looks for `^---\nqid:`.)

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

Notes:
- Extra separator lines between blocks are tolerated, but not required.
- If `qid` is not the first frontmatter key in a block, that block will not be discovered by the splitter.

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

`pnpm content:import:drafts` reads from `content/drafts/questions/`, scans only `**/recall.md` and `**/vignettes.md`, and writes one MDX file per question to `content/questions/imported/`:

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

# Include placeholders (debug/template seeding)
SEED_INCLUDE_PLACEHOLDERS=true pnpm db:seed

# Full pipeline: import + seed
pnpm content:import:drafts -- --status published && pnpm db:seed
```

---

## 13. Quick Checklist for Draft Authors

Before submitting questions:

- [ ] Every `qid` is globally unique (`{source}-{number}`)
- [ ] In multi-question files, each block starts with `---` then `qid:` as the first key
- [ ] `answer` is in YAML frontmatter (A-E), NOT marked in choices
- [ ] `substances` uses canonical slugs from §3 (array, even for single values)
- [ ] `topics` uses canonical slugs from §3 (NOT old slugs like `pharmacology`)
- [ ] `treatments` included when a specific medication is discussed
- [ ] File is named `recall.md` or `vignettes.md` so importer will pick it up
- [ ] `## Question`, `## Choices`, `## Explanation` sections all present
- [ ] Lead-in ends with `?` and passes cover-the-options test
- [ ] 4 choices, all plausible, homogeneous, no length cues
- [ ] Explanation has general section + `**Why other answers are wrong:**` with per-choice bullets
- [ ] Per-choice explanations teach concepts, not just "this is incorrect"
- [ ] Per-choice explanations do NOT prefix with any form of the choice text (no full text, no short labels before a colon; start directly with reasoning)
- [ ] Clinical pearl appears before `**Why other answers are wrong:**`
- [ ] Exactly one bullet per wrong choice (no combined labels like `- A, B, D)`)
- [ ] Nothing appears between the last wrong-answer bullet and `### Reference` except blank lines
- [ ] Wrong-answer bullets use plain paragraph text only (no nested lists, numbered sublists, blockquotes, code blocks, or heading-style lines)
- [ ] Every wrong answer has an explanation (missing or blank wrong-answer explanations are excluded; the section still renders for choices with content)
- [ ] Clinical pearl included
- [ ] `### Reference` section at end of explanation with AMA-format citation
- [ ] Tests clinical application, NOT study statistics or sample sizes
- [ ] `pnpm content:import:drafts -- --dry-run` passes

---

## Related Documents

- `SCHEMA.md` — Author-facing schema and workflow rules
- `TAG-TAXONOMY.md` — Canonical tag tables + migration maps
- `AGENTS.md` — Agent instructions for this directory
- `CLAUDE.md` — Quick-start generation instructions
- `META.MD` — Inventory and quality standards (Part 2)
