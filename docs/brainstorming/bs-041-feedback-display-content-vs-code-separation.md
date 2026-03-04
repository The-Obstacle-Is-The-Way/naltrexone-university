# BS-041: Feedback Display — Content vs Code Separation

**Date:** 2026-03-04
**Triggered by:** Visual inspection of incorrect-answer feedback after DEBT-274 (PR #171) shipped
**Scope:** Identify exactly what must change in MDX content files (question-generation repo) vs what must change in code (`feedback.tsx` / `Markdown.tsx`) to achieve consistent, non-redundant feedback display
**Related:** [DEBT-274](../_archive/debt/debt-274-incorrect-answer-feedback-flow-reorder.md), [DEBT-275](../debt/debt-275-bs033-residual-open-items.md) (C2, C3, F1), [Question Format Spec](../content/question-format-spec.md)

---

## Pipeline Trace — What Is Content, What Is Code

Understanding where each piece of displayed text originates is the prerequisite for knowing where to fix it.

```
MDX Content File (question-generation repo)
│
├── ## Choices
│   └── - A) Choice text here          →  choices.text_md (DB)  →  textMd (UI)
│
├── ## Explanation
│   ├── General explanation paragraph   →  questions.explanation_md (DB)  →  explanationMd (UI)
│   ├── **Clinical pearl:** ...         →  (part of explanation_md — NOT a separate field)
│   │
│   ├── **Why other answers are wrong:**
│   │   └── - A) [content]: [why]       →  choices.explanation_md (DB)  →  choice.explanationMd (UI)
│   │
│   └── ### Reference                   →  questions.reference_md (DB)  →  referenceMd (UI)
│
│
Code (feedback.tsx) adds these PROGRAMMATIC elements — NOT from MDX:
│
├── "Incorrect" / "Correct" badge
├── "Your answer" section label
├── "Correct answer" section label
├── "Why other answers are wrong:" heading
├── Section ordering (DEBT-274: Your answer → Correct → Others for incorrect flow)
├── Card styling on wrong-answer items (rounded-xl border bg-background/50)
└── "REFERENCE" heading
```

### Key insight

The seed parser (`scripts/seed-helpers.ts:parseChoiceExplanations()`) splits the `## Explanation` block at the `**Why other answers are wrong:**` heading:
- Everything **above** → `questions.explanation_md` (includes clinical pearl text)
- Each **bullet below** → `choices.explanation_md` keyed by label

The `**Why other answers are wrong:**` heading itself is consumed by the parser and **not stored** — the UI re-creates it as a programmatic label in `feedback.tsx`.

---

## The Problems

### P1: Redundant Choice Text in Wrong-Answer Explanations

**Layer:** MDX content (question-generation repo)
**Severity:** High — visible on every incorrect answer

**What's happening:**

The MDX content encodes wrong-answer explanations like this:

```markdown
**Why other answers are wrong:**
- C) Start dexmedetomidine to replace benzodiazepines for the ongoing delirium: While dexmedetomidine is an option for resistant alcohol withdrawal in the ICU, replacing benzodiazepines entirely would be inappropriate...
```

The parser extracts everything after `- C)` as `explanationMd`:

```
"Start dexmedetomidine to replace benzodiazepines for the ongoing delirium: While dexmedetomidine is an option..."
```

But `textMd` already contains the choice text (from `## Choices`):

```
"Start dexmedetomidine to replace benzodiazepines for the ongoing delirium"
```

The feedback UI renders **both** `textMd` and `explanationMd`, so the choice text appears twice:

```
Your answer
A) Start dexmedetomidine to replace benzodiazepines for the ongoing delirium    ← textMd

Start dexmedetomidine to replace benzodiazepines for the ongoing delirium:      ← explanationMd (redundant prefix)
While dexmedetomidine is an option for resistant alcohol withdrawal in the ICU...
```

**Root cause:** The MDX authoring convention uses `- A) [choice text]: [explanation]` format, but the question-format-spec (§5) documents a different convention:

```markdown
- A) Why choice A is wrong — explain the misconception or error
```

The spec does NOT include the choice text before the explanation. The actual content diverges from the spec.

**Fix:** MDX content change (in the question-generation repo). Remove the choice text prefix from every wrong-answer bullet:

```markdown
# Before (current)
- C) Start dexmedetomidine to replace benzodiazepines for the ongoing delirium: While dexmedetomidine is an option...

# After (fixed)
- C) While dexmedetomidine is an option for resistant alcohol withdrawal in the ICU, replacing benzodiazepines entirely would be inappropriate...
```

**Scope:** All ~958 questions. This is exactly DEBT-275 C3.

**Code change needed?** No. The pipeline and UI already handle the data correctly — the content is the problem.

---

### P2: Clinical Pearl Has No Visual Separation

**Layer:** MDX content + potential future code enhancement
**Severity:** Medium — reduces readability of the correct-answer explanation

**What's happening:**

The clinical pearl renders inline with the preceding paragraph:

```
The ASAM guideline (Recommendation VI.18) states that...adjust dosing as indicated.
Clinical pearl: The guideline (Recommendation VI.17) warns that when very large doses of long-acting benzodiazepines are used...
```

No visual break between the main explanation and the clinical pearl.

**Root cause:** The MDX content lacks a blank line before `**Clinical pearl:**`:

```markdown
## Explanation

The ASAM guideline (Recommendation VI.18) states that...adjust dosing as indicated.
**Clinical pearl:** The guideline (Recommendation VI.17) warns...
```

The question-format-spec (§5) **does** show a blank line in the canonical example:

```markdown
General explanation of the correct answer.

**Clinical pearl:** A practical takeaway for clinical practice.
```

The actual content diverges from the spec. Without the blank line, markdown treats them as one paragraph.

**Fix (immediate, MDX content):** Add blank line before `**Clinical pearl:**` in every question. The existing `[&_p+p]:mt-3` CSS in `Markdown.tsx` will then add visual spacing between the two paragraphs. This is exactly DEBT-275 C2.

**Fix (future, code — DEBT-275 F1):** Detect `**Clinical pearl:**` pattern in the `<Markdown>` component and render as a visually distinct callout box with a different background color and border. This would be a nicer UX but is a separate enhancement.

**Decision needed:** Is the blank-line MDX fix sufficient for now, or should the code callout be prioritized?

---

### P3: Visual Hierarchy Inconsistency Between Feedback Sections

**Layer:** Code (`feedback.tsx`)
**Severity:** Medium — inconsistent visual treatment across the same feedback card

**What's happening:**

In the incorrect answer flow, three sections have different visual treatments:

| Section | Visual treatment | Code location |
|---------|-----------------|---------------|
| "Your answer" (user's wrong choice) | Flat text, no border/background | `feedback.tsx:142-160` |
| "Correct answer" + explanation | Flat text, no border/background | `feedback.tsx:162-187` |
| "Why other answers are wrong" (each choice) | Card with `rounded-xl border border-border/60 bg-background/50 p-3` | `feedback.tsx:195-208` |

The wrong-answer choices (C, D) get nested cards, but the user's answer (A) and the correct answer (B) are rendered as unstyled text. This creates an inconsistent visual hierarchy where the least important information (other wrong answers) gets the most visual prominence.

**Proposed fix (code):** Wrap "Your answer" and "Correct answer" sections in card-style containers. Three approaches:

**Option A — Same card style for all sections:**
Give "Your answer" and "Correct answer" the same `rounded-xl border border-border/60 bg-background/50 p-3` treatment as the wrong-answer cards. Uniform look.

**Option B — Distinct card styles per section importance:**
- "Your answer" → card with `border-destructive/30` accent (matches the Incorrect badge)
- "Correct answer" → card with `border-success/30` accent (matches correct emphasis)
- "Other wrong answers" → neutral card (current style)

**Option C — Keep flat text but add subtle visual separation:**
Add a top border or background tint to "Your answer" and "Correct answer" sections without full card treatment. Lighter touch.

**Decision needed:** Pick an approach.

---

## Summary: What Changes Where

| Issue | Fix Location | Content or Code? | DEBT-275 Ref |
|-------|-------------|-------------------|-------------|
| P1: Redundant choice text prefix | MDX files in question-generation repo | Content | C3 |
| P2: Clinical pearl blank line | MDX files in question-generation repo | Content | C2 |
| P2 (future): Clinical pearl callout | `Markdown.tsx` or `feedback.tsx` | Code | F1 |
| P3: Section visual hierarchy | `feedback.tsx` | Code | — (new) |

### What does NOT need to change in MDX

- "Your answer" label — programmatic (code)
- "Correct answer" label — programmatic (code)
- "Why other answers are wrong:" heading — programmatic (code, re-created from consumed parser heading)
- Section ordering — programmatic (code, DEBT-274 already shipped)
- Card styling — programmatic (code)
- Reference section heading/styling — programmatic (code)

### What does NOT need to change in code

- Parser logic (`seed-helpers.ts`) — correctly extracts per-choice explanations already
- Database schema — no new fields needed
- Domain entities — no changes
- Shuffling logic — no changes
- Pipeline — no changes

---

## Impact on Question-Generation Repo

The MDX content fixes (P1 and P2) need to happen in the **separate question-generation repo**, not in this app repo. The changes are:

1. **Update authoring guide** (`CLAUDE.md` in the question repo, or equivalent): Explicit rule that wrong-answer bullets must NOT repeat the choice text. Example:
   ```markdown
   # WRONG (current pattern in many questions)
   - A) Increase the diazepam dose to achieve deeper sedation: Increasing the dose...

   # CORRECT (spec-compliant)
   - A) Increasing the dose of a medication that may be causing the delirium...
   ```

2. **Bulk fix existing content:** Audit all `**/recall.md` and `**/vignettes.md` files and remove the redundant choice text prefix from wrong-answer bullets.

3. **Add blank lines before `**Clinical pearl:**`** in all explanation sections where missing.

4. **Re-import + re-seed** after content fixes: `pnpm content:import:drafts -- --status published && pnpm db:seed`

---

## Open Questions

1. **P3 visual approach:** Which card treatment for "Your answer" and "Correct answer" sections? (Option A, B, or C above)
2. **P2 future enhancement:** Should the clinical pearl callout (DEBT-275 F1) be prioritized, or is the blank-line MDX fix sufficient for now?
3. **Bulk content fix scope:** Should P1 and P2 be fixed across all ~958 questions at once, or incrementally by source/chapter?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-04 | Created BS-041 | Source-of-truth analysis needed to separate MDX content fixes from code fixes after DEBT-274 shipped |
