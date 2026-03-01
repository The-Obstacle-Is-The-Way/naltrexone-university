# BS-036: History Page Breakdown UX Redesign

**Date:** 2026-03-01
**Triggered by:** Visual review of the history page breakdown expansion — janky inner-card layering, redundant "Review session" button, and overall lack of visual elegance
**Scope:** Redesign the expanded breakdown area in history session cards to eliminate visual layering issues, remove redundant navigation, and establish a clean information hierarchy
**Related:** [BS-035](./bs-035-card-hover-and-gray-consistency-audit.md) — Card Hover and Gray Consistency Audit (identified the nested background and dark-mode contrast issues); [SPEC-038](../_archive/specs/spec-038-history-ux-remediation.md) — History UX Remediation (added "Review session" as FR-5)

---

## The Problem

The history page session cards, when expanded to show the question breakdown, look visually awkward and have redundant navigation elements:

### 1. Janky Inner-Card Layering (Dark Mode)

When a user clicks "View breakdown", the expanded content sits inside a nested container with a **darker background** than the outer card. This creates an uncomfortable visual depth:

```
Outer row:  bg-muted/20  → dark mode: ~4.9% effective lightness
Inner area: bg-background/60 → dark mode: ~2.1% effective lightness (darker than outer)
```

The inner area renders as a deeper black rectangle inside a lighter dark-gray card. This inverted hierarchy — darker inside lighter — violates the expected visual stacking order where nested content should be equal to or slightly lighter than its parent.

**Code:** `history-sessions-tab.tsx:253`
```tsx
<div className="mt-3 -mx-1 space-y-2 rounded-lg border border-border/30 bg-background/60 p-3">
```

### 2. Hover State Disconnect

The outer row has `hover:bg-muted/40`, but the inner breakdown area has no hover response. When hovering the card, the outer background lightens while the inner breakdown stays static, creating a visual disconnect — the breakdown panel looks like it's "floating" at a different depth.

**Code:** `history-sessions-tab.tsx:180-184`
```tsx
className={cn(
  'rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors',
  isRowInteractive
    ? 'cursor-pointer hover:bg-muted/40 ...'
    : undefined,
)}
```

### 3. "Review Session" Button is Redundant

Three navigation paths all lead to the same destination (first question in review mode):

| Path | Destination | UX Impact |
|------|-------------|-----------|
| Click session summary text | First question in review mode | Primary — intended main action |
| Click anywhere on the row (outside interactive elements) | First question in review mode | Secondary — large target area |
| Click "Review session" button inside breakdown | First question in review mode | **Redundant** — identical destination |

The "Review session" button was added by SPEC-038 (FR-5) as a clear CTA, but in practice it creates the wrong hierarchy: the breakdown exists for **question-level** navigation (jump to a specific question), but the loudest visual element within it is a **session-level** action. If you want to start from question 1, you'd click the card header — you wouldn't expand the breakdown first.

**What should replace it:** Nothing. The breakdown already has individual question links — question 1 at the top of the list implicitly serves as "start from the beginning." The card header row serves as the "go to question 1" action for users who don't want to expand.

**Code:** `history-sessions-tab.tsx:254-258`
```tsx
{sessionReviewHref ? (
  <Button asChild variant="default" className="rounded-full">
    <Link href={sessionReviewHref}>Review session</Link>
  </Button>
) : null}
```

### 4. Breakdown List Feels Like a Text Dump

The `SessionBreakdownList` renders as bare text — numbered question stems with Correct/Incorrect/Unanswered labels. No visual separation between rows, no padding, no hover affordance on clickable items. With 20 questions, it reads as an overwhelming wall of text.

**Code:** `session-breakdown-list.tsx:20-58`

### 5. Missing Disclosure Accessibility (Gap)

The "View breakdown" / "Hide breakdown" button toggles a content region but has no `aria-expanded` or `aria-controls` attributes. Screen readers cannot communicate the toggle state or the relationship between the button and the expanded panel.

**Code:** `history-sessions-tab.tsx:239-249`
```tsx
<Button
  type="button"
  variant="outline"
  className="rounded-full"
  aria-label={`${isSelected ? 'Hide' : 'View'} breakdown for ${sessionSummary}`}
  onClick={() => {
    void historySessions.onOpenSession(row.sessionId);
  }}
>
  {isSelected ? 'Hide breakdown' : 'View breakdown'}
</Button>
```

Missing: `aria-expanded={isSelected}` and `aria-controls="breakdown-{sessionId}"` on the button, with corresponding `id` and `role="region"` on the expanded panel.

---

## Root Cause Analysis

### Why the layering looks wrong

The outer card uses `bg-muted/20` (11% gray at 20% opacity → ~4.9% effective on dark page background). The inner breakdown uses `bg-background/60` (3.5% background at 60% opacity → ~2.1% effective). In dark mode, `background` is **darker** than `muted`, so `bg-background/60` creates a visually deeper black than the parent — the opposite of what you'd expect from a nested container.

### Why "Review session" exists

SPEC-038 added it as FR-5 ("Review session" CTA in breakdown). At the time, the row-level click-to-navigate hadn't been implemented yet, so the button was the only way to enter review from the breakdown view. With the row-level click handler now in place (added in the same spec), the button became redundant but was never revisited.

### Why the breakdown list is unstyled

`SessionBreakdownList` is a shared component also used in the session summary view (`session-summary-view.tsx`) where it sits inside a `Card` with appropriate padding and visual context. On the history page, it's placed inside the custom breakdown container, which provides its own (inadequate) styling context.

### Why accessibility wiring is missing

The `aria-label` on the button was added for descriptive context, but the disclosure pattern (`aria-expanded` + `aria-controls`) was not wired. The `isSelected` state exists but is only used for conditional rendering, not communicated to assistive technology.

---

## Severity Assessment

| Issue | Severity | Frequency | User Impact |
|-------|----------|-----------|-------------|
| Inner-card layering | **High** | Every breakdown expansion | Feels visually broken — "deeper black" inside lighter gray reads as a rendering bug |
| Redundant "Review session" button | **Medium** | Every breakdown expansion | Wrong hierarchy — session-level action dominates a question-level context; wastes vertical space above the list |
| Unstyled breakdown list | **Medium** | Every breakdown expansion | 20+ questions as a text wall is hard to scan; no visual rhythm, no hover affordance on links |
| Missing disclosure a11y | **Medium** | Every breakdown expansion | Screen readers cannot communicate toggle state or panel relationship |
| Hover disconnect | **Low** | Every hover while expanded | Resolves automatically when inner container is removed |

---

## Design Precedent Analysis

How world-class products handle disclosed content inside a parent container:

| Product | Pattern | Inner Background? | Separator |
|---------|---------|-------------------|-----------|
| GitHub PR file list | Expand file → show diff inline | No — same depth | `border-t` divider between file header and diff |
| Linear issue detail | Expand subtasks inline | No — same depth | Spacing + left indent |
| Stripe payment details | Expand row → show details | No — same depth | Subtle `border-t` |
| Notion toggle blocks | Content appears at parent level | No — same depth | Spacing only |

**Universal pattern:** Disclosed content lives at the parent's visual level. One surface, one shade. Separation comes from a divider or spacing, never a second background color.

---

## Proposed Options

### Option A: "Flat Expansion" — Minimal, Clean

Remove the inner container's distinct background and border. Let the breakdown content flow naturally within the card, separated only by a top border. Remove "Review session" button.

**Visual structure:**
```
┌─────────────────────────────────────────────────────┐
│ Tutor  •  3/20 correct (15%)  •  >120m  •  Feb 28  │  [Hide breakdown]
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
│  1. The Global Burden of Disease 2021...   Correct   │
│  2. According to McCabe et al. (2023)...   Incorrect │
│  3. A 28-year-old woman with a 3-year...   Correct   │
│  ...                                                 │
└─────────────────────────────────────────────────────┘
```

**Changes:**
- Remove `bg-background/60`, `border border-border/30`, `rounded-lg` from inner container
- Replace with `mt-3 pt-3 border-t border-border/30` — subtle separator only
- Remove "Review session" button entirely
- Clicking session header row → navigates to question 1 (already works)
- Clicking individual question → navigates to that question (already works)

**Assessment:** Fixes the core layering problem. Simple. But leaves the list as a text dump.

---

### Option B: "Subtle Inset" — Light Background Differentiation

Replace the darker inner container with a slightly *lighter* one (`bg-muted/10`), creating proper visual hierarchy. Remove "Review session" button.

**Assessment:** Maintains visual containment without the inverted depth. But introduces a second shade — every reference product says don't do this. The outer card border already provides containment.

---

### Option C: "Card-in-Card" — Structured Disclosure

Replace the breakdown area with a proper card-like surface. Make each breakdown row a distinct, tappable element.

**Assessment:** Strongest visual structure, but over-engineered. Card-in-card adds visual weight. The card's outer border already provides containment.

---

## Recommendation: Option A + List Improvements + Accessibility

The best approach is Option A's simplicity **combined with** list structure improvements and accessibility wiring. This gives us the correct visual hierarchy without over-engineering.

### 1. Surface: One Shade, Divider Only

Replace the inner container:

```tsx
// Before (inverted depth)
<div className="mt-3 -mx-1 space-y-2 rounded-lg border border-border/30 bg-background/60 p-3">

// After (flat, divider only)
<div className="mt-3 pt-3 border-t border-border/30">
```

No inner background, no inner border, no inner border-radius. The card's outer border provides containment. The `border-t` provides separation between summary and breakdown.

### 2. Remove "Review Session" Button

Delete entirely. The breakdown exists for question-level navigation. Question 1 at the top of the list implicitly serves as "start from beginning." The card header row serves as the session-level navigation target.

### 3. Improve List Row Structure

In `SessionBreakdownList`, move from bare text rows to structured rows:

- Add `divide-y divide-border/20` to the `<ul>` for visual rhythm between rows
- Add `py-2` padding to each `<li>` for breathing room
- Add `hover:bg-muted/20 -mx-2 px-2 rounded-md transition-colors` on clickable rows for interactive affordance
- Right-align status labels with consistent placement

These changes benefit both the history context and the session summary context (where the component is also used).

### 4. Add Disclosure Accessibility

On the "View breakdown" / "Hide breakdown" button:
- Add `aria-expanded={isSelected}`
- Add `aria-controls={`breakdown-${row.sessionId}`}`

On the expanded panel:
- Add `id={`breakdown-${row.sessionId}`}`
- Add `role="region"`
- Add `aria-label="Question breakdown"`

### 5. Add Empty State

If the review loads with zero rows, show: "No questions available for this session."

### What We Are NOT Doing

- **No inner scroll (`max-h` + `overflow-y-auto`)** — Inner scroll containers create scroll traps on mobile. Let the card be as tall as it needs to be. "Hide breakdown" collapses it.
- **No second shade (`bg-muted/10` inner shell)** — Contradicts the universal disclosure pattern. One surface per card.
- **No de-emphasized "Review session" link** — Still redundant regardless of visual weight. Question 1 is right there.

---

## Open Questions

1. **Should "View breakdown" button become a chevron icon?**
   The button uses `variant="outline"` and takes significant horizontal space. A `ChevronDown`/`ChevronUp` icon button could be more compact. However, the text label provides clearer affordance for first-time users.

2. **Should unanswered questions be visually de-emphasized?**
   Currently, unanswered questions show `text-muted-foreground/60` which dims them. With 14 unanswered out of 20 (as in the screenshot), the breakdown is dominated by dimmed rows. Consider: (a) keep as-is (clear that the session was abandoned), (b) collapse unanswered into "14 unanswered" summary, or (c) separate answered/unanswered into two groups.

3. **Should the session card header change when expanded?**
   Currently the header looks the same whether collapsed or expanded. A subtle change could signal the expanded state more clearly. However, the "Hide breakdown" button text already communicates state.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-01 | Created BS-036 | History breakdown UX needs focused attention beyond the broad BS-035 audit |
| 2026-03-01 | Considered Options A, B, C | Three distinct approaches from minimal to structured |
| 2026-03-01 | External first-principles audit | Parallel agent reviewed from first principles; identified valid gaps (a11y, list scanability, mobile) but over-engineered with Option D (inner shade, inner scroll, de-emphasized CTA) |
| 2026-03-01 | Recommend Option A + list improvements + a11y | Design precedent (GitHub, Linear, Stripe, Notion) unanimously supports flat disclosure. List structure and a11y address the real gaps without introducing new visual surfaces or scroll traps |
