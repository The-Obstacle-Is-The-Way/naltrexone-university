# Question Generation Instructions

Generate board-style questions for Addiction Psychiatry certification (NTX University).

## Before Starting

**Read these files in order:**

1. `/.claude/skills/generate-questions/SKILL.md` - **Full quality standards** (NBME rules, technical flaws, examples)
2. `SCHEMA.md` - Format, tags, vocabularies
3. `PLAN.md` - Targets, progress tracker

The SKILL.md is the authoritative reference for question quality. This file is a quick-start summary.

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

- `questions/prescribers-guide/`: 4 recall questions per medication (no vignettes). See `SCHEMA.md` for details.
- `questions/article-based-pathway/09-therapy/2024-cooperman-more-trial-correction/`: correction notice folder (no questions).

---

## Critical Rules

1. `answer: B` in frontmatter (NOT `*` in choices)
2. `substances: [alcohol]` and `topics: [screening-diagnosis]` (arrays with brackets)
3. `qid: {source}-{number}` format (e.g., `white-2020-001`)
4. **Test clinical concepts, NOT statistics** (see SKILL.md for full list)
5. **Cover-the-options rule**: Can you answer without seeing the choices?
6. **No technical flaws**: Word repeats, convergence, length cues, grammatical cues
7. **No domain tags** in draft frontmatter (taxonomy is topic/substance/treatment/diagnosis)

---

## Workflow

```
1. Read: questions/[chapter]/[paper]/[paper].md
2. Identify 6-12 clinically relevant concepts (NOT statistics)
3. For each concept, ask: "What would a physician need to DO with this?"
4. Write 6 recall questions (2 easy, 2 medium, 2 hard)
5. Save: questions/[chapter]/[paper]/recall.md
6. Write 6 vignette questions (2 easy, 2 medium, 2 hard)
7. Save: questions/[chapter]/[paper]/vignettes.md
8. Apply quality checklist from SKILL.md
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
- [ ] Optional: run `python3 scripts/validate_questions.py --root questions/<paper-folder> --check-length-cues`

**For the full checklist and technical flaw taxonomy, see SKILL.md.**

---

## Vocabularies

**Substances:** alcohol, cannabis, cocaine, hallucinogens, inhalants, opioids, polysubstance, sedatives, stimulants, tobacco, other

**Topics:** screening-diagnosis, epidemiology-prevention, pharmacology-neuroscience, intoxication-toxicology, withdrawal-management, treatment-pharmacotherapy, psychosocial-interventions, co-occurring-disorders, medical-complications, harm-reduction, ethics-legal, special-populations, general

**Treatments:** acamprosate, buprenorphine, bupropion, disulfiram, gabapentin, methadone, naloxone, naltrexone, nrt, topiramate, varenicline, other-treatment
