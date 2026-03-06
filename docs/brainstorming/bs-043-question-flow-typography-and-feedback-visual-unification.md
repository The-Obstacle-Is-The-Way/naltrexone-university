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

## Dark-Mode Specific Observations (2026-03-06 Visual Review)

After DEBT-279 and DEBT-280 landed, a dark-mode review of the Quick Practice page confirmed all of the above and surfaced additional dark-mode-specific inconsistencies:

### 1. Badge treatment is the most jarring issue

In the feedback cards, answer labels render as plain inline text (`A)`, `B)`, `C)`) while the choice buttons above use polished circular badges (`h-7 w-7 rounded-full border bg-muted`). On the dark background, the plain text labels look like placeholder/debug output next to the choice buttons' styled circles. This is the single highest-impact fix.

**Code locations:**
- Choice button badge: `choice-button.tsx:59-68` — `<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full ...">`
- Feedback label: `feedback.tsx:71` / `feedback.tsx:156` / `feedback.tsx:179` — `<span className="shrink-0">{choice.displayLabel})</span>` (plain text)

### 2. Background shading creates visual discontinuity

The feedback panel sits inside a `<Card>` (`bg-card` = `#121212` in dark mode), while individual cards within it use different backgrounds:

| Feedback sub-card | Classes | Composited dark-mode color |
|-------------------|---------|---------------------------|
| Correct answer | `bg-success/5` | Very faint green on `#121212` |
| Your answer (wrong) | `bg-destructive/5` | Very faint red on `#121212` |
| "Why wrong" cards | `bg-background/50` | `#000000` at 50% on `#121212` → darker than parent |
| Choice buttons (pre-submit) | `bg-muted/20` | `#1C1C1C` at 20% on card |

The "Why other answers are wrong" cards appear as a noticeably **different shade of black** from both the parent card and the choice buttons above. This makes the feedback section feel like a separate component from a different app.

### 3. Text shrinks after submission

The same answer text (e.g., "Clearance is reduced by approximately 75%...") renders at `text-base` (16px) in the choice button, then at `text-sm` (14px) in the feedback card. On dark mode, this size change is more noticeable because there's less visual chrome to distract from it.

### 4. Clinical pearl callout works well

The clinical pearl treatment (`border-l-2 border-foreground/40 pl-3` with uppercase label) actually looks good in dark mode. This should be preserved as-is during any unification work.

---

## Recommended Approach (Updated 2026-03-06)

**Option B (Keep text-base + promote feedback to match)** is the strongest path:

1. **Badge unification** (highest impact, smallest diff): Extract a shared `AnswerBadge` component or shared class constant for the circular `h-7 w-7 rounded-full` treatment. Use it in both `choice-button.tsx` and `feedback.tsx`. This alone fixes the most jarring inconsistency.

2. **Typography alignment**: Bump feedback answer text from `text-sm` → `text-base` to match pre-submission. Keep explanation text at `text-sm` (it's subordinate content).

3. **Layout alignment**: Change feedback card inner layout from `gap-1` → `gap-3` and `p-3` → `p-4` to match choice button spacing.

4. **Background harmonization**: Consider changing "Why wrong" cards from `bg-background/50` to `bg-muted/20` (matching choice button base) so they feel like the same design system.

5. **Keep clinical pearl as-is**: The `border-l-2` callout treatment is good.

**What NOT to change:**
- Verdict colors (`border-success`, `border-destructive`, their fills) — these are correct and WCAG-compliant
- The overall Card wrapper structure
- Reference section typography (`text-xs`) — this is intentionally subordinate

---

## Implementation Priority

This should be the **next dark-mode UI debt** after DEBT-280 merges. The badge unification alone (item 1) would be a high-value, low-risk change that could ship independently.

**Suggested DEBT ticket:** DEBT-281 — Feedback card visual unification with choice buttons

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-05 | Created BS-043 | Visual review showed typography and badge treatment diverged after BUG-155/157 |
| 2026-03-05 | Defer until after DEBT-279 contrast fix | Contrast compliance is P1; typography unification is P2 |
| 2026-03-06 | Dark-mode visual review confirmed all issues | Post-DEBT-280 review; badge treatment is highest-impact fix |
| 2026-03-06 | Recommend Option B (promote feedback to match) | Keeps `text-base` reading experience, unifies badge + layout + spacing |
