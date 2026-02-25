# BS-033: Question Display Formatting and Feedback UX

**Date:** 2026-02-25
**Triggered by:** Visual review of Quick Practice question display (zopiclone/methadone question)
**Scope:** Multiple formatting and UX issues in how practice questions render — spanning MDX content, seed parsing, and React components
**Related:** `components/question/feedback.tsx`, `components/question/question-card.tsx`, `components/markdown/Markdown.tsx`, `scripts/seed-helpers.ts`

---

## The Problems

Twenty-two issues identified from manual review + two Chrome agent audits (review mode + Quick Practice pre/post answer) + code trace validation. Each is traced to its **root layer** in the pipeline.

### Problem 1: No visual break between question scenario and actual question

**What the user sees:**
> An addiction psychiatrist is reviewing the safety of prescribing zopiclone to a patient on methadone maintenance treatment for opioid use disorder who reports persistent insomnia.
> The patient has a history of obstructive sleep apnea.
> Which of the following represents the most significant safety concern in this patient?

All three sentences run together as one block. The clinical scenario and the actual question ("Which of the following...") should be visually separated.

**Root layer:** **Content (MDX)**

The `stemMd` is stored and rendered as raw markdown via `react-markdown`. If there's no blank line between the scenario paragraph and the question paragraph in the MDX source, `react-markdown` renders them as a single `<p>`. Adding a blank line in the MDX would produce separate `<p>` tags.

**However**, even with separate `<p>` tags, the `<Markdown>` component applies no prose styling — no `prose` class from Tailwind Typography is used. Default `<p>` margins may be minimal or collapsed.

**Fix options:**
- (A) **Content fix:** Ensure all MDX stems have a blank line before "Which of the following..." (affects all ~958 questions in `content/drafts/`)
- (B) **Component fix:** Add Tailwind Typography (`prose prose-sm`) to the `<Markdown>` component or add spacing between `<p>` tags via CSS (e.g., `[&_p+p]:mt-3`)
- (C) **Both:** Fix content for semantic correctness AND add prose styling for visual spacing

**Recommendation:** Option C. The blank line is semantically correct markdown. The prose styling ensures visual separation regardless.

**Files involved:**
- `components/markdown/Markdown.tsx:15` — no prose class applied to wrapper `<div>`
- `content/questions/imported/**/*.mdx` (gitignored) — stem content
- `content/drafts/questions/**/*.md` (gitignored) — draft source content

---

### Problem 2: Entire feedback card has green/red background — too visually heavy

**What the user sees:** After answering correctly, the ENTIRE explanation box (Correct label + Explanation + Why other answers are wrong + Reference) is wrapped in a dark green border with green-tinted background (`border-success bg-success/10`). For incorrect answers, it's red.

**Root layer:** **React component (`feedback.tsx`)**

```tsx
// feedback.tsx:44-49
<Card
  className={cn(
    isCorrect && 'border-success bg-success/10',
    !isCorrect && 'border-destructive bg-destructive/10',
  )}
>
```

The green/red styling is applied to the outermost `<Card>` wrapper, coloring everything inside.

**User's preference:** The green should be limited — perhaps just around the "Correct" label or the correct answer choice, not the entire explanation block.

**Fix options:**
- (A) **Minimal color:** Remove `bg-success/10` from Card. Keep only a subtle left border or top accent: `border-l-4 border-l-success` (like a callout)
- (B) **Scoped color:** Move green/red to only the "Correct"/"Incorrect" label pill, leave the Card neutral
- (C) **Reduced opacity:** Lower `bg-success/10` to `bg-success/5` for a more subtle tint
- (D) **Split cards:** Separate the result badge from the explanation into visually distinct sections

**Recommendation:** Option B — a compact colored badge for "Correct"/"Incorrect" with the rest of the Card in neutral `bg-background`. This follows UX best practice of minimal color to convey status without overwhelming the reading experience.

**File involved:** `components/question/feedback.tsx:44-49`

---

### Problem 3: "Explanation" heading is redundant — should show the correct answer instead

**What the user sees:**
> **Correct**
> **Explanation**
> Zopiclone is contraindicated in patients with severe respiratory impairment...

**User's preference:** Instead of the word "Explanation", show the correct answer text so the reader can immediately see what the right answer was, then read the explanation below:
> **Correct**
> **B) Severe respiratory impairment plus methadone and zopiclone can cause fatal respiratory depression**
> Zopiclone is contraindicated in patients with severe respiratory impairment...

**Root layer:** **React component (`feedback.tsx`)**

```tsx
// feedback.tsx:56
<div className="text-sm font-medium text-foreground">Explanation</div>
```

The hardcoded "Explanation" label adds no information. Replacing it with the correct choice's display label + text would reinforce learning.

**Fix:** The `choiceExplanations` prop already contains the correct choice (with `isCorrect: true`). Extract it and render `{correctChoice.displayLabel}) {correctChoice.textMd}` instead of the static "Explanation" text.

**File involved:** `components/question/feedback.tsx:56`

---

### Problem 4: Clinical pearl needs visual separation

**What the user sees:** The clinical pearl runs inline immediately after the main explanation paragraph with no visual break:
> ...is potentially fatal.
> **Clinical pearl:** The opioid-sedative interaction is a leading cause...

**User's preference:** A blank line before "Clinical pearl:" and possibly a line break after the colon so the pearl content reads as a distinct callout.

**Root layer:** **Content (MDX)** — partially. **Component (Markdown.tsx)** — partially.

In the MDX, `**Clinical pearl:**` is likely on the same line or in the same paragraph as the preceding text. If there's a blank line before it in the markdown source, `react-markdown` would render it as a separate `<p>`. But even with separate `<p>` tags, the lack of prose styling (Problem 1) means minimal visual separation.

**Fix options:**
- (A) **Content fix:** Ensure a blank line before `**Clinical pearl:**` in all MDX explanations
- (B) **Component fix:** Add prose styling to `<Markdown>` (same fix as Problem 1)
- (C) **Component enhancement:** Detect `**Clinical pearl:**` pattern in the Markdown renderer and render it as a styled callout box (more ambitious but better UX)
- (D) **Content restructuring:** Make clinical pearl a separate section in the MDX format (e.g., `## Clinical Pearl`) and parse it separately like we do with references

**Recommendation:** Option B covers this (same prose fix as Problem 1). Option C or D would be a nice future enhancement but is not essential.

**Files involved:**
- `components/markdown/Markdown.tsx:15` — same prose styling fix
- `content/questions/imported/**/*.mdx` — content formatting

---

### Problem 5: "Why other answers are wrong" — confusing short-label prefix

**What the user sees:**
> **A) Zopiclone is contraindicated with methadone due to a CYP enzyme interaction that dramatically increases methadone levels**
> CYP interaction increasing methadone: While drug interactions should always be checked, the primary concern here is the additive respiratory depression...

The line "CYP interaction increasing methadone:" is a short summary label before the colon, followed by the actual explanation. This is confusing because:
1. It partially restates the wrong answer (redundant — the answer text is already shown in bold above)
2. The short label reads like an assertion rather than a refutation ("CYP interaction increasing methadone" sounds like it's affirming the interaction exists)
3. The colon-separated format is unusual and hard to parse

**Root layer:** **Content (MDX)** — this is an authoring convention issue

The `parseChoiceExplanations()` function in `scripts/seed-helpers.ts:83-88` captures everything after the label as `explanationMd`:
```
- A) CYP interaction increasing methadone: While drug interactions should always be checked...
```
becomes: `label=A`, `explanationMd="CYP interaction increasing methadone: While drug interactions should always be checked..."`

The short-label-colon-explanation format is an authoring convention in the draft questions. Some questions use it (zopiclone), others don't (baranyi-2022-002 uses a cleaner format: `- A) Two SUDs together is polysubstance use, not dual disorders`).

**Fix options:**
- (A) **Content fix:** Standardize the authoring convention — wrong answer explanations should NOT repeat/summarize the choice text. They should directly explain why the answer is wrong: `- A) While drug interactions should always be checked, the primary concern here is the additive respiratory depression from combining a sedative-hypnotic with an opioid in a patient with sleep apnea, not a pharmacokinetic interaction.`
- (B) **Programmatic fix:** Strip any text before the first colon in `explanationMd` if it matches a "summary: explanation" pattern (fragile and risky — colons appear in medical text)
- (C) **Authoring guide update:** Update `docs/content/question-format-spec.md` with explicit guidance on wrong-answer explanation format

**Recommendation:** Option A + C. Fix the content convention and document it. The programmatic approach is too fragile for medical text.

**Files involved:**
- `docs/content/question-format-spec.md` — authoring guide
- `content/drafts/questions/**/*.md` — draft content (need bulk review)
- `scripts/seed-helpers.ts:35-101` — parsing logic (no code change needed, just understanding)

---

### Problem 6: Inconsistency in wrong-answer explanation format across questions

**What the user sees:** Some questions have well-formatted wrong-answer explanations:
```markdown
- A) Two SUDs together is polysubstance use, not dual disorders
- C) Anxiety and personality disorders are not included in the "serious mental illness" definition
```

Others have the confusing short-label format:
```markdown
- A) CYP interaction increasing methadone: While drug interactions should always be checked...
```

And most placeholder questions have NO "Why other answers are wrong" section at all (the Feedback component hides the section entirely if ANY wrong choice is missing an explanation — `feedback.tsx:34-41`).

**Root layer:** **Content (MDX)** — authoring inconsistency

The all-or-nothing display rule is in `feedback.tsx:40-41`:
```tsx
const shouldRenderChoiceExplanations =
  !hasMissingIncorrectExplanation && visibleChoiceExplanations.length > 0;
```

If even one wrong choice lacks an explanation, ALL wrong-answer explanations are hidden. This is intentional (prevents partial display) but means many questions show no wrong-answer feedback at all.

**Open question:** Should we relax this to show whatever explanations exist? Or keep the all-or-nothing approach to motivate complete content?

**Files involved:**
- `components/question/feedback.tsx:34-41` — all-or-nothing filter
- All MDX content files — completeness varies

---

### Problem 7: Text size feels small

**What the user sees:** Overall text in the question card and feedback feels small.

**Root layer:** **React components**

Both `question-card.tsx:35` and `feedback.tsx:56-58` use `text-sm` (14px). For a reading-heavy medical education context, `text-base` (16px) may be more appropriate for body content.

**Fix:** Change `text-sm` to `text-base` on the `<Markdown>` wrappers for stem and explanation content. Keep `text-sm` for metadata/labels.

**Files involved:**
- `components/question/question-card.tsx:35` — stem text size
- `components/question/feedback.tsx:56-58` — explanation text size
- `components/question/choice-button.tsx:60` — choice text size

---

### Problem 8: "Correct"/"Incorrect" label reads as body text, not a verdict

*(Added from Chrome agent audit 2026-02-25)*

**What the user sees:** "Correct" is rendered as `text-sm font-semibold` — same visual weight as the "Explanation" heading below it. It doesn't stand out as a verdict/result. It should feel like a badge or chip — immediately communicating the outcome.

**Root layer:** **React component (`feedback.tsx`)**

```tsx
// feedback.tsx:51-53
<div className="text-sm font-semibold text-foreground">
  {isCorrect ? 'Correct' : 'Incorrect'}
</div>
```

**Fix:** Style as a compact badge/chip with colored background — e.g., `inline-flex rounded-full px-3 py-1 text-sm font-semibold bg-success/15 text-success` for correct, `bg-destructive/15 text-destructive` for incorrect. This replaces the current approach of coloring the entire Card (Problem 2) with a focused, intentional color indicator.

**File involved:** `components/question/feedback.tsx:51-53`

---

### Problem 9: "Reference" label not visually differentiated from citation text

*(Added from Chrome agent audit 2026-02-25)*

**What the user sees:** The "Reference" label and the citation text below it (e.g., "Stahl SM. Stahl's Essential Psychopharmacology...") are both rendered in muted gray at the same weight. There's no visual distinction between the section label and the content.

**Root layer:** **React component (`feedback.tsx`)**

```tsx
// feedback.tsx:93-96
<div className="text-xs font-medium text-muted-foreground">Reference</div>
<Markdown content={referenceMd} className="mt-1 text-xs" />
```

Both use `text-xs` and similar muted coloring. The label should be slightly bolder, uppercased, or otherwise differentiated.

**Fix:** Add `uppercase tracking-wide` to the Reference label, or bump it to `font-semibold`.

**File involved:** `components/question/feedback.tsx:93-94`

---

### Problem 10: "Correct"/"Incorrect" and "Explanation" headings too close together

*(Added from Chrome agent audit 2026-02-25)*

**What the user sees:** "Correct" at the top of the feedback card and "Explanation" directly below have almost no gap. They read as one label rather than a status indicator + section heading.

**Root layer:** **React component (`feedback.tsx`)**

The gap is `mt-4` (16px) between the verdict and the explanation block. With the verdict being small body text (Problem 8), this gap feels insufficient.

**Fix:** If Problem 8 is fixed (verdict becomes a badge), the visual distinction improves automatically. Additionally, increasing the gap to `mt-6` would help.

**File involved:** `components/question/feedback.tsx:55`

---

### Problem 11: Gap between question stem and first answer choice feels tight

*(Added from Chrome agent audit 2026-02-25)*

**What the user sees:** The space between the end of the question stem and the first answer choice (A) is noticeably tighter than the generous card-to-card gaps between choices.

**Root layer:** **React component (`question-card.tsx`)**

```tsx
// question-card.tsx:37
<fieldset className="mt-6 space-y-3">
```

`mt-6` (24px) from stem to choices, `space-y-3` (12px) between choices. The stem-to-choices gap should feel larger since it separates two distinct sections (reading vs. selecting).

**Fix:** Increase `mt-6` to `mt-8` for more breathing room between stem and choices.

**File involved:** `components/question/question-card.tsx:37`

---

### Problem 12: Wrong-answer cards in explanation repeat full answer text (redundant vertical space)

*(Added from Chrome agent audit 2026-02-25)*

**What the user sees:** Each wrong-answer card in the "Why other answers are wrong" section repeats the FULL choice text in bold (e.g., "A) Zopiclone is contraindicated with methadone due to a CYP enzyme interaction that dramatically increases methadone levels"), even though the learner just read these in the answer choices above.

This is different from Problem 5 (confusing short-label convention). This is about the `textMd` being rendered in full at the top of each wrong-answer card.

**Root layer:** **React component (`feedback.tsx`)**

```tsx
// feedback.tsx:77-80
<div className="flex items-start gap-1 text-sm font-medium text-foreground">
  <span className="shrink-0">{choice.displayLabel})</span>
  <Markdown content={choice.textMd} />
</div>
```

The full `choice.textMd` is rendered for each wrong answer. The learner already saw these options above.

**Fix options:**
- (A) **Remove choice text entirely:** Just show the label (e.g., "A)") and the explanation below. The reader can glance up to recall what A was.
- (B) **Truncate or summarize:** Show first N characters with ellipsis (fragile for medical text).
- (C) **Keep as-is but reduce styling:** Make the choice text smaller/lighter so it feels like a reference, not a heading.
- (D) **Collapse by default:** Show just the label, expand on click to reveal full text + explanation.

**Recommendation:** Option C — keep the text but reduce its visual weight. It serves as a reference anchor. Use `text-muted-foreground` instead of `text-foreground` and drop `font-medium`.

**File involved:** `components/question/feedback.tsx:77-80`

---

### Problem 13: Choice card letter badges have weak contrast

*(Added from Chrome agent Quick Practice audit 2026-02-25)*

**What the user sees:** The A/B/C/D letter circles use a very dark gray fill on a near-black card background. The differentiation is subtle — they don't pop as scannable navigation anchors.

**Root layer:** **React component (`choice-button.tsx`)**

```tsx
// choice-button.tsx:49-51
<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
  border border-border bg-background text-xs font-semibold leading-none text-foreground">
```

**Fix:** Increase contrast — e.g., `bg-muted` or `bg-accent` fill with `text-foreground` text. The badge should be immediately visible as a letter without squinting.

**File involved:** `components/question/choice-button.tsx:49-51`

---

### Problem 14: No hover or focus states on choice cards

*(Added from Chrome agent Quick Practice audit 2026-02-25)*

**What the user sees:** On desktop, hovering over an unselected choice card produces no visible feedback — no border brightening, no background shift. The cards feel inert until clicked. Also, no visible focus ring for keyboard navigation, which is a WCAG 2.1 AA requirement.

**Root layer:** **React component (`choice-button.tsx`)**

The component does have `hover:bg-muted` when not disabled (`choice-button.tsx:29`), but the visual effect may be too subtle on dark backgrounds. There is a `focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]` (`choice-button.tsx:28`), but it should be verified that it's visible enough.

**Fix:** Verify hover and focus states are visually perceptible on dark backgrounds. May need to increase contrast of hover state (e.g., `hover:bg-muted/80` or `hover:border-muted-foreground`). Ensure focus ring meets WCAG contrast requirements.

**File involved:** `components/question/choice-button.tsx:28-29`

---

### Problem 15: Button hierarchy — Submit/Next/Bookmark all same weight; no post-submit state change

*(Added from Chrome agent Quick Practice audit 2026-02-25)*

**What the user sees:**

**Pre-submit:** Submit, Next →, and Bookmark are all styled at essentially the same visual weight. None reads as the clear primary action. Submit should be the sole primary (filled, accent-colored) button. Next → arguably should be hidden or visually suppressed before submission to prevent accidental skipping.

**Post-submit:** The button bar is unchanged — Submit remains at the same weight despite being semantically meaningless after the answer is locked in. Next → should be promoted to primary. Submit should be hidden or disabled.

**Root layer:** **React component (practice-view or quick-practice-client)**

This is about the action bar rendering logic, which likely lives in the practice view components. The button states need to be conditional on whether an answer has been submitted.

**Fix:** Pre-submit: Submit = filled primary, Next = ghost/secondary, Bookmark = icon-only or tertiary. Post-submit: Hide Submit, promote Next → to filled primary, keep Bookmark as secondary.

**Files involved:** `app/(app)/app/practice/components/practice-view.tsx` (or wherever the action bar is rendered)

---

### Problem 16: "Back to Practice" link lacks arrow/affordance

*(Added from Chrome agent Quick Practice audit 2026-02-25)*

**What the user sees:** "Back to Practice" in the top right is plain gray text — no left-facing arrow, no chevron, easy to miss. Standard pattern is `← Back to Practice` with an arrow icon.

**Root layer:** **React component**

**Fix:** Add a `←` or `ChevronLeft` icon before the text.

**File involved:** Quick Practice page header component

---

### Problem 17: Post-submit auto-scroll to feedback needed

*(Added from Chrome agent Quick Practice audit 2026-02-25)*

**What the user sees:** After submitting, the feedback card (verdict + explanation + wrong-answer breakdown + reference) requires ~2.5 screen lengths of scrolling. The most critical information — the verdict and correct answer — may be partially below the fold. The question card stays fully rendered above, taking up space.

**Root layer:** **React component**

**Fix:** After submission, auto-scroll to bring the top of the feedback card into the viewport. Use `scrollIntoView({ behavior: 'smooth', block: 'start' })` on the feedback element.

**File involved:** Practice view component (wherever submit triggers re-render)

---

### Problem 18: User's selected wrong answer not labeled "Your answer" in wrong-answer cards

*(Added from Chrome agent Quick Practice audit 2026-02-25)*

**What the user sees:** In the "Why other answers are wrong" section, the user's selected (incorrect) answer is listed as just another wrong-answer card — no indicator that "this is what you picked." A small "Your answer" chip on the selected wrong-answer card would help the learner connect their mistake to the explanation.

**Root layer:** **React component (`feedback.tsx`)**

The `choiceExplanations` data doesn't currently include which choice the user selected — it only has `isCorrect`. The selected choice ID would need to be passed through as an additional prop.

**Fix:** Add `selectedChoiceId` to `FeedbackProps`. In the wrong-answer cards, if `choice.choiceId === selectedChoiceId`, render a subtle "Your answer" badge.

**Files involved:** `components/question/feedback.tsx`, `app/(app)/app/practice/components/practice-view.tsx` (to pass the prop)

---

### Problem 19: Unchosen wrong answers have no visual indicator post-submit

*(Added from Chrome agent Quick Practice audit 2026-02-25)*

**What the user sees:** After submission, only the selected wrong answer (red) and the correct answer (green) get color treatment. Unchosen wrong answers (A, D in this case) are dimmed via `opacity-50` but have no explicit wrong indicator (no ✗ icon, no "Incorrect" label). They're passive — dimmed but ambiguous. UWorld dims all wrong choices and adds a small ✗ to each.

**Root layer:** **React component (`choice-button.tsx`)**

Currently, `correctness` is only set for the correct answer and the user's selected answer (`question-card.tsx:41-48`). Unchosen wrong answers get `correctness: null` and are dimmed via `disabled && !correctness && 'opacity-50'` (`choice-button.tsx:31`).

**Fix options:**
- (A) Set `correctness: 'incorrect'` on ALL wrong answers (not just the selected one) — but this would color them all red, which is too heavy
- (B) Add a new state like `correctness: 'wrong-unselected'` that dims the card and adds a subtle ✗ without full red treatment
- (C) Keep existing dimming, add a small ✗ badge or "Incorrect" micro-label to unselected wrong answers

**Recommendation:** Option B or C — build on the existing `opacity-50` dimming by adding an explicit wrong indicator.

**Files involved:** `components/question/choice-button.tsx`, `components/question/question-card.tsx`

---

### Problem 20: Filter tabs (Unanswered/Incorrect/Bookmarked) — affordance, counts, touch targets

*(Added from Chrome agent Quick Practice audit 2026-02-25)*

**What the user sees:**
- "Incorrect" and "Bookmarked" tabs look completely disabled, not just inactive — dim gray text with no affordance that they're tappable
- No question counts shown (e.g., "Unanswered (48)")
- Touch targets appear small (under the 44×44px minimum recommended by Apple HIG / WCAG)

**Root layer:** **React component**

**Fix:** Give inactive tabs a visible border or subtle background to signal "clickable." Add question count to each tab. Ensure minimum 44px hit target height.

**Files involved:** Quick Practice page component (wherever filter tabs are rendered)

---

## Pipeline Map: Where Each Fix Lives

| Problem | MDX Content | Seed Script | React Component |
|---------|:-----------:|:-----------:|:---------------:|
| 1. Stem paragraph break | Yes | — | Yes (prose) |
| 2. Green/red box too heavy | — | — | **Yes** |
| 3. "Explanation" redundant | — | — | **Yes** |
| 4. Clinical pearl spacing | Yes | — | Yes (prose) |
| 5. Confusing short-label | **Yes** | — | — |
| 6. Inconsistent explanations | **Yes** | — | Maybe |
| 7. Text size | — | — | **Yes** |
| 8. Verdict needs badge styling | — | — | **Yes** |
| 9. Reference label undifferentiated | — | — | **Yes** |
| 10. Verdict/Explanation gap too tight | — | — | **Yes** |
| 11. Stem-to-choices gap too tight | — | — | **Yes** |
| 12. Wrong-answer cards repeat full text | — | — | **Yes** |
| 13. Choice badge contrast weak | — | — | **Yes** |
| 14. No hover/focus states | — | — | **Yes** |
| 15. Button hierarchy + post-submit state | — | — | **Yes** |
| 16. "Back to Practice" lacks arrow | — | — | **Yes** |
| 17. Auto-scroll to feedback post-submit | — | — | **Yes** |
| 18. "Your answer" label on wrong choice | — | — | **Yes** |
| 19. Unchosen wrong answers unstyled | — | — | **Yes** |
| 20. Filter tab affordance/counts/sizing | — | — | **Yes** |

**Key insight:** Problems 2, 3, 7–20 are pure React component changes — no content migration needed. Problems 1 and 4 share the same fix (add prose styling to `<Markdown>`). Problems 5 and 6 are content authoring issues requiring a documentation + bulk content update.

---

## Severity Assessment

| Problem | Severity | Affected Users | Frequency |
|---------|----------|---------------|-----------|
| 1. Stem break | High | All | Every question |
| 2. Green/red box | Medium | All | Every answered question |
| 3. "Explanation" label | Medium | All | Every answered question |
| 4. Clinical pearl | High | All | Questions with clinical pearls |
| 5. Short-label format | Medium | All | Subset of questions |
| 6. Inconsistency | Low | All | Varies by question |
| 7. Text size | Low | All | Every question |
| 8. Verdict badge styling | High | All | Every answered question |
| 9. Reference label | Low | All | Questions with references |
| 10. Verdict/Explanation gap | Low | All | Every answered question |
| 11. Stem-to-choices gap | Low | All | Every question |
| 12. Wrong-answer text repetition | Medium | All | Questions with per-choice explanations |
| 13. Choice badge contrast | Medium | All | Every question |
| 14. No hover/focus states | Medium | All (accessibility) | Every question |
| 15. Button hierarchy + post-submit | High | All | Every question |
| 16. "Back to Practice" affordance | Low | All | Every page load |
| 17. Auto-scroll post-submit | High | All | Every answered question |
| 18. "Your answer" label | Medium | All | Every incorrect answer |
| 19. Unchosen wrong answer styling | Low | All | Every answered question |
| 20. Filter tab affordance/counts | Medium | All | Every page load |

None are blockers, but together they significantly degrade the reading experience for a medical education product where clarity is paramount.

**Note:** Severity for Problems 1, 4, 8, 15, 17 rated High — these are the most impactful visual/interaction issues confirmed across both Chrome agent audits.

---

## Code Validation

Validated against:
- `components/question/feedback.tsx`
- `components/question/question-card.tsx`
- `components/question/choice-button.tsx`
- `components/markdown/Markdown.tsx`
- `app/(app)/app/practice/components/practice-view.tsx`
- `app/(app)/app/practice/quick/quick-practice-client.tsx`
- `app/(app)/app/questions/[slug]/question-page-client.tsx`

Also traced supporting shared logic:
- `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts`
- `app/(app)/app/practice/shared/use-question-flow-core.ts`
- `app/(app)/app/practice/practice-page-logic.ts`
- `components/ui/segmented-control.tsx`
- `components/ui/tab-switch-styles.ts`
- `components/ui/button.tsx`

### Per-Problem Validation

| # | Validation Result | File/Line Validation | Notes / Corrections |
|---|-------------------|----------------------|---------------------|
| 1 | Confirmed | `components/markdown/Markdown.tsx:15`, `components/question/question-card.tsx:35` | Analysis is correct. `Markdown` adds no prose paragraph spacing. |
| 2 | Confirmed | `components/question/feedback.tsx:44` | Entire feedback card gets success/destructive tint (`bg-success/10` / `bg-destructive/10`). |
| 3 | Confirmed | `components/question/feedback.tsx:56` | Static `Explanation` heading is hardcoded. |
| 4 | Confirmed (content + renderer) | `components/markdown/Markdown.tsx:15` | Correct diagnosis: blank lines in MDX matter, and renderer styling is minimal. |
| 5 | Confirmed | `scripts/seed-helpers.ts:83` | Correct root cause is content convention; parser preserves text before/after colon. |
| 6 | Confirmed | `components/question/feedback.tsx:34` | All-or-nothing wrong-answer render logic is implemented exactly as described. |
| 7 | Confirmed | `components/question/question-card.tsx:35`, `components/question/feedback.tsx:56`, `components/question/choice-button.tsx:60` | `text-sm` is used across stem, feedback body, and choice body. |
| 8 | Confirmed | `components/question/feedback.tsx:51` | Verdict is body-like text, not badge/chip styling. |
| 9 | Confirmed | `components/question/feedback.tsx:93` | Reference label and content are similarly muted/small. |
| 10 | Confirmed | `components/question/feedback.tsx:55` | Verdict and explanation block separated only by `mt-4`. |
| 11 | Confirmed | `components/question/question-card.tsx:37` | Stem-to-choices gap is `mt-6`. |
| 12 | Confirmed | `components/question/feedback.tsx:77` | Wrong-answer cards repeat full `choice.textMd`. |
| 13 | Confirmed | `components/question/choice-button.tsx:50` | Badge uses `bg-background` + border; low contrast on dark theme. |
| 14 | Partially Correct | `components/question/choice-button.tsx:28` | Correction: hover/focus states do exist in code (`hover:bg-muted`, `focus-within:ring`), but visual strength can still be too subtle. |
| 15 | Partially Correct | `app/(app)/app/practice/components/practice-view.tsx:270`, `app/(app)/app/practice/practice-page-logic.ts:33`, `app/(app)/app/practice/shared/use-question-flow-core.ts:99` | Correction: pre-submit hierarchy is already differentiated (`Submit` default variant, `Next`/`Bookmark` outline). Confirmed: post-submit state change is weak (Submit remains present but disabled; Next is not promoted). |
| 16 | Confirmed | `app/(app)/app/practice/quick/quick-practice-client.tsx:72`, `app/(app)/app/practice/components/practice-view.tsx:147` | Back link label is plain “Back to Practice” with no arrow/icon. |
| 17 | Confirmed | `app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts:127` | No `scrollIntoView` exists; only focus recovery (`questionAreaRef.current?.focus()`). |
| 18 | Confirmed | `components/question/feedback.tsx:15` | `FeedbackProps` has no `selectedChoiceId`; wrong-answer cards cannot tag “Your answer.” |
| 19 | Partially Correct | `components/question/question-card.tsx:41`, `components/question/choice-button.tsx:31` | Correction: unselected wrong answers are already dimmed post-submit via `disabled && !correctness && 'opacity-50'`. Missing indicator is specifically lack of explicit wrong marker/badge. |
| 20 | Partially Correct | `app/(app)/app/practice/quick/quick-practice-client.tsx:76`, `components/ui/tab-switch-styles.ts:15` | Confirmed: no counts in tab labels; touch target may be below 44px (`py-1.5` + text). Correction: tabs are not disabled, but inactive affordance is weak. |

### Shared vs Divergent Rendering (Quick Practice vs Review Mode)

- Shared rendering path:
  - `QuestionCard` (`components/question/question-card.tsx`)
  - `ChoiceButton` (`components/question/choice-button.tsx`)
  - `Feedback` (`components/question/feedback.tsx`)
  - `Markdown` (`components/markdown/Markdown.tsx`)
- Divergent page composition/state:
  - Quick Practice: `quick-practice-client.tsx` -> `PracticeView` + `usePracticeQuestionFlow`
  - Review Mode: `question-page-client.tsx` (`QuestionView`) + `useQuestionPageController`
- Divergent action bars:
  - Quick Practice action bar in `practice-view.tsx:249`
  - Review action bar in `question-page-client.tsx:298`

### New Problems Discovered During Code Trace

#### Problem 21: Review-mode hydration flicker (transient non-review UI)

`QuestionView` initially renders with `submitResult = null`, so the submit button is shown (`question-page-client.tsx:327`) until `loadPreviousAttempt` finishes asynchronously (`use-question-page-controller.ts:225`). This can briefly show attempt-mode controls in a review route before it switches to read-only review state.

#### Problem 22: Feedback uses assertive live region for long content

`Feedback` uses `role="alert"` (`components/question/feedback.tsx:45`), which is assertive and can force immediate screen-reader interruption for large blocks (verdict + explanation + wrong answers + reference). For this size/content type, `role="status"` or a smaller assertive announcement element may be more appropriate.

### Existing Tests Likely Affected by UI Changes

- `components/question/Feedback.test.tsx`
- `components/question/ChoiceButton.test.tsx`
- `components/question/ChoiceButton.browser.spec.tsx`
- `components/question/QuestionCard.test.tsx`
- `components/question/QuestionCard.browser.spec.tsx`
- `components/markdown/Markdown.test.tsx`
- `app/(app)/app/practice/components/practice-view.test.tsx`
- `app/(app)/app/practice/components/practice-view.browser.spec.tsx`
- `app/(app)/app/practice/components/practice-view-notification.browser.spec.tsx`
- `app/(app)/app/practice/quick/quick-practice-client.test.tsx`
- `app/(app)/app/practice/quick/quick-practice-client.browser.spec.tsx`
- `app/(app)/app/questions/[slug]/question-page-client.test.tsx`
- `components/theme-token-regression.test.tsx`
- `tests/e2e/practice.spec.ts` (currently asserts literal “Explanation” text)
- `tests/e2e/subscribe-and-practice.spec.ts` (currently asserts literal “Explanation” text)

## Playwright Validation

Validation run target:
- `https://naltrexone-university-git-dev-john-h-jungs-projects.vercel.app`

Temporary script used (not committed):
- `.tmp-bs033-playwright-check.mjs`

Artifacts:
- `artifacts/bs-033-playwright/01-quick-pre-answer.png`
- `artifacts/bs-033-playwright/02-quick-post-answer.png`
- `artifacts/bs-033-playwright/03-review-mode-question.png`
- `artifacts/bs-033-playwright/run-result.json`

Captured review URL:
- `https://naltrexone-university-git-dev-john-h-jungs-projects.vercel.app/app/questions/stahls-zolpidem-004?from=history&mode=review&historyHref=%2Fapp%2Fhistory%3Ftab%3Dquestions%26offset%3D0%26limit%3D20&historySeq=stahls-zolpidem-004%2Cstahls-zopiclone-001%2Cstahls-zopiclone-002%2Cstahls-zopiclone-003%2Ckast-2021-003%2Cmyran-2023-012%2Cplaceholder-01-naltrexone-mechanism%2Casam-aaap-2024-stud-009%2Cmeier-2022-003%2Cplaceholder-02-buprenorphine-induction-timing%2Cnollen-2021-004%2Cstahls-zopiclone-004%2Chien-2023-004&historyIndex=0`

### Existing E2E Authentication Pattern (Clerk)

- `tests/e2e/helpers/clerk-auth.ts` signs in via password (`E2E_CLERK_USER_USERNAME` + `E2E_CLERK_USER_PASSWORD`) and most specs gate with `test.skip(!hasClerkCredentials, ...)`.
- `tests/e2e/global.setup.ts` runs:
  1. `runE2ECredentialHealthCheck()`
  2. `seedTestSubscription()`
  3. `runE2EUserStateReset()`
  4. `clerkSetup()`
- `playwright.config.ts` loads `.env.local` then `.env`, and resolves base URL from `NEXT_PUBLIC_APP_URL` (fallback `http://127.0.0.1:3000`).
- `.env.local` includes `E2E_CLERK_USER_USERNAME` and `E2E_CLERK_USER_PASSWORD` keys.

For this targeted remote validation, `clerkSetup()` + Clerk ticket-style sign-in (`emailAddress`) was used in a temporary script to ensure reliable authentication in the dev deployment context.

### Screenshot Findings

#### 01 Quick Practice (Pre-Answer)

Confirmed visually:
- Problem 1 (stem paragraphs read as one compact block)
- Problem 7 (small body text)
- Problem 13 (choice badge contrast is weak)
- Problem 16 (plain “Back to Practice” text link, no arrow affordance)
- Problem 20 (status tabs have weak inactive affordance and no counts)

Partially confirmed:
- Problem 11 (stem-to-choice separation feels modest but acceptable)
- Problem 15 pre-submit (Submit is already primary; Next/Bookmark are secondary, so “all same weight” is overstated)

#### 02 Quick Practice (Post-Answer)

Confirmed visually:
- Problem 2 (entire feedback container tinted red/green)
- Problem 3 (static “Explanation” heading)
- Problem 8 (verdict appears as text, not a prominent badge)
- Problem 10 (verdict + explanation hierarchy remains tight)
- Problem 12 (wrong-answer cards repeat full answer text)
- Problem 15 post-submit (Submit remains disabled instead of transitioning to a clearer next-step primary action)
- Problem 18 (no “Your answer” marker in wrong-answer section)

Partially confirmed:
- Problem 19 (unchosen wrong answers are dimmed, but no explicit wrong indicator)
- Problem 17 (no auto-scroll movement observed in this run; `run-result.json` shows `preSubmitY=0`, `postSubmitY=0`; question length was short enough to keep feedback in viewport)

#### 03 Review Mode

Confirmed visually:
- Shared rendering stack with Quick Practice (same `QuestionCard`, `ChoiceButton`, `Feedback`, `Markdown` output)
- Same feedback styling concerns (Problems 2, 3, 8, 10, 12) appear in review mode
- Divergent action bar behavior from Quick Practice (review-specific Prev/Try Again/Next/Back actions)

Additional observation:
- Review mode can show transient pre-hydration state before prior-attempt data resolves (Problem 21); this was reproduced during automation and aligns with controller flow.

## Implementation Priority: Component-First Strategy

**Decision (2026-02-25):** Fix everything possible at the **display/component layer first**, without touching any raw MDX content files. MDX/content-level fixes are deferred to a later phase once we know the full scope.

### NOW — Component/Display Fixes (no MDX changes)

These are all React component changes. They improve rendering of existing content as-is.

**Tier 1 — High severity, low effort (do first):**

| # | Problem | Fix | File(s) |
|---|---------|-----|---------|
| 1+4 | Stem paragraphs and clinical pearl run together | Add prose spacing to `<Markdown>` (e.g., `[&_p+p]:mt-3` or Tailwind `prose` classes) so existing `<p>` tags get visual separation | `components/markdown/Markdown.tsx` |
| 2+8 | Feedback card green/red too heavy + verdict needs badge | Remove `bg-success/10` / `bg-destructive/10` from Card wrapper. Style "Correct"/"Incorrect" as a colored badge/chip (`rounded-full px-3 py-1 bg-success/15 text-success`). Card stays neutral | `components/question/feedback.tsx` |
| 3 | "Explanation" label redundant — show correct answer | Replace static "Explanation" text with the correct answer's display label + text (data already in `choiceExplanations` prop) | `components/question/feedback.tsx` |
| 15 | Button hierarchy + post-submit state | Keep current pre-submit hierarchy (Submit already primary). Post-submit: hide/disable Submit and promote Next → to primary | `practice-view.tsx` (action bar) |
| 17 | Auto-scroll to feedback post-submit | `scrollIntoView({ behavior: 'smooth', block: 'start' })` on feedback card after submission | Practice view component |

**Tier 2 — Medium severity, low effort:**

| # | Problem | Fix | File(s) |
|---|---------|-----|---------|
| 7 | Text feels small for medical reading | Bump `text-sm` → `text-base` on stem, explanation, and choice text. Keep `text-sm` for labels/metadata | `question-card.tsx`, `feedback.tsx`, `choice-button.tsx` |
| 9 | Reference label blends with citation text | Add `uppercase tracking-wide` or `font-semibold` to "Reference" label | `components/question/feedback.tsx` |
| 10 | Verdict and explanation heading too close | Increase gap `mt-4` → `mt-6` (may resolve naturally with badge fix) | `components/question/feedback.tsx` |
| 11 | Stem-to-choices gap too tight | Increase fieldset `mt-6` → `mt-8` | `components/question/question-card.tsx` |
| 12 | Wrong-answer cards repeat full choice text | Reduce visual weight — `text-muted-foreground`, drop `font-medium` | `components/question/feedback.tsx` |
| 13 | Choice badge contrast weak | Increase badge background contrast (e.g., `bg-muted` instead of `bg-background`) | `components/question/choice-button.tsx` |
| 14 | No hover/focus states on choice cards | Verify hover/focus are perceptible on dark backgrounds. Increase contrast if needed | `components/question/choice-button.tsx` |
| 18 | User's wrong answer not labeled | Add `selectedChoiceId` prop to Feedback; show "Your answer" badge on the selected wrong choice | `feedback.tsx`, `practice-view.tsx` |

**Tier 3 — Lower severity or more involved:**

| # | Problem | Fix | File(s) |
|---|---------|-----|---------|
| 16 | "Back to Practice" lacks arrow | Add `←` or `ChevronLeft` icon before text | Quick Practice page header |
| 19 | Unchosen wrong answers have only passive dimming post-submit | Keep dimming, but add explicit indicator (e.g., subtle ✗ or “Incorrect” micro-badge) for unselected wrong answers | `choice-button.tsx`, `question-card.tsx` |
| 20 | Filter tabs: affordance, counts, touch targets | Better inactive styling, add question counts, ensure 44px min height | Quick Practice filter component |

**Total files touched:** ~6 components, 0 content files
- `components/markdown/Markdown.tsx` — prose spacing
- `components/question/feedback.tsx` — verdict badge, correct answer display, reference label, wrong-answer card styling, "Your answer" label, spacing
- `components/question/question-card.tsx` — stem-to-choices gap, unchosen wrong answer dimming
- `components/question/choice-button.tsx` — text size, badge contrast, hover/focus, post-submit dimming
- `app/(app)/app/practice/components/practice-view.tsx` — button hierarchy, auto-scroll, selectedChoiceId passthrough
- Quick Practice page components — filter tabs, back link

### LATER — MDX/Content Fixes (deferred)

These require editing raw MDX files (gitignored, ~958 questions). Deferred until we:
1. See how component fixes look with existing content
2. Know the full scope of content that needs updating
3. Decide on authoring conventions

| # | Problem | What Needs to Change | Scope |
|---|---------|---------------------|-------|
| 1 (partial) | Some stems may lack blank line between scenario and question | Add blank line before "Which of the following..." in MDX stems | ~958 MDX files (audit needed) |
| 4 (partial) | Some explanations may lack blank line before `**Clinical pearl:**` | Add blank line before clinical pearl in MDX explanations | Subset of MDX files |
| 5 | Confusing "short-label: explanation" convention | Standardize wrong-answer explanations to directly explain why wrong, without summary prefix | Subset of MDX files (audit needed) |
| 6 | Inconsistent wrong-answer explanation completeness | Some questions missing per-choice explanations entirely | Subset of MDX files |

**Also deferred:** Update authoring guide (`question-format-spec.md`) with explicit wrong-answer format rules once we decide on the convention.

### FUTURE — Enhanced Formatting & Features (optional)

Nice-to-have improvements that go beyond fixing current issues:
- Clinical pearl rendered as a styled callout box (detect `**Clinical pearl:**` pattern in Markdown component)
- Clinical pearl parsed as a separate section (like references) at the seed level
- Reference section styling improvements
- All-or-nothing wrong-answer display rule — decide whether to relax it to show partial explanations
- Question counter / progress indicator (e.g., "Question 1 of 48")
- Running score tracker / performance tally (e.g., "3/5 correct so far")
- Post-submit collapse of question card to reduce scroll burden (show only correct + selected answers, hide others)
- Difficulty / topic tag display on question card
- "Why C is correct" summary card to match wrong-answer card format (structural symmetry)

---

## Open Questions

1. **Prose styling scope:** Should `<Markdown>` always have prose classes, or only in specific contexts (stem, explanation)? Global prose could affect choice text layout in the `ChoiceButton`.
2. **Correct answer in feedback:** Show label + full text (e.g., "B) Severe respiratory impairment plus methadone...")? User preference seems to be yes.
3. **Text size:** `text-base` across the board (stem, choices, explanation), or tiered (e.g., `text-base` for stem/explanation, keep `text-sm` for choices)?
4. **Green/red on choices vs feedback:** The correct choice button already gets green border/background (`choice-button.tsx:33-34`). Is that enough, or should the feedback card keep a very subtle accent (e.g., left border)?
5. **All-or-nothing wrong-answer display:** Keep hiding all if any missing? Or show whatever exists? (Deferred — no code change needed now, but worth deciding.)

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-25 | Created BS-033 | Visual review identified 7 formatting/UX issues in question display |
| 2026-02-25 | Component-first strategy | Fix display layer without touching MDX. Defer content-level fixes until component changes are validated and content scope is assessed |
| 2026-02-25 | Integrated Chrome agent audit #1 (review mode) | Added Problems 8-12 (verdict badge, reference label, spacing gaps, wrong-answer text repetition). All component-level |
| 2026-02-25 | Integrated Chrome agent audit #2 (Quick Practice pre+post answer) | Added Problems 13-20 (badge contrast, hover/focus, button hierarchy, auto-scroll, "Your answer" label, unchosen answer dimming, filter tabs). Organized NOW into Tier 1/2/3 by severity |
| 2026-02-25 | Playwright + code trace validation | All 20 original problems confirmed against source code. 4 partially corrected (P14: hover/focus exists but subtle; P15: pre-submit hierarchy already differentiated; P19: opacity-50 dimming already exists; P20: tabs not disabled, just weak affordance). 2 new problems discovered (P21: review-mode hydration flicker; P22: role="alert" on long content). Total: 22 problems |
