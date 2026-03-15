# Typography Policy

**Last Updated:** 2026-03-15

Canonical reference for how text sizing is controlled across the application. This document establishes the two-pipeline model, the subfamilies inside hardcoded UI text, and the content tier system that all typography decisions must follow.

**See also:**
- [Frontend Standards](./standards.md) — Component patterns, spacing, accessibility
- [Pattern Registry](./pattern-registry.md) — Visual pattern decision trees
- [Contrast Policy](./contrast-policy.md) — WCAG AA contrast targets

---

## Two-Pipeline Model

Text in this application flows through two fundamentally different pipelines. They have separate sizing strategies and must not be conflated.

### Pipeline 1: Hardcoded UI Text

**What:** Labels, buttons, headings, metadata, timestamps, section headers, navigation links, stat labels, empty-state copy, error messages, marketing copy, auth fallbacks, and utility-page descriptions — any text authored directly in React components.

**How it's sized:** Canonical patterns use direct Tailwind classes in JSX. Legacy inheritance-based call sites are drift, not policy, and are tracked below.

**Important:** Pipeline 1 is not one flat size scale. It has four subfamilies with different rules:

| Subfamily | Default / Canonical Pattern | Governed by | Notes |
|-----------|-----------------------------|-------------|-------|
| Dense app chrome | `text-sm` | [Frontend Standards](./standards.md) + [Pattern Registry](./pattern-registry.md) | Labels, metadata, dense card body text, action bars, section labels |
| Standard supporting copy | `text-base text-muted-foreground` | Standards + Pattern Registry | App page subtitles, centered utility/auth descriptions, standard marketing section ledes |
| Marketing/editorial surfaces | Custom display scale | Standards + Pattern Registry | Marketing hero/pricing page subtitles and display text intentionally use larger type |
| Form controls | `Input`: `text-base md:text-sm`; `Select`: `text-sm` | Component primitives + Pattern Registry | `Input` keeps a mobile accessibility exception to avoid iOS zoom on small text fields |

**Important distinction:** the application's operational chrome defaults to `text-sm`, but top-level supporting copy is a separate role and should be explicit `text-base text-muted-foreground`. Neither role should be left implicit.

| Context | Size | Example |
|---------|------|---------|
| App page h1 | `text-2xl` | "Quick Practice", "Dashboard" |
| Utility/auth h1 | `text-xl` | "Sign In", "Checkout complete" |
| App/utility/section subtitle or helper copy | `text-base text-muted-foreground` | "Track your progress and keep your streak alive.", "Authentication unavailable in this environment." |
| Section headers | `text-sm font-medium` | "Recent activity", "Mode" |
| Labels / secondary text | `text-sm text-muted-foreground` | "Mar 7, 2026", "Showing 1-20 of 65" |
| Stat numbers | `text-3xl font-bold font-display` | "848", "72%" |
| Error details | `text-xs text-muted-foreground` | Digest codes, fallback messages |
| App buttons | `text-sm font-medium` | "Submit", "Next", "Bookmark" |
| Marketing CTA buttons | `text-base font-medium` | "Get Started", "Subscribe Annual" |

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

### Feedback Context Override

The default content-tier system above is designed for the question-answering phase, where the stem and answer choices are the primary reading material and explanations are subordinate.

Inside `components/question/feedback.tsx`, the learning context changes after submission:

- answer text remains Primary because it is still the canonical answer label
- explanation text is also promoted to Primary (`text-base text-foreground`) because it becomes the main learning payload
- the feedback reference body is promoted from Tertiary to Secondary (`mt-1 text-sm`) because 12px citation text is too small for sustained dark-mode reading in this context
- the fallback `Explanation not available.` placeholder stays recessed at `text-sm text-muted-foreground` because it is an empty-state message, not learning content
- feedback section chips (`Correct Answer`, `Explanation`, `Why Other Answers Are Wrong`) are Pipeline 1 UI chrome, not Markdown content. Their size, weight, casing, and semantic/neutral variants are governed by [Pattern Registry F-8](./pattern-registry.md#f-8-feedback-section-chips).

This is a **narrow feedback-surface exception**, not a blanket redefinition of explanations or references everywhere else in the product.

### Why primary content is `text-base`, not `text-sm`

Question stems and answer choices are the primary reading material of the application. Users spend the majority of their time reading, comprehending, and deciding based on this content. It is intentionally one step larger than dense operational chrome (`text-sm`) to:

1. Signal visual hierarchy — content is the focus, chrome is the frame
2. Improve readability for dense clinical/pharmacological text
3. Create a distinct "reading zone" within the question card

This was a deliberate decision made in BUG-157 (commit `48b5c9a4`, 2026-02-26). It is correct and should not be reverted.

### Future: User-Selectable Content Size

A planned feature will allow users to choose their preferred content reading size during practice. This toggle will ONLY affect Pipeline 2 (content rendered through Markdown), NOT Pipeline 1 (hardcoded UI text).

| Setting | Primary Tier | Secondary Tier | Tertiary Tier | Hardcoded UI Text |
|---------|-------------|---------------|--------------|-------------------|
| **Small** | `text-sm` (14px) | `text-xs` (12px) | `text-xs` (12px) | Unchanged |
| **Medium** (default) | `text-base` (16px) | `text-sm` (14px) | `text-xs` (12px) | Unchanged |
| **Large** | `text-lg` (18px) | `text-base` (16px) | `text-sm` (14px) | Unchanged |

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

// Feedback-context primary — post-answer learning content
<Markdown content={explanationMd} className="text-base text-foreground" />

// Feedback-context secondary — feedback reference body
<Markdown content={referenceMd} className="mt-1 text-sm" />
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

### Pipeline 1 (Hardcoded UI Text): Compliant

The hardcoded UI-text pipeline is no longer described as "mostly compliant." The previous version of this document overstated consistency and contradicted the Pattern Registry by treating inherited `1rem` subtitle text as acceptable. The corrected current state is:

| Category | Reality | Status |
|----------|---------|--------|
| Marketing/editorial larger typography | Intentional | Compliant — governed by Standards + Pattern Registry |
| Standard supporting copy role (`text-base text-muted-foreground`) | Canonical | Compliant — DEBT-283 resolved the audited app/utility/marketing inheritance drift on 2026-03-07 |
| Form-control sizing (`Input` `text-base md:text-sm`) | Intentional mobile accessibility exception | Compliant |
| Exam review compact stat cards (`text-xs` labels + `text-2xl` values) | Intentional compact tier | Compliant — governed by Pattern Registry 12.4 |
| Arbitrary `text-[...]` / inline font styles in production UI code | None found in current audit | Compliant |

**Current open Pipeline 1 drift:** none in the audited `app/` and `components/` codepaths.

DEBT-283 resolved the previously audited 13-file / 19-occurrence supporting-copy drift and normalized those surfaces to explicit `text-base text-muted-foreground`. Remaining `text-muted-foreground` matches are intentional `text-sm`, `text-lg`, `text-xs`, `Input` (`text-base md:text-sm`), or nav/icon chrome.

### Pipeline 2 (Content): Compliant

All `<Markdown>` call sites now carry tier-appropriate classNames. The 4 violations in `feedback.tsx` were resolved by [DEBT-282](../_archive/debt/debt-282-feedback-visual-unification.md) (PR #179, 2026-03-07).

| Call Site | Expected Tier | Actual className | Status |
|-----------|--------------|-----------------|--------|
| `feedback.tsx:93` — correct answer text | Primary | `"text-base text-foreground"` | Compliant |
| `feedback.tsx:100` — explanation | Primary (feedback-context override) | `explanationClassName` (`"mt-2 text-base text-foreground"` / `"text-base text-foreground"`) | Compliant |
| `feedback.tsx:184` — wrong choice text (correct flow) | Primary | `"text-base text-foreground"` | Compliant |
| `feedback.tsx:189` — wrong choice explanation (correct flow) | Primary (feedback-context override) | `"mt-2 text-base text-foreground"` | Compliant |
| `feedback.tsx:208` — user answer text | Primary | `"text-base text-foreground"` | Compliant |
| `feedback.tsx:214` — user answer explanation | Primary (feedback-context override) | `"mt-2 text-base text-foreground"` | Compliant |
| `feedback.tsx:244` — other wrong choice text | Primary | `"text-base text-foreground"` | Compliant |
| `feedback.tsx:249` — other wrong choice explanation | Primary (feedback-context override) | `"mt-2 text-base text-foreground"` | Compliant |
| `feedback.tsx:266` — reference | Secondary (feedback-context override) | `"mt-1 text-sm"` | Compliant |
| `question-card.tsx:35` — stem | Primary | `"text-base text-foreground"` | Compliant |
| `choice-button.tsx:74` — choice text | Primary | `"text-base text-foreground"` | Compliant |

**Current open Pipeline 2 drift:** none.

---

## Rules

1. **Every `<Markdown>` call MUST include a tier-appropriate className.** No exceptions. Omitting className causes the text to inherit unpredictably.

2. **Hardcoded supporting copy MUST opt into an explicit size.** Use `text-base text-muted-foreground` for page/section subtitles, centered utility descriptions, and other top-level non-Markdown support text. Use `text-sm text-muted-foreground` for denser card body, labels, and operational metadata. Do not rely on inherited browser `1rem`.

3. **Marketing/editorial surfaces are exceptions, not violations.** Pricing and landing pages may use larger display/body sizes, but those patterns must be documented in Standards/Pattern Registry rather than improvised ad hoc.

4. **Form controls may use the mobile input exception.** `Input` is allowed to use `text-base md:text-sm`; this is an accessibility safeguard, not a general body-text rule for the rest of the UI.

5. **Content primary stays at `text-base`.** Do not revert to `text-sm` — the `text-base` decision was deliberate and correct for reading material.

6. **Same content, same tier.** If answer choice text is Primary tier in `choice-button.tsx`, it must also be Primary tier in `feedback.tsx`. The same text must not shrink or grow when it moves between components.

7. **The Markdown component does not set a default size.** This is intentional — it serves all three content tiers. Callers are responsible for specifying the tier.

8. **Font size preferences (future) affect content only.** When the user-selectable size feature is built, it must only change Pipeline 2 sizes. Pipeline 1 remains fixed.
