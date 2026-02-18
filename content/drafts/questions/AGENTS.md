# Question Generation Instructions (For Agents)

Generate board-style questions for Addiction Psychiatry certification (NTX University).

**This file is for agent invocations. For full quality standards, see the skill file.**

---

## Required Reading (In Order)

1. **`/.claude/skills/generate-questions/SKILL.md`** - Full NBME quality standards, technical flaw taxonomy, examples
2. **`SCHEMA.md`** - YAML format, tags, vocabularies
3. **`PLAN.md`** - Targets, progress tracker

---

## Quick Reference

### Per Paper Targets

| File | Questions | Easy | Medium | Hard |
|------|-----------|------|--------|------|
| recall.md | 6 | 2 | 2 | 2 |
| vignettes.md | 6 | 2 | 2 | 2 |
| **Total** | **12** | **4** | **4** | **4** |

### Critical Rules

1. `answer: B` in frontmatter (NOT `*` in choices)
2. `substances: [alcohol]` and `topics: [screening-diagnosis]` (arrays with brackets)
3. `qid: {source}-{number}` format (e.g., `white-2020-001`)
4. **Test clinical concepts, NOT statistics**
5. **Cover-the-options rule**: Can you answer without seeing the choices?
6. **Check for technical flaws** (see SKILL.md for full taxonomy)
7. **No domain tags** in draft frontmatter (taxonomy is topic/substance/treatment/diagnosis)

### Workflow

```
1. Read: questions/[chapter]/[paper]/[paper].md
2. Identify 6-12 clinically relevant concepts (NOT statistics)
3. Write 6 recall questions (2 easy, 2 medium, 2 hard) -> recall.md
4. Write 6 vignette questions (2 easy, 2 medium, 2 hard) -> vignettes.md
5. Apply quality checklist from SKILL.md
6. Update PLAN.md checkboxes
```

---

## What to Test vs What to Avoid

### ALWAYS Test (Clinical Application)
- Clinical indications, contraindications
- Mechanism of action
- Patient counseling
- Diagnostic recognition
- Treatment sequencing
- Key study findings and their clinical implications

### NEVER Test (Trivia)
- Sample sizes, participant counts
- Number of studies in a review
- Exact percentages from studies
- P-values, confidence intervals
- Heterogeneity values (I-squared)
- Publication dates

**For the complete list and examples, see SKILL.md.**

---

## Vocabularies

**Substances:** alcohol, cannabis, cocaine, hallucinogens, inhalants, opioids, polysubstance, sedatives, stimulants, tobacco, other

**Topics:** screening-diagnosis, epidemiology-prevention, pharmacology-neuroscience, intoxication-toxicology, withdrawal-management, treatment-pharmacotherapy, psychosocial-interventions, co-occurring-disorders, medical-complications, harm-reduction, ethics-legal, special-populations, general

**Treatments:** acamprosate, buprenorphine, bupropion, disulfiram, gabapentin, methadone, naloxone, naltrexone, nrt, topiramate, varenicline, other-treatment
