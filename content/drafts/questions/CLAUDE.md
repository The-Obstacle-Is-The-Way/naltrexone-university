# Question Generation Instructions

Generate board-style questions for Addiction Psychiatry certification (NTX University).

## Read First

Read these in order:

1. `CLAUDE.md` - workflow and critical reminders
2. `SCHEMA.md` - complete active authoring contract, taxonomy, validation rules, and canonical quality checklist
3. `PLAN.md` - inventory/progress tracker when you need current status or need to update checkboxes
4. `NOTES.md` - optional reference for historical audits, DEBT-338 corruption file list, or Prescriber's rewrite queue
5. `../.claude/skills/generate-questions/SKILL.md` - NBME standards, anti-patterns, rewrite workflow
6. `../docs/content-debt/CDEBT-02-question-quality-anti-patterns.md` - anti-pattern registry with real examples

If this file conflicts with `SCHEMA.md`, follow `SCHEMA.md` for format/schema rules. Follow the generate-questions skill for item-writing quality and rewrite workflow. Use CDEBT-02 when judging whether a question construction pattern is acceptable.

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

1. Use **Phase 2 format**: structured `choices[]` in YAML frontmatter. No `answer:` field, no `## Choices` section, no `**Why other answers are wrong:**` in the body.
2. Mark exactly one choice `correct: true` (no `explanation`). All others `correct: false` with a double-quoted `explanation`.
3. Always double-quote `text` and `explanation` values in YAML.
4. Use canonical frontmatter key order: `qid, type, difficulty, substances, topics, treatments, diagnoses, source, choices`.
5. Use canonical `substances`, `topics`, and `treatments` slugs from `SCHEMA.md`.
6. Test clinical concepts, not study trivia or raw statistics.
7. Make the lead-in answerable without seeing the options.
8. Include a `**Clinical pearl:**` in the explanation (recommended for all new questions).
9. End `## Explanation` with `### Reference`.
10. Run the **single canonical checklist in `SCHEMA.md`** before saving.
11. If the source cannot support clean, clinically useful, nonduplicate items, flag it instead of padding with trivia.
12. Use patient characteristics only when they change the reasoning.
13. Wrong-answer explanations must start with reasoning, not repeated choice text.
14. Preserve markdown rendering: blank line before a standalone lead-in question, blank line before `**Clinical pearl:**`.

### Quality Gates (from CDEBT-02 audit)

Every question must pass these tests before it ships:

- **"Hasn't read the paper" test:** Could a well-trained addiction psychiatrist who hasn't read the specific source paper answer this? If no, the question tests reading comprehension, not clinical knowledge. Rewrite it.
- **Single-best-answer test:** Would content experts agree that one option is clearly the most correct answer? If no, the item is ambiguous. Rewrite it.
- **No source name-dropping:** No author names, trial names, or paper references in stems. Named clinical standards (DSM-5, ASAM, NIAAA) are OK.
- **No methodology testing:** No RCT counts, heterogeneity values, study design names, exclusion criteria, ITT vs complete-case.
- **No parameter-guessing distractors:** If all four options are just different numbers, the question tests memory, not understanding.
- **No demographic filler:** Race/ethnicity, country of origin, legal status, housing status, occupation, and similar details must earn their keep.
- **No quota-padding:** 12 per paper is a target, not a license to force duplicates, trivia, or source-locked garbage.

For the full anti-pattern registry with real examples, see `docs/content-debt/CDEBT-02-question-quality-anti-patterns.md`. For the rewrite workflow, see the generate-questions skill.

---

## Workflow

```text
1. Read the source markdown for the paper or medication
2. Identify clinically relevant concepts (not raw statistics)
3. If the source cannot support clean, nonduplicate, clinically useful items, stop and flag it
4. Draft questions in Phase 2 format (structured choices[] in YAML)
5. Use the SCHEMA.md checklist before saving
6. Save to recall.md / vignettes.md (or recall.md only for Prescriber's Guide)
7. Update PLAN.md if you are advancing tracked progress
8. Validate in the app repo with: pnpm content:import:drafts -- --dry-run
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

---

## What to Keep Top of Mind

- Make the question useful to a practicing addiction psychiatrist or addiction medicine physician.
- Use plausible, homogeneous distractors that represent real misconceptions.
- Teach in the explanation, do not merely restate the answer key.
- Keep patient characteristics purposeful, not decorative.
- When the paper is weak, stop before you manufacture trivia.
