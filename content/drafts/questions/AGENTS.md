# Question Generation Instructions (For Agents)

Generate board-style questions for Addiction Psychiatry certification (NTX University).

**This file is for agent invocations. For full quality standards, see META.MD Part 2.**

---

## Required Reading (In Order)

1. **`META.MD`** - Part 2 contains full NBME quality standards, technical flaw taxonomy, examples
2. **`SCHEMA.md`** - YAML format, tags, vocabularies
3. **`QUESTION-FORMAT-SPEC.md`** - Complete pipeline spec (how drafts become database questions)
4. **`PLAN.md`** - Targets, progress tracker

Use `SCHEMA.md` and `QUESTION-FORMAT-SPEC.md` as the source of truth for formatting/validation. Use `META.MD` Part 2 for quality principles only.

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
6. **No choice-text prefixes**: Wrong-answer explanations must NOT prefix with any form of the choice text (no full text, no short labels before a colon); start directly with the reasoning
7. **Clinical pearl BEFORE wrong-answer section**: `**Clinical pearl:**` must appear ABOVE `**Why other answers are wrong:**` — placing it after the bullets corrupts the data (DEBT-338)
8. **One bullet per choice**: No combined labels like `- A, B, D)` — the parser drops them silently. Each wrong choice needs its own `- X)` bullet.
9. **Keep wrong-answer bullets simple**: Bullet bodies should be plain paragraph text only. Do not put nested lists, numbered sublists, blockquotes, code blocks, or heading-style lines inside a bullet body.
10. **Every wrong choice needs a non-blank explanation**: Missing explanations degrade the learner-facing feedback and are still content debt even though the UI now renders partial coverage
11. **Nothing after the last bullet** except blank lines and `### Reference` — any other text gets appended to the last choice's explanation
12. **Check for technical flaws** (see META.MD Part 2 for full taxonomy)
13. **No domain tags** in draft frontmatter (taxonomy is topic/substance/treatment/diagnosis)
14. **Frontmatter is strict**: unknown YAML keys will be rejected by the import script

### Workflow

```
1. Read: questions/[chapter]/[paper]/[paper].md
2. Identify 6-12 clinically relevant concepts (NOT statistics)
3. Write 6 recall questions (2 easy, 2 medium, 2 hard) -> questions/.../recall.md
4. Write 6 vignette questions (2 easy, 2 medium, 2 hard) -> questions/.../vignettes.md
5. Apply quality checklist from META.MD Part 2
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

**For the complete list and examples, see META.MD Part 2.**

---

## Vocabularies

**Substances:** alcohol, cannabis, cocaine, hallucinogens, inhalants, opioids, polysubstance, sedatives, stimulants, tobacco, other

**Topics:** screening-diagnosis, epidemiology-prevention, pharmacology-neuroscience, intoxication-toxicology, withdrawal-management, treatment-pharmacotherapy, psychosocial-interventions, co-occurring-disorders, medical-complications, harm-reduction, ethics-legal, special-populations, general

**Treatments:** acamprosate, buprenorphine, bupropion, disulfiram, gabapentin, methadone, naloxone, naltrexone, nrt, topiramate, varenicline, other-treatment

> These are canonical slugs. The import script rejects anything else. If your existing drafts use old slugs (e.g., `pharmacology` instead of `pharmacology-neuroscience`), see the migration map in QUESTION-FORMAT-SPEC.md §4.

---

## Special Cases

- `questions/prescribers-guide/`: 4 recall questions per medication (no vignettes). See `SCHEMA.md` for details. (App repo path: `content/drafts/questions/prescribers-guide/`.)
- `questions/article-based-pathway/09-therapy/2024-cooperman-more-trial-correction/`: correction notice folder (no questions). (App repo path: `content/drafts/questions/article-based-pathway/09-therapy/2024-cooperman-more-trial-correction/`.)

### Prescriber's Guide: Addiction Relevance Filter

Every Prescriber's Guide question must have an explicit addiction psychiatry connection. The 36 medications were hand-selected for their relevance to addiction practice, but generic pharmacology questions about them do not belong in an addiction board prep product.

**Every question must test at least one addiction hook:**
- Abuse/dependence potential (scheduling, misuse patterns, abuse-deterrent design)
- Withdrawal or overdose recognition and management
- Drug interactions with SUD treatment medications (methadone, buprenorphine, naltrexone, etc.)
- Prescribing considerations in patients with SUD history
- Harm reduction (naloxone reversal, drug-facilitated assault detection, overdose prevention)
- Behavioral addiction connections (binge eating disorder, food addiction)
- Forensic/legal relevance (diversion, drug-facilitated assault, controlled substance scheduling)
- Comorbid SUD management (e.g., smoking cessation impact on olanzapine dosing)
- Tolerance, cross-tolerance, and sensitization relevant to substance use
- Dependence/addiction potential of the medication as a clinical concern (e.g., ketamine, esketamine, Z-drugs)

**Do NOT test in isolation (without an addiction hook):**
- Generic pharmacology (metabolic pathways, release kinetics) unless tied to abuse potential or SUD interactions
- Non-addiction indications (ADHD, bipolar, obesity, TRD) unless the question includes a SUD patient or addiction-relevant angle
- Formulation minutiae not related to abuse deterrence or adherence in SUD populations
- Side effects unrelated to SUD population management
- Generic drug interactions not relevant to patients with SUDs
- Geriatric/pediatric dosing without SUD context

**Rewrite pattern:** Convert off-target questions to clinical scenarios where the addiction hook is explicit. Example: instead of testing Concerta's osmotic delivery in GI narrowing, test stimulant formulation features that reduce diversion risk.

---

## Reference Files in This Directory

| File | Purpose |
|------|---------|
| `SCHEMA.md` | YAML format spec, tag vocabularies, QID rules, quality checklist |
| `QUESTION-FORMAT-SPEC.md` | Complete pipeline spec - how fields map through import -> MDX -> seed -> database -> UI |
| `TAG-TAXONOMY.md` | Canonical tag tables, migration maps, content gaps |
| `META.MD` | Inventory, historical audit prompt, **full NBME quality standards (Part 2)** |
| `NOTES.md` | Audit findings (quality tiers, failure modes, stabilization status) |
| `PLAN.md` | Progress tracker (all 480 article-based questions complete) |
