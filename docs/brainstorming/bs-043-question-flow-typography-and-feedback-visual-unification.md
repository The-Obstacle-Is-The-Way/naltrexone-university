# BS-043: Question Flow Typography and Feedback Visual Unification

**Date:** 2026-03-05
**Triggered by:** Visual review of question stem, choice buttons, and feedback cards showing inconsistent text sizing and badge treatment across the pre/post-submission states.
**Scope:** Audit and plan for typography consistency and visual unification across the question flow — from question stem through choice buttons to feedback cards.
**Related:** [DEBT-279](../debt/debt-279-wcag-aa-contrast-remediation-plan.md), [BS-042](./bs-042-contrast-consistency-and-wcag-compliance-audit.md), [BUG-155](../_archive/bugs/bug-155-feedback-card-visual-overhaul.md), [BUG-157](../_archive/bugs/bug-157-question-card-choice-button-visual-polish.md), [Pattern Registry](../frontend/pattern-registry.md)

---

## The Problem

### 1. Typography size mismatch across the question flow

After BUG-155/157 (commit `48b5c9a4`), the question stem and choice button text were bumped from `text-sm` to `text-base`, while feedback answer/explanation typography stayed at `text-sm`. This creates a jarring visual break:

| Element | Pre-submission | Post-submission (feedback) |
|---------|---------------|---------------------------|
| Answer text (e.g. "Rebound hyperalgesia...") | `text-base` (16px) | `text-sm` (14px) |
| Question stem | `text-base` (16px) | N/A (not re-rendered) |
| Explanation text | N/A | `text-sm` (14px) |
| Reference content | N/A | `text-xs` (12px) |

The same answer text ("A) Rebound hyperalgesia from prolonged opioid receptor blockade") renders at 16px in the choice button and then at 14px in the feedback card. The user sees their answer shrink after submission.

### 2. Badge treatment diverges between choice buttons and feedback cards

| Element | Pre-submission (ChoiceButton) | Post-submission (Feedback) |
|---------|-------------------------------|----------------------------|
| Badge | Circular `h-7 w-7 rounded-full` with letter centered | Plain inline text `A)` |
| Layout gap | `gap-3` | `gap-1` |
| Badge visual weight | Bordered circle with muted fill | No visual treatment |

The circular badge gives the pre-submission choices a polished, distinct look. The feedback cards use plain `A)` text, making them look like a different component from a different app.

### 3. Should BUG-155/157 text-base bump be reverted?

The `text-sm → text-base` change was made for the question stem and choice text. Whether this was the right call depends on the intended reading experience:

- `text-base` (16px): Easier to read, more spacious, but makes the question card take more vertical space
- `text-sm` (14px): Denser, more information visible, consistent with the rest of the app's body text

**Current state:**
- Question stem: `text-base` (since BUG-157)
- Choice text: `text-base` (since BUG-157)
- Feedback answer text: `text-sm` (still unchanged by the BUG-155/157 typography pass)
- Feedback explanation: `text-sm`
- Most other in-app body and metadata copy: `text-sm`

Within the in-app learning flow, question stem and choice copy are now the main body-content exception using `text-base`. Most comparable dashboard/history/bookmarks/practice copy remains `text-sm`.

---

## Root Cause Analysis

BUG-155 and BUG-157 (commit `48b5c9a4`, 2026-02-26) changed the question flow asymmetrically:

1. Question stem: `text-sm` → `text-base`
2. Choice button text: `text-sm` → `text-base`
3. Feedback cards: structurally overhauled, but answer/explanation typography remained `text-sm`

The intent was to improve readability of the question flow. But the typography change was applied selectively to the pre-submission reading surfaces, while feedback got structural polish without the same type-ramp update. That created a split where the same content renders at different sizes before and after submission.

**Files changed:**
- `components/question/question-card.tsx` — stem `text-sm` → `text-base`, fieldset `mt-6` → `mt-8`
- `components/question/choice-button.tsx` — Markdown className `text-sm` → `text-base`
- `components/question/feedback.tsx` — verdict/reference/section structure changed, but answer and explanation typography remained `text-sm`

---

## Severity Assessment

**Severity:** Medium (visual inconsistency, not a functional or accessibility failure)

- Typography mismatch is noticeable when submitting an answer — the same text visibly shrinks
- Badge treatment difference makes pre/post-submission feel like separate products
- Neither issue blocks user workflow or violates WCAG

---

## Current Component Inventory

### Pre-submission (ChoiceButton in QuestionCard)

```
question-card.tsx:
  Stem: <Markdown className="text-base text-foreground" />
  Fieldset: mt-8 space-y-3

choice-button.tsx:
  Label wrapper: rounded-xl border p-4
  Badge: h-7 w-7 rounded-full border bg-muted text-xs font-semibold
  Answer text: <Markdown className="text-base text-foreground" />
  Layout: flex items-start gap-3
```

### Post-submission (Feedback)

```
feedback.tsx:
  Verdict badge: text-sm font-semibold (pill)
  Section labels: text-sm font-medium text-foreground
  Answer text in cards: text-sm text-muted-foreground (wrong) / text-sm text-foreground (correct/your answer)
  Badge: inline text "A)" with shrink-0
  Explanation: text-sm (Markdown)
  Reference heading: text-xs font-semibold uppercase
  Reference content: text-xs (Markdown)
  Layout: flex items-start gap-1
```

---

## Open Questions

1. **Should we revert question stem and choice text to `text-sm`?**
   - Pro: Consistency with the rest of the app, less vertical space, matches feedback
   - Con: `text-base` is more readable for the primary learning content
   - Option C: Keep `text-base` for stem but revert choices to `text-sm` to match feedback

2. **Should feedback answer cards adopt the circular badge?**
   - Pro: Visual continuity between pre/post-submission
   - Con: Feedback cards are display-only, not interactive — different visual weight may be intentional
   - Implementation: Mechanically small, but not just a one-node swap — badge adoption also implies layout, spacing, and contrast alignment work in `feedback.tsx`

3. **Should we extract shared badge/layout constants?**
   - The badge circle pattern (`h-7 w-7 rounded-full border bg-muted text-xs font-semibold`) could be a shared component or constant
   - Only worth doing if both ChoiceButton and Feedback adopt the same badge

4. **What about gap sizing?** ChoiceButton uses `gap-3`, Feedback uses `gap-1`. If badges are unified, gap should follow.

5. **Should feedback card padding match?** ChoiceButton uses `p-4`, Feedback uses `p-3`. Small difference but contributes to the "different app" feel.

---

## Possible Approaches (Not Decided)

### Option A: Revert to text-sm everywhere + unify badges

- Revert stem and choice text to `text-sm`
- Add circular badge to feedback answer cards
- Align gap and padding between ChoiceButton and Feedback answer cards
- Smallest diff, most consistent with the rest of the app

### Option B: Keep text-base + promote feedback to match

- Keep `text-base` for stem and choices (the "reading experience" argument)
- Bump feedback answer text to `text-base` to match
- Add circular badge to feedback cards
- Feedback explanations stay at `text-sm` (subordinate to the answer text)

### Option C: Mixed — text-base stem, text-sm everything else

- Keep `text-base` for the question stem only (it's the primary reading content)
- Revert choice text to `text-sm`
- This makes choices match feedback, and the stem stands out as the most important text

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-05 | Created BS-043 | Visual review showed typography and badge treatment diverged after BUG-155/157 |
| 2026-03-05 | Defer until after DEBT-279 contrast fix | Contrast compliance is P1; typography unification is P2 |
