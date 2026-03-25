# Question Generation Instructions (For Agents)

Generate board-style questions for Addiction Psychiatry certification (NTX University).

## Required Reading

Read these in order:

1. `AGENTS.md` — quick-start for agent sessions
2. `SCHEMA.md` — complete active authoring contract, taxonomy, validation rules, and canonical quality checklist
3. `PLAN.md` — inventory/progress tracker when current status matters
4. `NOTES.md` — optional reference for historical audits, DEBT-338 corruption files, or Prescriber's rewrite queue

If this file conflicts with `SCHEMA.md`, follow `SCHEMA.md`.

---

## Quick Reference

### Per Paper Targets

| File | Questions | Easy | Medium | Hard |
|------|-----------|------|--------|------|
| `recall.md` | 6 | 2 | 2 | 2 |
| `vignettes.md` | 6 | 2 | 2 | 2 |
| **Total** | **12** | **4** | **4** | **4** |

Prescriber's Guide exception: 4 recall questions per medication, no vignettes.

### Critical Rules

1. Use the **current** draft format from `SCHEMA.md`, not the future Phase 2 YAML `choices[]` format.
2. Keep `answer` in frontmatter; do not mark the correct choice in the body.
3. Use canonical taxonomy slugs from `SCHEMA.md`.
4. Test clinical application, not sample sizes, p-values, or publication trivia.
5. Lead-ins must pass the cover-the-options test.
6. `**Clinical pearl:**` must appear before `**Why other answers are wrong:**`.
7. Use one wrong-answer bullet per wrong choice. No combined labels.
8. Wrong-answer bullet bodies must stay plain paragraph text only.
9. End the explanation with `### Reference`.
10. Run the **single canonical checklist in `SCHEMA.md`** before saving.

### Workflow

```text
1. Read the source markdown
2. Identify clinically relevant concepts
3. Draft questions in the current SCHEMA.md format
4. Run the SCHEMA.md checklist
5. Save to recall.md / vignettes.md (or recall.md only for Prescriber's Guide)
6. Update PLAN.md if you advanced tracked progress
7. Validate in the app repo with: pnpm content:import:drafts -- --dry-run
```

---

## What to Keep Top of Mind

- Make the question useful to a practicing addiction psychiatrist or addiction medicine physician.
- Use plausible, homogeneous distractors that represent real misconceptions.
- Teach in the explanation; do not merely restate the answer key.
- If a question starts feeling like generic psychopharmacology, re-anchor it to addiction practice.

---

## Special Cases

- `questions/prescribers-guide/`: recall-only medication folders
- `questions/article-based-pathway/09-therapy/2024-cooperman-more-trial-correction/`: correction-note folder, no questions

### Prescriber's Guide: Addiction Relevance Filter

Every Prescriber's Guide question must include an explicit addiction hook.

**Acceptable hooks include:**
- Abuse/dependence potential
- Withdrawal or overdose recognition/management
- Drug interactions with SUD treatment medications
- Prescribing in patients with SUD history
- Harm reduction or diversion prevention
- Forensic/legal relevance tied to addiction practice
- Comorbid SUD management
- Tolerance, cross-tolerance, or sensitization relevant to substance use
- Dependence/addiction potential of the medication as a clinical concern

**Do not write:**
- Generic pharmacology with no addiction angle
- Non-addiction indications without an addiction-relevant scenario
- Formulation minutiae with no diversion, misuse, or adherence significance
- Generic adverse-effect or interaction questions that could belong in any psychopharmacology bank

Use `NOTES.md` if you need the Prescriber's rewrite queue or historical audit context.
