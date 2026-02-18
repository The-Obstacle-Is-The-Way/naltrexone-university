# NTX University Question Bank Schema

**Purpose:** Board-style questions for Addiction Psychiatry certification exam prep.

**Version:** 1.8
**Last Updated:** February 18, 2026

**Related Files:**
- `META.MD` - Full NBME quality standards, technical flaw taxonomy (Part 2)
- `QUESTION-FORMAT-SPEC.md` - Complete pipeline spec (how fields map through import → MDX → seed → database → UI)
- `TAG-TAXONOMY.md` - Canonical tag tables with display names, migration maps, content gaps
- `CLAUDE.md` - Quick-start generation instructions
- `AGENTS.md` - Agent-specific instructions
- `PLAN.md` - Progress tracker
- `NOTES.md` - Audit findings

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.8 | 2026-02-18 | Synced with QUESTION-FORMAT-SPEC.md and runtime importer behavior (2-5 choices allowed, validation commands updated, legacy skill-file references removed) |
| 1.7 | 2026-02-18 | Fixed broken legacy skill-file reference, added QUESTION-FORMAT-SPEC.md and TAG-TAXONOMY.md cross-references, added strict frontmatter note, treatments guidance |
| 1.6 | 2026-02-18 | Canonical taxonomy alignment (Topic/Substance/Treatment), removed legacy domain guidance, added treatment canonical list |
| 1.5 | 2026-02-04 | Documented source-only full-conversion folder and added validation script reference |
| 1.4 | 2026-02-04 | Documented special-case sections (Stahl's medications), clarified QID rules for multi-entry sources |
| 1.2 | 2026-02-01 | Standardized to 6 recall + 6 vignette per paper, equal difficulty distribution (4/4/4) |
| 1.1 | 2026-02-01 | Changed `id` to `qid` (globally unique), moved answer to frontmatter, made `topics` and `substances` arrays |
| 1.0 | 2026-02-01 | Initial schema |

---

## Question Targets

| Metric | Value |
|--------|-------|
| Questions per paper | 12 |
| Recall questions | 6 (in recall.md) |
| Vignette questions | 6 (in vignettes.md) |
| Easy | 4 (2 recall, 2 vignette) |
| Medium | 4 (2 recall, 2 vignette) |
| Hard | 4 (2 recall, 2 vignette) |
| Total (ABPN article-based pathway, 40 papers) | 480 |

**Note:** Other sections in this repo (ASAM guidelines, Cochrane reviews, personal papers, therapy guidance, landmark studies) also follow the 12-question target by default unless noted in the "Special Cases" section below.

---

## Special Cases

### Prescriber's Guide Medications (Recall Only)

Folder: `content/drafts/questions/prescribers-guide/`

- Each medication has **4 recall questions** (no `vignettes.md`).
- Medication folders are named with a numeric prefix (for example `01-acamprosate`, `23-naltrexone`).
- QID format: `qid: stahls-[medication]-[number]` (example: `stahls-naltrexone-001`)
- `source` tag reflects the textbook edition (for example: `stahls-8e` or `stahls-7e`), so for medications the `qid` prefix does not necessarily match the `source` value.

### Prescriber's Guide Full Conversion (No Questions)

Paths:
- `content/drafts/questions/prescribers-guide/stahls-prescribers-guide.md`
- `content/drafts/questions/prescribers-guide/stahls-chunked/`

This content contains the full-book Markdown conversion for reference. It intentionally has no `recall.md` or `vignettes.md`. The medication question sets live under `content/drafts/questions/prescribers-guide/`.

### Correction Notice (No Questions)

Folder: `content/drafts/questions/article-based-pathway/09-therapy/2024-cooperman-more-trial-correction/`

This folder is a correction notice source-only folder and intentionally has no `recall.md` or `vignettes.md`.

---

## Question File Format

Each paper gets two question files in its folder:

```
content/drafts/questions/
  └── 01-screening-evaluation-prevention/
      └── 2020-white-gender-differences-alcohol-harms/
          ├── 2020-white-gender-differences-alcohol-harms.pdf
          ├── 2020-white-gender-differences-alcohol-harms.md
          ├── recall.md       <-- single-fact questions (6 per paper)
          └── vignettes.md    <-- clinical scenarios (6 per paper)
```

---

## Question Structure

```markdown
---
qid: white-2020-001
type: recall
difficulty: medium
substances: [alcohol]
topics: [screening-diagnosis]
source: white-2020
answer: B
---

## Question

What is the recommended AUDIT-C cutoff score for identifying unhealthy alcohol use in women?

## Choices

- A) 2 or more points
- B) 3 or more points
- C) 4 or more points
- D) 5 or more points

## Explanation

The AUDIT-C uses sex-specific cutoffs: 3 or more for women and 4 or more for men. This reflects differences in alcohol metabolism and risk thresholds. Women achieve higher blood alcohol concentrations than men at equivalent doses due to lower body water content and reduced gastric alcohol dehydrogenase activity.

**Why other answers are wrong:**
- A) Too sensitive, would over-identify
- C) This is the male cutoff, not female
- D) Would miss at-risk drinkers

---
```

---

## Required Tags

Every question MUST have these tags in the YAML frontmatter:

| Tag | Values | Description |
|-----|--------|-------------|
| `qid` | `{source}-{number}` | **Globally unique ID** (e.g., `white-2020-001`, `jones-2023-005`) |
| `type` | `recall`, `vignette` | Question format (see below) |
| `difficulty` | `easy`, `medium`, `hard` | Cognitive load required |
| `substances` | Array from list below | Substances tested (can be multiple) |
| `topics` | Array from canonical list below | Canonical clinical topics (can be multiple) |
| `source` | paper identifier | e.g., `white-2020`, `jones-2023` |
| `answer` | `A`, `B`, `C`, `D`, or `E` | The correct answer letter |

**Strict frontmatter:** The import script uses `DraftFrontmatterSchema.strict()` — any unknown YAML key will be rejected. Only include fields from this table.

Recommended tags (include when relevant):

| Tag | Values | Description |
|-----|--------|-------------|
| `treatments` | Array from canonical list below | Specific treatment tags (e.g., `buprenorphine`, `naltrexone`). **Include whenever a medication is discussed by name.** |
| `diagnoses` | Array of kebab-case slugs | Specific diagnoses (e.g., `opioid-use-disorder`). Stored in DB but not shown in UI. |

### QID Format

The `qid` must be globally unique across the entire question bank:

```
{source}-{number}
```

Examples:
- `white-2020-001` (first question from White 2020 paper)
- `white-2020-002` (second question)
- `jones-2023-001` (first question from Jones 2023 paper)

**Rules:**
- Default: Use the same `source` identifier as the `source` tag, and number sequentially within each source
- Number sequentially within each paper (001, 002, 003...)
- Never reuse a qid, even if you delete a question

**Enforcement note:** Import enforces non-empty `qid`/`source`, and conversion to MDX additionally enforces kebab-case on `qid` (because `qid` becomes MDX `slug`). Global uniqueness and `{source}-{number}` format remain authoring policy and must be maintained by content authors.

**Exception (multi-entry sources):**
For sources like textbooks where many independent question sets live under a single `source` identifier, the `qid` may include an additional sub-identifier (for example a medication name) to preserve global uniqueness and keep IDs meaningful.

### Type Values

| Type | Description | Example |
|------|-------------|---------|
| `recall` | Single-step fact retrieval | "Which medication is first-line for..." |
| `vignette` | Clinical scenario requiring multi-step reasoning | "A 45-year-old man presents with..." |

### Substance Values

Use arrays. A question can test multiple substances.

- `alcohol`
- `cannabis`
- `cocaine`
- `hallucinogens`
- `inhalants`
- `opioids`
- `polysubstance`
- `sedatives`
- `stimulants`
- `tobacco`
- `other`

Examples:
- `substances: [alcohol]` - single substance
- `substances: [opioids, stimulants]` - polysubstance question
- `substances: [polysubstance]` - general polysubstance use patterns

### Topic Values

Use arrays. A question can span multiple topics. Use only these canonical slugs:

- `screening-diagnosis`
- `epidemiology-prevention`
- `pharmacology-neuroscience`
- `intoxication-toxicology`
- `withdrawal-management`
- `treatment-pharmacotherapy`
- `psychosocial-interventions`
- `co-occurring-disorders`
- `medical-complications`
- `harm-reduction`
- `ethics-legal`
- `special-populations`
- `general`

Examples:
- `topics: [screening-diagnosis]` - single topic
- `topics: [withdrawal-management, treatment-pharmacotherapy]` - withdrawal management question
- `topics: [special-populations, treatment-pharmacotherapy]` - treating pregnant patients

### Optional: Treatment + Diagnosis Slugs

Use these when you want **specific** medication and diagnosis tags beyond topic-level tagging.

Canonical `treatments` values:
- `acamprosate`
- `buprenorphine`
- `bupropion`
- `disulfiram`
- `gabapentin`
- `methadone`
- `naloxone`
- `naltrexone`
- `nrt`
- `topiramate`
- `varenicline`
- `other-treatment`

`diagnoses` remains free-form kebab-case (for example `opioid-use-disorder`).

Examples:
- `treatments: [buprenorphine, naloxone]`
- `diagnoses: [opioid-use-disorder, alcohol-use-disorder]`

### Difficulty Guidelines

| Level | Criteria | Per File |
|-------|----------|----------|
| `easy` | Common knowledge, single fact, high-yield basics | 2 |
| `medium` | Requires integration of 2-3 concepts | 2 |
| `hard` | Nuanced, rare, or requires complex reasoning | 2 |

---

## Required Sections

Every question MUST include:

1. **Question** - The stem (vignette if applicable) + lead-in question
2. **Choices** - 2-5 options labeled A-E (standard authoring target: 4; correct answer specified in frontmatter)
3. **Explanation** - Why the correct answer is right AND why others are wrong

### NBME-Style Guidelines

Based on [NBME Item-Writing Guide](https://www.nbme.org/educators/item-writing-guide):

- Lead-in should end with a question mark
- Test-taker should be able to answer without seeing options ("cover-the-options" rule)
- All distractors should be plausible and homogeneous
- Vignettes follow order: demographics, history, physical, labs, treatment
- Prefer application of knowledge over isolated recall

**For the complete technical flaw taxonomy (word repeats, convergence, grammatical cues, etc.), see META.MD Part 2.**

---

## Quality Checklist

Before finalizing questions:

- [ ] Each question has all 7 required tags in frontmatter
- [ ] `qid` follows format: `{source}-{number}` (e.g., `white-2020-001`)
- [ ] `answer` is in frontmatter (A, B, C, D, or E)
- [ ] `substances` and `topics` are arrays (use brackets even for single values)
- [ ] Explanation covers correct answer AND why others are wrong
- [ ] Vignettes follow logical clinical order
- [ ] Lead-in is focused (passes cover-the-options test)
- [ ] Distractors are plausible, not obviously wrong
- [ ] No "all of the above" or "none of the above"
- [ ] Statistics/numbers verified against source paper
- [ ] recall.md has 6 questions (2 easy, 2 medium, 2 hard)
- [ ] vignettes.md has 6 questions (2 easy, 2 medium, 2 hard)

---

## Optional Metadata (Not Supported Yet)

These fields are NOT currently supported by the import script (strict mode will reject them). They are design proposals for a future version:

- `evidence:` one of `guideline`, `systematic-review`, `rct`, `observational`, `case-series`, `expert-consensus`
- `certainty:` one of `high`, `moderate`, `low`, `very-low`, `na`
- `citation:` structured citation string (e.g., `"White AM, et al. JAMA. 2020;323(2):130-131."`)
- `doi:` DOI string (e.g., `"10.1001/jama.2019.20318"`)

**Do not include these in drafts** — the strict frontmatter schema will reject them. For now, embed citations in the `## Explanation` section.

## Validation (Recommended)

Repo-wide structural validation (import parser + schema checks):

`pnpm content:import:drafts -- --dry-run`

There is currently no dedicated length-cue validator script in this repo.

---

## Pipeline Deep Dive

For complete details on how draft fields map through the import → MDX → seed → database → UI pipeline, including:
- How `answer: B` becomes `correct: true` on the right choice
- How tag slugs expand to `{slug, name, kind}` objects
- How explanations are parsed into per-choice feedback
- All validation rejection points with error messages

See **`QUESTION-FORMAT-SPEC.md`** in this directory.
