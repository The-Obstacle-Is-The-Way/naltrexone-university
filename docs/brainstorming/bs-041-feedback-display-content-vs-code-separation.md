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
**Severity:** High — visible in BOTH flows (incorrect flow's "Your answer" section AND both flows' wrong-answer cards)

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

### P3: Visual Hierarchy Inconsistency Between Feedback Sections (BOTH Flows)

**Layer:** Code (`feedback.tsx`)
**Severity:** Medium — inconsistent visual treatment across the same feedback card
**Applies to:** Both correct AND incorrect answer displays

**What's happening:**

The same inconsistency exists in **both** flows. The wrong-answer cards get borders and backgrounds, while the primary sections ("Correct answer", "Your answer") are flat unstyled text.

**Correct answer flow** (`feedback.tsx:86-139`):

| Section | Visual treatment | Code location |
|---------|-----------------|---------------|
| "Correct answer" + choice text + explanation + clinical pearl | Flat text, no border/background | `feedback.tsx:88-113` |
| "Why other answers are wrong" (each choice) | Card with `rounded-xl border border-border/60 bg-background/50 p-3` | `feedback.tsx:120-135` |

**Incorrect answer flow** (`feedback.tsx:140-213`):

| Section | Visual treatment | Code location |
|---------|-----------------|---------------|
| "Your answer" (user's wrong choice) | Flat text, no border/background | `feedback.tsx:142-160` |
| "Correct answer" + explanation + clinical pearl | Flat text, no border/background | `feedback.tsx:162-187` |
| "Why other answers are wrong" (each choice) | Card with `rounded-xl border border-border/60 bg-background/50 p-3` | `feedback.tsx:195-208` |

In both flows, the least important information (other wrong answers) gets the most visual prominence via card styling, while the primary information ("Correct answer" / "Your answer") has no visual container at all.

**Proposed fix (code):** Unify card treatment across all sections in both flows. Three approaches:

**Option A — Same card style for all sections:**
Give "Your answer" and "Correct answer" the same `rounded-xl border border-border/60 bg-background/50 p-3` treatment as the wrong-answer cards. Uniform look across both flows.

**Option B — Distinct card styles per section importance:**
- "Your answer" (incorrect flow only) → card with `border-destructive/30` accent
- "Correct answer" (both flows) → card with `border-success/30` accent
- "Other wrong answers" (both flows) → neutral card (current style)

**Option C — Keep flat text but add subtle visual separation:**
Add a top border or background tint to "Your answer" and "Correct answer" sections without full card treatment. Lighter touch.

**Decision needed:** Pick an approach. Whichever is chosen applies to both flows for a unified front.

---

## Summary: What Changes Where

| Issue | Fix Location | Content or Code? | DEBT-275 Ref |
|-------|-------------|-------------------|-------------|
| P1: Redundant choice text prefix | MDX files in question-generation repo | Content | C3 |
| P2: Clinical pearl blank line | MDX files in question-generation repo | Content | C2 |
| P2 (future): Clinical pearl callout | `Markdown.tsx` or `feedback.tsx` | Code | F1 |
| P3: Section visual hierarchy (both flows) | `feedback.tsx` | Code | — (new) |

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

## PART A: MDX Content Fixes (Question-Generation Repo)

These are **definite fixes** — no open decisions. The question-format-spec already defines the correct format; the content just needs to match it. Apply these when batch-editing the raw markdown files in `**/recall.md` and `**/vignettes.md`.

### Fix 1: Remove Redundant Choice Text from Wrong-Answer Bullets (P1)

**What to look for:** Each bullet under `**Why other answers are wrong:**` that starts by repeating the choice text from `## Choices`, followed by a colon, then the actual explanation.

**Pattern to find:**
```markdown
**Why other answers are wrong:**
- A) [SAME TEXT AS CHOICE A]: [actual explanation starts here]
- B) [SAME TEXT AS CHOICE B]: [actual explanation starts here]
```

**What to change:** Remove the repeated choice text and the colon. Keep only the explanation. The UI already displays the choice text from the `## Choices` section — the explanation should NOT repeat it.

**Before (wrong — current pattern in many questions):**
```markdown
## Choices

- A) Increase the diazepam dose to achieve deeper sedation for the persistent delirium
- B) Add haloperidol as monotherapy to treat the hallucinations and agitation
- C) Start dexmedetomidine to replace benzodiazepines for the ongoing delirium

## Explanation

...

**Why other answers are wrong:**
- A) Increase the diazepam dose to achieve deeper sedation for the persistent delirium: Increasing the dose of a medication that may be causing the delirium would worsen the patient's condition.
- B) Add haloperidol as monotherapy to treat the hallucinations and agitation: The guideline (Recommendation VI.20) states that antipsychotics should not be used as monotherapy...
- C) Start dexmedetomidine to replace benzodiazepines for the ongoing delirium: While dexmedetomidine is an option for resistant alcohol withdrawal in the ICU...
```

**After (correct — spec-compliant):**
```markdown
**Why other answers are wrong:**
- A) Increasing the dose of a medication that may be causing the delirium would worsen the patient's condition.
- B) The guideline (Recommendation VI.20) states that antipsychotics should not be used as monotherapy...
- C) While dexmedetomidine is an option for resistant alcohol withdrawal in the ICU...
```

**Why this matters:** The UI renders `displayLabel + textMd` (from `## Choices`) **and then** `explanationMd` (from this bullet) in sequence. If the bullet starts with the choice text, it appears twice on screen.

**Scope:** All questions that use the `[choice text]: [explanation]` pattern. Check every bullet under every `**Why other answers are wrong:**` section.

**Tip for batch editing:** The redundant prefix always ends with a colon (`:`) at the boundary between the repeated choice text and the actual explanation. Look for the colon that separates the two, delete everything before and including it, then capitalize the first letter of the remaining explanation.

---

### Fix 2: Ensure Blank Line Before Clinical Pearl (P2)

**What to look for:** `**Clinical pearl:**` appearing on the line immediately after the explanation paragraph, with no blank line between them.

**Pattern to find (wrong):**
```markdown
...the guideline-directed next step is to assess for medication-related delirium and adjust dosing as indicated.
**Clinical pearl:** The guideline (Recommendation VI.17) warns that...
```

**What to change:** Add one blank line before `**Clinical pearl:**`.

**After (correct — spec-compliant):**
```markdown
...the guideline-directed next step is to assess for medication-related delirium and adjust dosing as indicated.

**Clinical pearl:** The guideline (Recommendation VI.17) warns that...
```

**Why this matters:** Without the blank line, markdown renders the clinical pearl as part of the same paragraph. With the blank line, the `[&_p+p]:mt-3` CSS in `Markdown.tsx` adds visible spacing between paragraphs.

**Note:** Some questions already have the blank line (e.g., `asam-alcohol-withdrawal-2020-012`). Only fix the ones that are missing it.

---

### Fix 3: Ensure Blank Line Before "Why Other Answers Are Wrong" (minor)

**What to look for:** `**Why other answers are wrong:**` appearing immediately after the clinical pearl with no blank line.

**Pattern to find (wrong):**
```markdown
**Clinical pearl:** Some pearl text here.
**Why other answers are wrong:**
```

**What to change:** Ensure a blank line before `**Why other answers are wrong:**`.

**After (correct):**
```markdown
**Clinical pearl:** Some pearl text here.

**Why other answers are wrong:**
```

**Note:** The parser handles this regardless of blank lines, but consistent spacing keeps the raw MDX readable.

---

### MDX Batch-Fix Checklist (per question)

Use this checklist when editing each question in `**/recall.md` and `**/vignettes.md`:

- [ ] **Fix 1:** Under `**Why other answers are wrong:**`, does each bullet start by repeating the choice text followed by a colon? → Remove the prefix, keep only the explanation
- [ ] **Fix 2:** Is there a blank line before `**Clinical pearl:**`? → Add if missing
- [ ] **Fix 3:** Is there a blank line before `**Why other answers are wrong:**`? → Add if missing

### After all MDX fixes

Re-import and re-seed to push content changes to the database:

```bash
pnpm content:import:drafts -- --status published && pnpm db:seed
```

---

## PART B: Code Changes (Open Questions — This App Repo)

These require design decisions before implementation. None are blocking the MDX fixes above.

### Open Question 1: Section Visual Hierarchy — Unified Across Both Flows (P3)

In **both** the correct and incorrect flows, "Correct answer" (and "Your answer" in the incorrect flow) render as flat text while wrong-answer cards get `rounded-xl border border-border/60 bg-background/50 p-3`. Should all sections have consistent card treatment?

**Options:**
- **A — Uniform cards:** Same card style for all sections in both flows
- **B — Color-coded cards:** destructive accent for "Your answer", success accent for "Correct answer", neutral for others — applied consistently in both flows
- **C — Subtle separators:** Top border or background tint, not full cards

**Status:** Decision needed. No code change until decided. Whichever approach is chosen must be applied to both flows.

### Open Question 2: Clinical Pearl Styled Callout (DEBT-275 F1)

Even with the blank-line MDX fix, the clinical pearl is just bold text in a paragraph. Should we detect `**Clinical pearl:**` in the `<Markdown>` component and render it as a styled callout box?

**Status:** Deferred. The blank-line MDX fix (Part A, Fix 2) is sufficient for now. Revisit when prioritizing DEBT-275 future enhancements.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-04 | Created BS-041 | Source-of-truth analysis needed to separate MDX content fixes from code fixes after DEBT-274 shipped |
| 2026-03-04 | Clinical pearl callout (F1) deferred | Blank-line MDX fix is sufficient for visual separation; styled callout is a future enhancement |
