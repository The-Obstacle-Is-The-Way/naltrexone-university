# Typography Policy

**Last Updated:** 2026-03-07

Canonical reference for how text sizing is controlled across the application. This document establishes the two-pipeline model and content tier system that all typography decisions must follow.

**See also:**
- [Frontend Standards](./standards.md) — Component patterns, spacing, accessibility
- [Pattern Registry](./pattern-registry.md) — Visual pattern decision trees
- [Contrast Policy](./contrast-policy.md) — WCAG AA contrast targets

---

## Two-Pipeline Model

Text in this application flows through two fundamentally different pipelines. They have separate sizing strategies and must not be conflated.

### Pipeline 1: App Chrome

**What:** Labels, buttons, headings, metadata, timestamps, section headers, navigation links, stat labels, empty-state copy, error messages — any text hardcoded in React components.

**How it's sized:** Direct Tailwind classes in JSX. Each component applies its own `text-*` class.

**Default size:** `text-sm` (14px). This is the app's body text. It is dense, functional, and consistent with the UI chrome role.

**Governed by:** [Frontend Standards](./standards.md) section 4 (Typography).

| Context | Size | Example |
|---------|------|---------|
| App page h1 | `text-2xl` | "Quick Practice", "Dashboard" |
| Section headers | `text-sm font-medium` | "Recent activity", "Correct answer" |
| Labels / secondary text | `text-sm text-muted-foreground` | "Answered Mar 7, 2026", "Showing 1-20 of 65" |
| Stat numbers | `text-3xl font-bold font-display` | "848", "72%" |
| Error details | `text-xs` | Digest codes, fallback messages |
| Buttons | `text-sm font-medium` | "Submit", "Next", "Bookmark" |

### Pipeline 2: Content (Markdown)

**What:** Question stems, answer choice text, feedback answer text, explanations, clinical pearls, references — any text originating from MDX files in `content/questions/` and rendered through the `Markdown` component.

**How it's sized:** The `Markdown` component receives a `className` prop from its caller. The component itself has no default text size — it inherits from whatever the caller provides.

**Governed by:** This document (the content tier system below).

**Source of content:** MDX files in `content/questions/` are seeded into the database. At render time, the text flows through: `DB → use case → server action → React component → <Markdown>`.

---

## Content Tier System

All content rendered through the `Markdown` component belongs to one of three tiers. Every `<Markdown>` call site MUST pass the appropriate tier className.

| Tier | Role | Size | className | Used For |
|------|------|------|-----------|----------|
| **Primary** | Core learning material the user reads and answers | `text-base` (16px) | `"text-base text-foreground"` | Question stems, answer choice text, feedback answer text |
| **Secondary** | Supporting explanation subordinate to the answer | `text-sm` (14px) | `"text-sm"` | Explanations ("why this is correct/wrong") |
| **Tertiary** | Footnote-level citation data | `text-xs` (12px) | `"text-xs"` | Reference sections |

### Why primary content is `text-base`, not `text-sm`

Question stems and answer choices are the primary reading material of the application. Users spend the majority of their time reading, comprehending, and deciding based on this content. It is intentionally one step larger than app chrome (`text-sm`) to:

1. Signal visual hierarchy — content is the focus, chrome is the frame
2. Improve readability for dense clinical/pharmacological text
3. Create a distinct "reading zone" within the question card

This was a deliberate decision made in BUG-157 (commit `48b5c9a4`, 2026-02-26). It is correct and should not be reverted.

### Future: User-Selectable Content Size

A planned feature will allow users to choose their preferred content reading size during practice. This toggle will ONLY affect Pipeline 2 (content rendered through Markdown), NOT Pipeline 1 (app chrome).

| Setting | Primary Tier | Secondary Tier | Tertiary Tier | App Chrome |
|---------|-------------|---------------|--------------|------------|
| **Small** | `text-sm` (14px) | `text-xs` (12px) | `text-xs` (12px) | `text-sm` (unchanged) |
| **Medium** (default) | `text-base` (16px) | `text-sm` (14px) | `text-xs` (12px) | `text-sm` (unchanged) |
| **Large** | `text-lg` (18px) | `text-base` (16px) | `text-sm` (14px) | `text-sm` (unchanged) |

Implementation approach (when built):
- Store preference in user settings or localStorage
- Provide preference via React Context
- Markdown component reads context and applies the correct tier size
- Only active on practice/question pages — no effect on dashboard, history, billing, etc.

This feature is NOT currently implemented. The tier system defined above is the current default (Medium) and does not depend on the feature being built.

---

## The Markdown Component

**File:** `components/markdown/Markdown.tsx`

The Markdown component is a thin wrapper around `react-markdown`. It provides:
- GFM support (tables, strikethrough)
- HTML sanitization
- Clinical pearl detection and callout rendering
- Paragraph spacing via `[&_p+p]:mt-3`

**It does NOT provide a default text size.** This is intentional — the component is used across all three content tiers, so the caller must specify which tier applies via className.

### Correct usage

```tsx
// Primary tier — question stems, answer choices, feedback answers
<Markdown content={stemMd} className="text-base text-foreground" />

// Secondary tier — explanations
<Markdown content={explanationMd} className="text-sm" />

// Tertiary tier — references
<Markdown content={referenceMd} className="mt-1 text-xs" />
```

### Incorrect usage

```tsx
// WRONG — no className, inherits unpredictably
<Markdown content={choiceText} />

// WRONG — using text-sm for primary content (answer text)
<Markdown content={answerText} className="text-sm" />
```

---

## Current Compliance Status

### Pipeline 1 (App Chrome): Mostly Compliant

The app chrome pipeline is ~85% consistent. `text-sm` is the dominant size (64% of all text-sizing instances). Known violations:

| Issue | Location | Status |
|-------|----------|--------|
| Exam review stat cards use `text-xs` labels + `text-2xl` values instead of `text-sm` + `text-3xl` | `exam-review-view.tsx` | Open — tracked for future alignment |
| Some page subtitles lack explicit text sizing | `dashboard/page.tsx`, `exam-review-view.tsx` | Open — low severity |

### Pipeline 2 (Content): Non-Compliant

The content pipeline has significant violations. `feedback.tsx` renders content-tier Markdown without the correct className in 4 of 7 call sites:

| Call Site | Expected Tier | Actual className | Status |
|-----------|--------------|-----------------|--------|
| `feedback.tsx:73` — correct answer text | Primary | *none* (inherits) | Non-compliant |
| `feedback.tsx:77` — explanation | Secondary | `text-sm` | Compliant |
| `feedback.tsx:157` — wrong choice text | Primary | *none* (inherits) | Non-compliant |
| `feedback.tsx:181` — user answer text | Primary | *none* (inherits) | Non-compliant |
| `feedback.tsx:212` — other wrong choice text | Primary | *none* (inherits) | Non-compliant |
| `feedback.tsx:231` — reference | Tertiary | `text-xs` | Compliant |
| `question-card.tsx:35` — stem | Primary | `text-base text-foreground` | Compliant |
| `choice-button.tsx:72` — choice text | Primary | `text-base text-foreground` | Compliant |

Fixing these violations is tracked in [DEBT-282](../debt/debt-282-feedback-visual-unification.md) (promoted from [BS-043](../brainstorming/bs-043-question-flow-typography-and-feedback-visual-unification.md)).

---

## Rules

1. **Every `<Markdown>` call MUST include a tier-appropriate className.** No exceptions. Omitting className causes the text to inherit unpredictably.

2. **App chrome stays at `text-sm`.** Do not bump app chrome text to `text-base` to "match" content. They are different pipelines with different purposes.

3. **Content primary stays at `text-base`.** Do not revert to `text-sm` — the `text-base` decision was deliberate and correct for reading material.

4. **Same content, same tier.** If answer choice text is Primary tier in `choice-button.tsx`, it must also be Primary tier in `feedback.tsx`. The same text must not shrink or grow when it moves between components.

5. **The Markdown component does not set a default size.** This is intentional — it serves all three tiers. Callers are responsible for specifying the tier.

6. **Font size preferences (future) affect content only.** When the user-selectable size feature is built, it must only change Pipeline 2 sizes. Pipeline 1 remains fixed.
