# Question Generation Instructions

Generate board-style questions for Addiction Psychiatry certification (NTX University).

## Read First

Read these in order:

1. `CLAUDE.md` — workflow and critical reminders
2. `SCHEMA.md` — complete active authoring contract, taxonomy, validation rules, and canonical quality checklist
3. `PLAN.md` — inventory/progress tracker when you need current status or need to update checkboxes
4. `NOTES.md` — optional reference for historical audits, DEBT-338 corruption file list, or Prescriber's rewrite queue

If this file conflicts with `SCHEMA.md`, follow `SCHEMA.md`.

---

## Per Paper Targets

Generate **12 questions** per standard source paper:

| File | Questions | Easy | Medium | Hard |
|------|-----------|------|--------|------|
| `recall.md` | 6 | 2 | 2 | 2 |
| `vignettes.md` | 6 | 2 | 2 | 2 |
| **Total** | **12** | **4** | **4** | **4** |

Prescriber's Guide is the main exception: 4 recall questions per medication, no vignettes. See `SCHEMA.md`.

---

## Critical Rules Summary

1. Use the **current** draft format from `SCHEMA.md`, not the future Phase 2 YAML `choices[]` format.
2. Put `answer: B` in frontmatter. Do not mark the correct choice in `## Choices`.
3. Use canonical `substances`, `topics`, and `treatments` slugs from `SCHEMA.md`.
4. Test clinical concepts, not study trivia or raw statistics.
5. Make the lead-in answerable without seeing the options.
6. Keep `**Clinical pearl:**` before `**Why other answers are wrong:**`.
7. Use exactly one wrong-answer bullet per wrong choice, with plain paragraph text only.
8. End `## Explanation` with `### Reference`.
9. Run the **single canonical checklist in `SCHEMA.md`** before saving.

---

## Workflow

```text
1. Read the source markdown for the paper or medication
2. Identify clinically relevant concepts (not raw statistics)
3. Draft questions in the current format from SCHEMA.md
4. Use the SCHEMA.md checklist before saving
5. Save to recall.md / vignettes.md (or recall.md only for Prescriber's Guide)
6. Update PLAN.md if you are advancing tracked progress
7. Validate in the app repo with: pnpm content:import:drafts -- --dry-run
```

---

## Special Cases

- `questions/prescribers-guide/`: 4 recall questions per medication, no `vignettes.md`
- `questions/article-based-pathway/09-therapy/2024-cooperman-more-trial-correction/`: correction-note folder, no questions

### Prescriber's Guide: Addiction Relevance Filter

Every Prescriber's Guide question must have an explicit addiction-psychiatry connection.

**Every question must test at least one addiction hook:**
- Abuse/dependence potential
- Withdrawal or overdose recognition and management
- Drug interactions with SUD treatment medications
- Prescribing considerations in patients with SUD history
- Harm reduction relevance
- Forensic/legal relevance tied to addiction practice
- Comorbid SUD management
- Tolerance, cross-tolerance, or sensitization relevant to substance use
- Dependence/addiction potential of the medication as a clinical concern

**Do not test in isolation:**
- Generic pharmacology without an addiction hook
- Non-addiction indications unless the scenario makes the addiction relevance explicit
- Formulation minutiae unrelated to misuse/diversion/adherence in SUD populations
- Generic side effects or drug interactions with no addiction relevance

**Rewrite pattern:** If a Prescriber's question feels like generic psychopharmacology, recast it so the addiction hook is explicit.
