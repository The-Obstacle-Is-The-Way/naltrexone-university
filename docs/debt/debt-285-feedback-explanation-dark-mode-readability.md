# DEBT-285: Feedback Explanation Dark Mode Readability

**Priority:** P2
**Created:** 2026-03-07
**Status:** Open
**Triggered by:** Visual review of feedback card in dark mode — explanation text is hard to read
**Scope:** Promote feedback explanation text from Secondary tier to Primary tier; bump the feedback-card reference from Tertiary to Secondary; document the feedback-context typography override in policy/registry
**Related:** [DEBT-284](../_archive/debt/debt-284-feedback-visual-polish-phase-2.md) (badge coloring, just completed), [Typography Policy](../frontend/typography-policy.md)

---

## The Problem

After answering a question, the feedback card is where learning happens. The user reads the explanation to understand *why* an answer is correct or incorrect. But the current tier system treats explanations as "secondary" content, applying a **double readability penalty**: smaller font (`text-sm` / 14px) AND dimmer color (`text-muted-foreground` / gray).

In dark mode especially, this creates a jarring experience:
- **Answer choice text** — 16px, white (`text-base text-foreground`) — easy to read
- **Explanation text** — 14px, gray (`text-sm text-muted-foreground`) — noticeably harder to read
- **Reference text** — 12px (`text-xs`) — genuinely tiny and straining

The size + color drop between the answer text and its explanation feels like the system is de-emphasizing the most important learning content on the page.

This is a **readability / learning-context issue**, not a WCAG failure claim. The current muted explanation text is not being flagged here as non-compliant with `docs/frontend/contrast-policy.md`; the problem is that the hierarchy is optimized for answering, not for learning from post-answer feedback.

### Why the current tier model breaks down in feedback

The Typography Policy's three-tier content system was designed around the question-answering phase:

| Tier | Role in question phase | Role in feedback phase |
|------|----------------------|----------------------|
| Primary (`text-base text-foreground`) | Question stem, answer choices — what you read to decide | Answer text — which you already read during the question |
| Secondary (`text-sm text-muted-foreground`) | — | Explanation — **the actual learning content** |
| Tertiary (`text-xs`) | — | Reference — citation data |

The tier hierarchy makes sense during the question: the stem and choices ARE the primary reading material. But in feedback, the roles flip. The answer text is a label (you already read it), and the **explanation is what you're there to learn from**. Demoting it to secondary actively harms the reading experience.

---

## Current State (feedback.tsx)

### Explanation text — 4 Markdown call sites

| Line | Context | Current className |
|------|---------|-------------------|
| 82 | Correct answer explanation | `getExplanationClassName()` → `"mt-2 text-sm text-muted-foreground"` or `"text-sm text-muted-foreground"` |
| 172 | Why-wrong choice explanation (correct flow) | `"mt-2 text-sm text-muted-foreground"` |
| 200 | Your answer explanation | `"mt-2 text-sm text-muted-foreground"` |
| 235 | Why-wrong choice explanation (incorrect flow) | `"mt-2 text-sm text-muted-foreground"` |

All four explanation Markdown wrappers are `text-sm text-muted-foreground` — 14px gray.

### Fallback "Explanation not available" — 1 site

| Line | Context | Current className |
|------|---------|-------------------|
| 84 | No explanation available | `getFallbackExplanationClassName()` → includes `text-sm text-muted-foreground` |

### Reference text — 1 Markdown call site

| Line | Context | Current className |
|------|---------|-------------------|
| 250 | Reference section | `"mt-1 text-xs"` |

---

## What Already Carries Hierarchy

The feedback card has extensive structural hierarchy that does NOT depend on text size/color differentiation:

1. **Section headers** — "Your answer", "Correct answer", "Why other answers are wrong:" (`text-sm font-medium text-foreground`)
2. **Card borders** — green (`border-success/60`) for correct, red (`border-destructive`) for wrong
3. **Card backgrounds** — green tint (`bg-success/5`) for correct, red tint (`bg-destructive/5`) for wrong
4. **Badge verdict coloring** — green badges for correct choice, red for user's wrong choice, neutral for other wrong choices
5. **Spatial ordering** — "Your answer" first, then "Correct answer", then "Why other answers are wrong"
6. **The Correct/Incorrect pill badge** at the top
7. **Clinical pearl callout** — boxed, labeled, visually distinct
8. **Reference section** — border-top separator, uppercase "REFERENCE" label, tracking

With all this structural hierarchy in place, the text itself doesn't need to carry the hierarchy burden via size/color demotion.

---

## Proposed Fix

### P1: Promote explanation text to `text-base text-foreground`

Change all explanation `<Markdown>` classNames from `text-sm text-muted-foreground` to `text-base text-foreground`.

**Affected call sites:**

| Line | From | To |
|------|------|----|
| `getExplanationClassName()` (line 44-48) | `"mt-2 text-sm text-muted-foreground"` / `"text-sm text-muted-foreground"` | `"mt-2 text-base text-foreground"` / `"text-base text-foreground"` |
| `getFallbackExplanationClassName()` (line 50-52) | inherits `text-sm text-muted-foreground` + adds `text-muted-foreground` | return an exact fallback string (`"mt-2 text-sm text-muted-foreground"` / `"text-sm text-muted-foreground"`), not a mix of promoted + muted tokens |
| Line 172 | `"mt-2 text-sm text-muted-foreground"` | `"mt-2 text-base text-foreground"` |
| Line 200 | `"mt-2 text-sm text-muted-foreground"` | `"mt-2 text-base text-foreground"` |
| Line 235 | `"mt-2 text-sm text-muted-foreground"` | `"mt-2 text-base text-foreground"` |

**Rationale:** After answering, explanation text IS the primary reading content. Same size and color as answer text. The card structure (borders, backgrounds, section headers, badges, spatial ordering) provides all necessary visual hierarchy.

**Fallback exception:** The "Explanation not available" placeholder should remain `text-sm text-muted-foreground` — it is an empty-state message, not learning content.

### P2: Promote reference text from `text-xs` to `text-sm`

Change reference `<Markdown>` className from `"mt-1 text-xs"` to `"mt-1 text-sm"`.

| Line | From | To |
|------|------|----|
| 250 | `"mt-1 text-xs"` | `"mt-1 text-sm"` |

**Rationale:** At 12px, reference text is genuinely straining in dark mode. Bumping to 14px (`text-sm`) keeps it visually subordinate to the now-`text-base` explanations while being actually readable. The reference section is already visually separated by a `border-t` divider and uppercase "REFERENCE" label — it doesn't need tiny text to signal its role.

### P3: Update Typography Policy

The Typography Policy's Content Tier System needs a feedback-context amendment recognizing that explanations in the feedback card are promoted to Primary tier. This is not a general change to the tier system — it's specific to the feedback rendering context where explanations become the primary learning content.

The Pattern Registry also needs a sync update. `F-5` / `F-6` currently govern feedback-card surfaces and the reference heading, but they do not yet document the promoted explanation/reference body text rules for this context.

---

## What NOT to Change

- **Answer choice text** — already `text-base text-foreground`, stays as-is
- **Section headers** — already `text-sm font-medium text-foreground`, stays as-is (Pipeline 1 UI chrome)
- **Clinical pearl callout** — rendered through Markdown's internal callout detection, inherits from its parent explanation className; will naturally follow the promotion
- **Badge text** — `text-xs font-semibold`, stays as-is (Pipeline 1 UI element inside a 28px circle)
- **"REFERENCE" label** — `text-xs font-semibold uppercase tracking-wide text-muted-foreground`, stays as-is (Pipeline 1 UI chrome)
- **Correct/Incorrect pill** — stays as-is
- **Question stem and choice buttons** — not in feedback.tsx, unaffected

---

## Test Plan

Update `Feedback.test.tsx` to assert the new classNames:

1. **Explanation text carries `text-base` and `text-foreground`** — assert correct-answer explanation, your-answer explanation, and why-wrong explanations all contain these tokens
2. **Explanation text does NOT carry `text-sm` or `text-muted-foreground`** — negative assertion to prevent regression
3. **Fallback "Explanation not available" keeps `text-muted-foreground`** — placeholder should remain muted
4. **Reference carries `text-sm`** (not `text-xs`) — assert promotion
5. **Answer choice text unchanged at `text-base text-foreground`** — regression guard

---

## Typography Policy Update

After implementation, update `docs/frontend/typography-policy.md`:

1. Add a "Feedback Context Override" subsection to the Content Tier System explaining that in the feedback card, explanations are promoted to Primary tier because they become the primary learning content post-answer
2. Update the compliance table for feedback.tsx call sites to reflect new classNames
3. In `feedback.tsx`, the reference section moves from Tertiary (`text-xs`) to Secondary (`text-sm`) as a feedback-context exception, not a blanket rule for every reference-like Markdown surface in the app

After implementation, update `docs/frontend/pattern-registry.md`:

1. Add the explanation/reference typography portion of the feedback-card pattern so F-5/F-6 describe not just surfaces, but the final text hierarchy used inside them
2. Keep the existing section-header and reference-label UI-chrome patterns unchanged

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-07 | Promote explanations to `text-base text-foreground` in feedback | Explanation IS the primary learning content after answering. Double demotion (smaller + grayer) harms dark mode readability. Card structure provides sufficient hierarchy without text demotion. |
| 2026-03-07 | Promote reference from `text-xs` to `text-sm` | 12px is genuinely straining in dark mode. Border-top + uppercase label provides sufficient role signaling without tiny text. |
| 2026-03-07 | Keep fallback "Explanation not available" as `text-muted-foreground` | Empty-state placeholder, not learning content — should stay visually recessed. |
