# Question Generation Instructions

Generate board-style questions for Addiction Psychiatry certification (NTX University).

## Before Starting

**Read these files in order:**

1. `META.MD` - Part 2 has **full quality standards** (NBME rules, technical flaws, examples)
2. `SCHEMA.md` - Format, tags, vocabularies
3. `QUESTION-FORMAT-SPEC.md` - Complete pipeline spec (how fields map through the system)
4. `PLAN.md` - Targets, progress tracker

Use `SCHEMA.md` and `QUESTION-FORMAT-SPEC.md` as the source of truth for formatting/validation. Use `META.MD` Part 2 for quality principles only.

---

## Per Paper

Generate **12 questions**: 6 recall + 6 vignette

Difficulty per file: 2 easy, 2 medium, 2 hard

| File | Questions | Easy | Medium | Hard |
|------|-----------|------|--------|------|
| recall.md | 6 | 2 | 2 | 2 |
| vignettes.md | 6 | 2 | 2 | 2 |
| **Total** | **12** | **4** | **4** | **4** |

---

## Special Cases

- `content/drafts/questions/prescribers-guide/`: 4 recall questions per medication (no vignettes). See `SCHEMA.md` for details.
- `content/drafts/questions/article-based-pathway/09-therapy/2024-cooperman-more-trial-correction/`: correction notice folder (no questions).

---

## Critical Rules

1. `answer: B` in frontmatter (NOT `*` in choices)
2. `substances: [alcohol]` and `topics: [screening-diagnosis]` (arrays with brackets)
3. `qid: {source}-{number}` format (e.g., `white-2020-001`)
4. **Test clinical concepts, NOT statistics** (see META.MD Part 2 for full list)
5. **Cover-the-options rule**: Can you answer without seeing the choices?
6. **No technical flaws**: Word repeats, convergence, length cues, grammatical cues
7. **No domain tags** in draft frontmatter (taxonomy is topic/substance/treatment/diagnosis)
8. **Frontmatter is strict** — unknown YAML keys are rejected by the import script
9. **Include `treatments`** when a specific medication is discussed by name

---

## Workflow

```
1. Read: content/drafts/questions/[chapter]/[paper]/[paper].md
2. Identify 6-12 clinically relevant concepts (NOT statistics)
3. For each concept, ask: "What would a physician need to DO with this?"
4. Write 6 recall questions (2 easy, 2 medium, 2 hard)
5. Save: content/drafts/questions/[chapter]/[paper]/recall.md
6. Write 6 vignette questions (2 easy, 2 medium, 2 hard)
7. Save: content/drafts/questions/[chapter]/[paper]/vignettes.md
8. Apply quality checklist from META.MD Part 2
9. Update PLAN.md checkboxes
```

---

## Quick Quality Check

Before saving, verify:

- [ ] Tests APPLICATION, not recall of statistics
- [ ] Lead-in ends with `?` and passes cover-the-options test
- [ ] All 4 options are homogeneous and plausible
- [ ] Correct answer is NOT longer than distractors
- [ ] No word repeats between stem and correct answer
- [ ] Each wrong answer explanation teaches a concept
- [ ] Clinical pearl included
- [ ] `treatments` tag included if a medication is mentioned
- [ ] Optional: run `pnpm content:import:drafts -- --dry-run` from repo root for structural validation

**For the full checklist and technical flaw taxonomy, see META.MD Part 2.**

---

## Vocabularies

**Substances:** alcohol, cannabis, cocaine, hallucinogens, inhalants, opioids, polysubstance, sedatives, stimulants, tobacco, other

**Topics:** screening-diagnosis, epidemiology-prevention, pharmacology-neuroscience, intoxication-toxicology, withdrawal-management, treatment-pharmacotherapy, psychosocial-interventions, co-occurring-disorders, medical-complications, harm-reduction, ethics-legal, special-populations, general

**Treatments:** acamprosate, buprenorphine, bupropion, disulfiram, gabapentin, methadone, naloxone, naltrexone, nrt, topiramate, varenicline, other-treatment

> Old slugs like `pharmacology`, `treatment`, `withdrawal` are rejected. See the migration map in `QUESTION-FORMAT-SPEC.md` §4.
