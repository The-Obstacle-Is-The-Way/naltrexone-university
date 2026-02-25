# BS-033: Question Display Formatting and Feedback UX

**Date:** 2026-02-25
**Triggered by:** Visual review of Quick Practice question display (zopiclone/methadone question)
**Scope:** Multiple formatting and UX issues in how practice questions render — spanning MDX content, seed parsing, and React components
**Related:** `components/question/feedback.tsx`, `components/question/question-card.tsx`, `components/markdown/Markdown.tsx`, `scripts/seed-helpers.ts`

---

## The Problems

Seven distinct issues identified from screenshots. Each is traced to its **root layer** in the pipeline.

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

**Key insight:** Problems 2, 3, 7, 8, 9, 10, 11, 12 are pure React component changes — no content migration needed. Problems 1 and 4 share the same fix (add prose styling to `<Markdown>`). Problems 5 and 6 are content authoring issues requiring a documentation + bulk content update.

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
| 8. Verdict badge styling | Medium | All | Every answered question |
| 9. Reference label | Low | All | Questions with references |
| 10. Verdict/Explanation gap | Low | All | Every answered question |
| 11. Stem-to-choices gap | Low | All | Every question |
| 12. Wrong-answer text repetition | Medium | All | Questions with per-choice explanations |

None are blockers, but together they significantly degrade the reading experience for a medical education product where clarity is paramount.

**Note:** Severity for Problems 1 and 4 upgraded to High based on Chrome agent audit — these were confirmed as the most pressing visual issues affecting question readability.

---

## Implementation Priority: Component-First Strategy

**Decision (2026-02-25):** Fix everything possible at the **display/component layer first**, without touching any raw MDX content files. MDX/content-level fixes are deferred to a later phase once we know the full scope.

### NOW — Component/Display Fixes (no MDX changes)

These are all React component changes. They improve rendering of existing content as-is.

| # | Problem | Fix | File(s) |
|---|---------|-----|---------|
| 1+4 | Stem paragraphs and clinical pearl run together | Add prose spacing to `<Markdown>` (e.g., `[&_p+p]:mt-3` or Tailwind `prose` classes) so existing `<p>` tags get visual separation | `components/markdown/Markdown.tsx` |
| 2+8 | Feedback card green/red too heavy + verdict needs badge | Remove `bg-success/10` / `bg-destructive/10` from Card wrapper. Style "Correct"/"Incorrect" as a colored badge/chip (`rounded-full px-3 py-1 bg-success/15 text-success`). Card stays neutral | `components/question/feedback.tsx` |
| 3 | "Explanation" label is redundant | Replace static "Explanation" text with the correct answer's display label + text (data already available in `choiceExplanations` prop) | `components/question/feedback.tsx` |
| 7 | Text feels small for medical reading | Bump `text-sm` → `text-base` on stem, explanation, and choice text. Keep `text-sm` for labels/metadata | `question-card.tsx`, `feedback.tsx`, `choice-button.tsx` |
| 9 | Reference label blends with citation text | Add `uppercase tracking-wide` or `font-semibold` to "Reference" label to differentiate from citation content | `components/question/feedback.tsx` |
| 10 | Verdict and explanation heading too close | Increase gap from `mt-4` to `mt-6` between verdict badge and explanation content (may resolve naturally when verdict becomes a badge) | `components/question/feedback.tsx` |
| 11 | Stem-to-choices gap too tight | Increase fieldset `mt-6` to `mt-8` for more breathing room between reading and selecting | `components/question/question-card.tsx` |
| 12 | Wrong-answer cards repeat full choice text | Reduce visual weight of repeated choice text — use `text-muted-foreground` and drop `font-medium` so it reads as a reference, not a heading | `components/question/feedback.tsx` |

**Total files touched:** 4 components, 0 content files
- `components/markdown/Markdown.tsx` — prose spacing
- `components/question/feedback.tsx` — verdict badge, correct answer display, reference label, wrong-answer card styling, spacing
- `components/question/question-card.tsx` — stem-to-choices gap
- `components/question/choice-button.tsx` — text size

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

### FUTURE — Enhanced Formatting (optional)

Nice-to-have improvements that go beyond fixing current issues:
- Clinical pearl rendered as a styled callout box (detect `**Clinical pearl:**` pattern in Markdown component)
- Clinical pearl parsed as a separate section (like references) at the seed level
- Reference section styling improvements
- All-or-nothing wrong-answer display rule — decide whether to relax it to show partial explanations

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
| 2026-02-25 | Integrated Chrome agent audit findings | Added Problems 8-12 (verdict badge, reference label, spacing gaps, wrong-answer text repetition). All are component-level — added to NOW phase |
