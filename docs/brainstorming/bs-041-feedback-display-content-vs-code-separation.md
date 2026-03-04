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
| P3: Section visual hierarchy (both flows) | `feedback.tsx` | Code — **Option B decided** (semantic color-coded cards) | — (new) |

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

## PART B: Code Change — Unified Section Cards (P3)

### The Problem (First Principles)

The feedback display has an **inverted visual hierarchy**. The wrong-answer cards — the *least* important content — get full visual containment (`rounded-xl border bg-background/50 p-3`), while the *most* important content ("Your answer" explanation, "Correct answer" + explanation + clinical pearl) floats as flat, uncontained text. The learner's eye is drawn to the contained cards rather than the primary teaching content.

This applies to **both** flows:

| Flow | Primary content (flat, uncontained) | Supplementary content (contained cards) |
|------|-------------------------------------|----------------------------------------|
| Correct | "Correct answer" + explanation + clinical pearl | Wrong-answer cards |
| Incorrect | "Your answer" + explanation; "Correct answer" + explanation + clinical pearl | Other wrong-answer cards |

**Incorrect flow is worse.** Two primary sections ("Your answer" and "Correct answer") need to be quickly distinguishable, but they're separated only by a bold label and a `mt-4` gap. The user has to carefully *read* to find the boundary — there's no visual boundary to *scan*. Meanwhile, the wrong-answer cards at the bottom feel like the most structured, "finished" part of the UI.

**The redundant text in wrong-answer cards compounds the hierarchy problem.** Each card shows the choice label (e.g., "C) Increase the diazepam dose…") and then the explanation paragraph opens by repeating that exact string before a colon. This doubles reading burden and looks like a data-formatting bug — another signal that the wrong-answer section got more structural attention than the primary teaching content. (See Part A, Fix 1 for the MDX-side fix.)

### Decision: Semantic Color-Coded Cards (Option B)

**Why not Option A (uniform cards)?** Fixes containment but doesn't help scanning. On a long feedback card, the learner needs to quickly locate "my answer" vs "correct answer" vs "other". Small text labels are easy to miss — color on the card itself is a faster visual cue.

**Why not Option C (subtle separators)?** A top border or background tint without full card treatment doesn't create the "unit of meaning" that containment provides. Half-measure that doesn't solve the root problem.

**Why Option B?**
1. Every content section gets card containment — no more floating text
2. Semantic color provides quick-scan navigation without reading labels
3. The badge at the top already uses `success`/`destructive` colors; the section cards echo this, creating a cohesive color language
4. The codebase already uses these tokens at similar opacities: choice buttons (`border-success bg-success/10`), notifications (`border-success/30 bg-success/10`), error card (`border-destructive/30 bg-destructive/10`). This is an established pattern, not a new concept.
5. Section labels ("Your answer", "Correct answer", "Why other answers are wrong:") remain as free-floating headings above their cards — the labels provide structure, the cards provide containment and color
6. **Learning arc narrative:** In the incorrect flow, the color shift from red (Your answer) → green (Correct answer) → neutral (Other wrong answers) visually narrates the pedagogical arc: "here's your mistake → here's what's right → here's supplementary context." This is especially valuable in a medical education tool where quick error-recognition-to-correction flow is the core learning mechanism.

### Card Styles

| Section | Card className | When |
|---------|---------------|------|
| Your answer | `rounded-xl border border-destructive/20 bg-destructive/5 p-3` | Incorrect flow only |
| Correct answer | `rounded-xl border border-success/20 bg-success/5 p-3` | Both flows |
| Wrong-answer items | `rounded-xl border border-border/60 bg-background/50 p-3` | Both flows (unchanged) |

**Note:** The exact opacity values (`/20`, `/5`) may need tuning in the browser against both light and dark themes. The intent is a barely-visible tint — enough for color recognition when scanning, not bold color blocks. These are nested surfaces inside the outer `<Card>`, so lower opacities are appropriate.

### Visual Mockup: Correct Flow

```
┌─── outer Card (bg-card, rounded-2xl) ────────────────────────┐
│                                                               │
│  ┌ Correct ─────────────────────────────────────────────────┐ │
│  │ (bg-success/15 text-success pill)                        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  Correct answer                    ← free-floating label      │
│  ┌─── border-success/20 bg-success/5 ───────────────────┐    │
│  │ B) Exposures increased overall                        │    │
│  │                                                       │    │
│  │ Palamar et al. (2023) found that the number of        │    │
│  │ reported ketamine exposures increased from 2019...     │    │
│  │                                                       │    │
│  │ **Clinical pearl:** Ketamine poisonings are            │    │
│  │ increasing despite the pandemic...                     │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  Why other answers are wrong:      ← free-floating label      │
│  ┌─── border-border/60 bg-background/50 ────────────────┐    │
│  │ A) Exposures decreased overall                        │    │
│  │ The study reported an increase, not a decrease.        │    │
│  └───────────────────────────────────────────────────────┘    │
│  ┌─── border-border/60 bg-background/50 ────────────────┐    │
│  │ C) Exposures remained stable with no overall change   │    │
│  │ The study reported an increase, not stability.         │    │
│  └───────────────────────────────────────────────────────┘    │
│  ┌─── border-border/60 bg-background/50 ────────────────┐    │
│  │ D) Exposures peaked in 2020 and then returned to...   │    │
│  │ The study described an overall linear increase...      │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  REFERENCE                                                    │
│  Palamar JJ, et al. J Psychopharmacol. 2023;37(8):802-808.   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Visual Mockup: Incorrect Flow

```
┌─── outer Card (bg-card, rounded-2xl) ────────────────────────┐
│                                                               │
│  ┌ Incorrect ───────────────────────────────────────────────┐ │
│  │ (bg-destructive/15 text-destructive pill)                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  Your answer                       ← free-floating label      │
│  ┌─── border-destructive/20 bg-destructive/5 ──────────┐    │
│  │ A) Start dexmedetomidine to replace                   │    │
│  │    benzodiazepines for the ongoing delirium            │    │
│  │                                                       │    │
│  │ While dexmedetomidine is an option for resistant       │    │
│  │ alcohol withdrawal in the ICU, replacing               │    │
│  │ benzodiazepines entirely would be inappropriate...     │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  Correct answer                    ← free-floating label      │
│  ┌─── border-success/20 bg-success/5 ───────────────────┐    │
│  │ B) Assess for benzodiazepine-induced delirium and     │    │
│  │    consider adjusting the benzodiazepine dose          │    │
│  │                                                       │    │
│  │ The ASAM guideline (Recommendation VI.18) states       │    │
│  │ that for patients who have been delirious longer       │    │
│  │ than 72 hours, clinicians should assess for drug-      │    │
│  │ induced delirium...                                    │    │
│  │                                                       │    │
│  │ **Clinical pearl:** The guideline warns that when      │    │
│  │ very large doses of long-acting benzodiazepines        │    │
│  │ are used, there is risk of accumulation...             │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  Why other answers are wrong:      ← free-floating label      │
│  ┌─── border-border/60 bg-background/50 ────────────────┐    │
│  │ C) Increase the diazepam dose to achieve deeper       │    │
│  │    sedation for the persistent delirium                │    │
│  │ Increasing the dose of a medication that may be        │    │
│  │ causing the delirium would worsen the patient's...     │    │
│  └───────────────────────────────────────────────────────┘    │
│  ┌─── border-border/60 bg-background/50 ────────────────┐    │
│  │ D) Add haloperidol as monotherapy to treat the        │    │
│  │    hallucinations and agitation                        │    │
│  │ The guideline states antipsychotics should not be      │    │
│  │ used as monotherapy for alcohol withdrawal delirium... │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  REFERENCE                                                    │
│  American Society of Addiction Medicine. J Addict Med...      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Structural Change

The key structural change: **labels move outside, content moves inside a card.**

**Before (current — flat text):**
```tsx
<div className="mt-6">
  <div className="text-sm font-medium text-foreground">Correct answer</div>
  <div className="flex items-start gap-1 text-sm text-foreground">
    <span className="shrink-0 font-medium">{correctChoice.displayLabel})</span>
    <Markdown content={correctChoice.textMd} />
  </div>
  <Markdown content={explanationMd} className="mt-2 text-sm" />
</div>
```

**After (contained in semantic card):**
```tsx
<div className="mt-6">
  <div className="text-sm font-medium text-foreground">Correct answer</div>
  <div className="mt-2 rounded-xl border border-success/20 bg-success/5 p-3">
    <div className="flex items-start gap-1 text-sm text-foreground">
      <span className="shrink-0 font-medium">{correctChoice.displayLabel})</span>
      <Markdown content={correctChoice.textMd} />
    </div>
    <Markdown content={explanationMd} className="mt-2 text-sm" />
  </div>
</div>
```

Same pattern for "Your answer" (with `border-destructive/20 bg-destructive/5`). Wrong-answer cards are unchanged.

**What goes inside each card:**

| Card | Contains |
|------|----------|
| "Your answer" (incorrect flow) | Choice label + text + choice explanation |
| "Correct answer" (both flows) | Choice label + text + `explanationMd` (includes clinical pearl) |
| Wrong-answer items (both flows) | Choice label + text + choice explanation (unchanged) |

### Scope of Code Change

| File | Change |
|------|--------|
| `feedback.tsx` | Wrap "Your answer" content in destructive-accented card (lines 143-159), wrap "Correct answer" content in success-accented card (lines 88-112 for correct flow, lines 162-186 for incorrect flow) |
| `Feedback.test.tsx` | Update existing class assertions; add tests for new card containment |
| `theme-token-regression.test.tsx` | May need update if it asserts on feedback section structure |

**Not changing:** Wrong-answer card styling, badge styling, reference section, props/types, MDX content, any other files.

---

### Deferred: Clinical Pearl Styled Callout (DEBT-275 F1)

Even with the blank-line MDX fix, the clinical pearl is just bold text in a paragraph. Detecting `**Clinical pearl:**` in `<Markdown>` and rendering as a styled callout box would be nicer UX but is a separate enhancement.

**Concrete sketch from Chrome agent audit:** A left-border accent within the correct-answer card — `border-l-2 border-success/40 pl-3` — would visually separate the factual explanation from the pearl without adding a full nested card. This keeps it lightweight while signaling "this is a callout."

**Status:** Deferred. The blank-line MDX fix (Part A, Fix 2) is sufficient for visual separation. The left-border accent sketch is a viable implementation approach when prioritizing DEBT-275 F1.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-04 | Created BS-041 | Source-of-truth analysis needed to separate MDX content fixes from code fixes after DEBT-274 shipped |
| 2026-03-04 | Clinical pearl callout (F1) deferred | Blank-line MDX fix is sufficient for visual separation; styled callout is a future enhancement |
| 2026-03-04 | P3: Option B — Semantic color-coded cards | Every section gets card containment; semantic colors (`success`/`destructive`) echo badge colors and enable quick-scan navigation without reading labels. Established pattern in codebase (choice buttons, notifications, error card). Applied uniformly to both correct and incorrect flows. |
| 2026-03-04 | P3 corroborated by independent Chrome agent UX audit | Claude-in-Chrome agent reviewed live Vercel deployment with zero knowledge of BS-041. Independently identified same inverted hierarchy problem, recommended same semantic color-coded cards with near-identical class values (`border-destructive/20 bg-destructive/5`, `border-success/20 bg-success/5`). Added: (1) section boundary confusion detail for incorrect flow, (2) red→green learning arc narrative framing, (3) clinical pearl left-border accent sketch for DEBT-275 F1, (4) redundant text as hierarchy issue cross-reference to Part A Fix 1. |
