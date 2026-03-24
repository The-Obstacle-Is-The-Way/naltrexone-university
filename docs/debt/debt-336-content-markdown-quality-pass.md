# DEBT-336: Content Markdown Quality Pass (External Repo)

**Priority:** P3
**Created:** 2026-03-24
**Source:** [DEBT-275](./debt-275-bs033-residual-open-items.md) (Content-Layer Work C1–C4)
**Scope:** Markdown content fixes in the **external `addiction-final-2026` repo**, then re-imported here

---

## Context

The question content lives in a separate repo (`addiction-final-2026`) and is imported into this app via `pnpm content:import:drafts`. Four content quality issues were identified during the BS-033 UX audit. All four are about the **markdown text itself**, not the app code.

These instructions should be copied to the external repo so agents there can execute the fixes against the actual question files.

---

## C1: Missing Blank Line Before Lead-In Question

**What's wrong:** Some question stems have the clinical scenario and the "Which of the following..." lead-in question jammed into one paragraph because there's no blank line separating them.

**Why it matters:** The app's `<Markdown>` component adds visual spacing between `<p>` tags (`[&_p+p]:mt-3`), but that only works when the markdown actually produces separate paragraphs. Without a blank line, markdown treats it as one paragraph — one wall of text.

**What to do:** Audit all question `## Question` sections. If the stem has a clinical scenario followed by a lead-in question (e.g., "Which of the following..."), ensure there is a **blank line** between the scenario and the question.

### Example

**Bad (no blank line — renders as one paragraph):**
```markdown
## Question

A 45-year-old man with alcohol use disorder has been abstinent for 3 months.
He reports increased cravings after a stressful work event.
Which of the following medications would be most appropriate to address his cravings?
```

**Good (blank line — renders as two paragraphs):**
```markdown
## Question

A 45-year-old man with alcohol use disorder has been abstinent for 3 months.
He reports increased cravings after a stressful work event.

Which of the following medications would be most appropriate to address his cravings?
```

---

## C2: Missing Blank Line Before Clinical Pearl

**What's wrong:** Some explanations have `**Clinical pearl:**` text jammed into the preceding paragraph because there's no blank line before it.

**Why it matters:** Same rendering issue as C1. The clinical pearl should be its own paragraph (and is now rendered as a styled callout by the `<Markdown>` component). Without a blank line, it merges with the text above it and the callout detection fails.

**What to do:** Audit all `## Explanation` sections. If `**Clinical pearl:**` appears, ensure there is a **blank line** before it.

### Example

**Bad:**
```markdown
The AUDIT-C uses sex-specific cutoffs: ≥3 for women and ≥4 for men.
**Clinical pearl:** The AUDIT-C is the most validated brief screening tool
in primary care, taking under 1 minute to administer.
```

**Good:**
```markdown
The AUDIT-C uses sex-specific cutoffs: ≥3 for women and ≥4 for men.

**Clinical pearl:** The AUDIT-C is the most validated brief screening tool
in primary care, taking under 1 minute to administer.
```

---

## C3: Wrong-Answer Explanation Redundant Prefix

**What's wrong:** Some wrong-answer explanations restate the choice text before explaining why it's wrong. The UI already shows the full choice text above the explanation, so this creates a redundant, hard-to-read block.

**Why it matters:** Learners see the choice text twice — once in the choice display, once at the start of the explanation. The `QUESTION-FORMAT-SPEC.md` already prohibits this pattern (see §5, "Wrong-answer explanation format rules"), but older questions predate the rule.

**What to do:** Audit all `**Why other answers are wrong:**` sections. Remove any prefix that restates the choice text (whether full text or abbreviated label). Start directly with the reasoning.

### Example

**Bad (restates the choice):**
```markdown
- A) CYP interaction increasing methadone: While drug interactions should always
  be checked, the primary concern here is...
```

**Good (starts with reasoning):**
```markdown
- A) While drug interactions should always be checked, the primary concern
  here is...
```

---

## C4: Missing Wrong-Answer Explanations

**What's wrong:** Many questions are missing `**Why other answers are wrong:**` sections entirely, or have the section but are missing explanations for some choices.

**Why it matters:** DEBT-335 now allows the UI to show whatever wrong-answer
explanations exist, but missing per-choice content still leaves the "Why other
answers are wrong" section only partially represented. The learner still misses
valuable teaching content until the content layer is complete.

**What to do:** Audit all questions. For each question:
1. Ensure the `**Why other answers are wrong:**` section exists
2. Ensure every incorrect choice has a bullet with an explanation
3. Each explanation should teach a concept, not just say "this is incorrect"
4. Follow the format rules in `QUESTION-FORMAT-SPEC.md` §5

### Scale

This is the largest item. The question bank has 900+ questions. Prioritize by source:
1. `article-based-pathway/` — highest traffic, fix first
2. `prescribers-guide/` — second priority
3. Remaining sources

---

## Workflow

1. Copy this document's C1–C4 instructions to the `addiction-final-2026` repo
2. Agents in that repo execute the fixes against the actual question markdown files
3. Re-import into this repo via `pnpm content:import:drafts -- --status published`
4. Re-seed via `pnpm db:seed`
5. Verify in the app that explanations render correctly

---

## Acceptance Criteria

- [ ] C1: No question stems have scenario + lead-in merged into one paragraph
- [ ] C2: All `**Clinical pearl:**` markers have a blank line before them
- [ ] C3: No wrong-answer explanations restate the choice text as a prefix
- [ ] C4: All questions have per-choice wrong-answer explanations
- [ ] Questions re-imported and re-seeded successfully
