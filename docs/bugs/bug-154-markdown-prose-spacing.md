# BUG-154: Markdown Prose Spacing — Question Stem and Explanation Paragraphs Run Together

**Status:** Fixed (2026-02-26)
**Priority:** P1
**Date:** 2026-02-25
**Source:** [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) (Problems 1, 4)

---

## Description

The `<Markdown>` component renders paragraphs with no inter-paragraph spacing. This causes two high-severity visual issues:

### 1. Question stem scenario and question run together (Problem 1)

**What the user sees:**

> An addiction psychiatrist is reviewing the safety of prescribing zopiclone to a patient on methadone maintenance treatment for opioid use disorder who reports persistent insomnia. The patient has a history of obstructive sleep apnea. Which of the following represents the most significant safety concern in this patient?

All sentences run together as one block. The clinical scenario and the actual question ("Which of the following...") should be visually separated.

### 2. Clinical pearl runs into preceding text (Problem 4)

**What the user sees:**

> ...is potentially fatal. **Clinical pearl:** The opioid-sedative interaction is a leading cause...

The clinical pearl runs inline immediately after the main explanation with no visual break.

**Expected behavior:** Separate paragraphs should have visible vertical spacing between them, as in any standard reading experience.

## Steps to Reproduce

1. Navigate to Quick Practice
2. Answer any question with a multi-paragraph stem (most medical questions have scenario + question)
3. Observe: stem text runs together as one block
4. After answering, observe: explanation text paragraphs also run together

## Root Cause

`components/markdown/Markdown.tsx:15`:

```tsx
<div className={className}>
  <ReactMarkdown ...>{content}</ReactMarkdown>
</div>
```

The wrapper `<div>` receives no prose/typography styling. When MDX content has blank lines between paragraphs, `react-markdown` correctly produces separate `<p>` tags — but the browser's default `<p>` margins are minimal, and no Tailwind Typography (`prose`) or custom spacing classes are applied.

Callers use `text-sm` as the className (e.g., `question-card.tsx:35`, `feedback.tsx:58`), which sets font size but not paragraph spacing.

## Fix

Add inter-paragraph spacing to the `<Markdown>` component wrapper.

**File:** `components/markdown/Markdown.tsx:15`

```diff
-<div className={className}>
+<div className={cn('[&_p+p]:mt-3', className)}>
```

This adds `margin-top: 0.75rem` (12px) between consecutive `<p>` elements. This is lighter than full Tailwind Typography `prose` (which would add `margin-top: 1.25em` = ~17.5px at `text-sm`), keeping it compact for the card-based layout.

**Import needed:** Add `import { cn } from '@/lib/utils'` to `Markdown.tsx`.

### Why `[&_p+p]:mt-3` over `prose`

- `prose` applies opinionated styles to all elements (headings, lists, links, code blocks) which could have unintended side effects across ~958 questions of varying MDX complexity
- `[&_p+p]:mt-3` is surgical — only affects paragraph-to-paragraph spacing
- If broader typography styling is needed later, `prose` can be added as a follow-up

### Content-level follow-up (deferred)

Some MDX stems may lack the blank line between scenario and question in the source content. Without the blank line, `react-markdown` renders both as a single `<p>` and no CSS fix can separate them. A content audit pass to ensure blank lines before "Which of the following..." is tracked as deferred content work in BS-033.

The component fix still has high impact because:
1. Many questions already have correct blank lines but no visible spacing
2. Explanation paragraphs and clinical pearls benefit immediately

## Affected Files

| File | Change |
|------|--------|
| `components/markdown/Markdown.tsx` | Add `[&_p+p]:mt-3` and `cn` import |
| `components/markdown/Markdown.test.tsx` | Add test for inter-paragraph spacing |

## Verification

- [x] Multi-paragraph question stems show visible spacing between paragraphs
- [x] Clinical pearl text is visually separated from preceding explanation
- [x] Explanation paragraphs in feedback card have spacing
- [x] Wrong-answer explanation paragraphs have spacing
- [x] Single-paragraph content is unaffected (no extra top margin)
- [x] Choice button text (also uses `<Markdown>`) is unaffected visually
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test --run` passes

## Related

- [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) — Problems 1 and 4
