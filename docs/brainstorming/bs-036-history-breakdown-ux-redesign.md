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

The "Review session" button was added by SPEC-038 (FR-5) as a clear CTA, but in practice it creates a confusing flow: the user expands the breakdown to see question details, then immediately sees a button that takes them away from the breakdown they just opened. If you want to review starting from question 1, you'd click the card directly — you wouldn't expand the breakdown first.

**What should replace it:** The breakdown already has individual question links (e.g., "1. The Global Burden of Disease 2021 study..."). These are the real value of the breakdown — letting users jump directly to a specific question. The tutor card header serves as the "go to question 1" action.

**Code:** `history-sessions-tab.tsx:254-258`
```tsx
{sessionReviewHref ? (
  <Button asChild variant="default" className="rounded-full">
    <Link href={sessionReviewHref}>Review session</Link>
  </Button>
) : null}
```

### 4. Breakdown List Feels Like a Text Dump

The `SessionBreakdownList` renders as bare text — numbered question stems with Correct/Incorrect/Unanswered labels. No visual structure, no padding, no borders between items. With 20 questions, it reads as an overwhelming wall of text inside an already-dark container.

**Code:** `session-breakdown-list.tsx:20-58`

---

## Root Cause Analysis

### Why the layering looks wrong

The outer card uses `bg-muted/20` (11% gray at 20% opacity → ~4.9% effective on dark page background). The inner breakdown uses `bg-background/60` (3.5% background at 60% opacity → ~2.1% effective). In dark mode, `background` is **darker** than `muted`, so `bg-background/60` creates a visually deeper black than the parent — the opposite of what you'd expect from a nested container.

### Why "Review session" exists

SPEC-038 added it as FR-5 ("Review session" CTA in breakdown). At the time, the row-level click-to-navigate hadn't been implemented yet, so the button was the only way to enter review from the breakdown view. With the row-level click handler now in place (added in the same spec), the button became redundant but was never revisited.

### Why the breakdown list is unstyled

`SessionBreakdownList` is a shared component also used in the session summary view (`session-summary-view.tsx`) where it sits inside a `Card` with appropriate padding and visual context. On the history page, it's placed inside the custom breakdown container, which provides its own (inadequate) styling context.

---

## Severity Assessment

| Issue | Severity | Frequency | User Impact |
|-------|----------|-----------|-------------|
| Inner-card layering | **High** | Every breakdown expansion | Feels visually broken — "deeper black" inside lighter gray reads as a rendering bug |
| Hover disconnect | **Medium** | Every hover while expanded | Subtle but adds to the "something is off" feeling |
| Redundant "Review session" button | **Medium** | Every breakdown expansion | Cognitive overhead — three ways to do the same thing; wastes vertical space above the breakdown list |
| Unstyled breakdown list | **Medium** | Every breakdown expansion | 20+ questions as a text wall is hard to scan; low visual hierarchy |

---

## Proposed Options

### Option A: "Flat Expansion" — Minimal, Clean

Remove the inner container's distinct background and border. Let the breakdown content flow naturally within the card, separated only by spacing. Remove "Review session" button.

**Visual structure:**
```
┌─────────────────────────────────────────────────────┐
│ Tutor  •  3/20 correct (15%)  •  >120m  •  Feb 28  │  [Hide breakdown]
│                                                      │
│  1. The Global Burden of Disease 2021...   Correct   │
│  2. According to McCabe et al. (2023)...   Incorrect │
│  3. A 28-year-old woman with a 3-year...   Correct   │
│  ...                                                 │
└─────────────────────────────────────────────────────┘
```

**Changes:**
- Remove `bg-background/60`, `border border-border/30`, `rounded-lg` from inner container
- Keep `mt-3 space-y-2 p-3` for spacing only (or replace with `mt-3 pt-3 border-t border-border/30` for a subtle separator)
- Remove "Review session" button entirely
- Clicking session header row → navigates to question 1 (already works)
- Clicking individual question → navigates to that question (already works)

**Pros:**
- Simplest change — eliminates the layering problem entirely
- No new visual concepts to introduce
- Consistent with how disclosure patterns work in most design systems

**Cons:**
- No visual containment for the breakdown list — could feel "open-ended" with 20+ questions
- Less visual distinction between collapsed and expanded states

---

### Option B: "Subtle Inset" — Light Background Differentiation

Replace the darker inner container with a slightly *lighter* one (or matching opacity), creating proper visual hierarchy. Remove "Review session" button. Add subtle row styling to breakdown items.

**Visual structure:**
```
┌─────────────────────────────────────────────────────┐
│ Tutor  •  3/20 correct (15%)  •  >120m  •  Feb 28  │  [Hide breakdown]
│                                                      │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │
│  │ 1. The Global Burden of Disease...   Correct  │  │
│  │ 2. According to McCabe et al....     Incorrect│  │
│  │ 3. A 28-year-old woman with...       Correct  │  │
│  │ ...                                           │  │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
└─────────────────────────────────────────────────────┘
```

**Changes:**
- Replace `bg-background/60` with `bg-muted/10` (lighter than parent's `bg-muted/20`, creating gentle elevation)
- Or remove background entirely, keep only `border-t border-border/40` as top separator
- Remove "Review session" button
- Add `py-1.5 rounded-md` to breakdown list items for per-row structure
- Add `hover:bg-muted/30` to breakdown list item links for interactive affordance

**Pros:**
- Maintains visual containment without the inverted depth problem
- Per-row hover on breakdown items reinforces their clickability
- Breakdown items feel like a proper list, not a text dump

**Cons:**
- More changes than Option A
- Need to find the right opacity that works in both light and dark mode

---

### Option C: "Card-in-Card" — Structured Disclosure with Direct Navigation

Replace the breakdown area with a proper card-like treatment. Remove "Review session" button. Make each breakdown row a distinct, tappable element with clear affordance.

**Visual structure:**
```
┌─────────────────────────────────────────────────────┐
│ Tutor  •  3/20 correct (15%)  •  >120m  •  Feb 28  │  [Hide breakdown]
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  1. The Global Burden of Disease...  Correct  │  │
│  ├───────────────────────────────────────────────┤  │
│  │  2. According to McCabe et al....    Incorrect│  │
│  ├───────────────────────────────────────────────┤  │
│  │  3. A 28-year-old woman with...      Correct  │  │
│  ├───────────────────────────────────────────────┤  │
│  │  ...                                          │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Changes:**
- Replace inner container with `bg-card rounded-xl` or `bg-muted/10 rounded-xl` — a proper card surface
- Remove "Review session" button
- Rework `SessionBreakdownList` for history context: each row gets `px-3 py-2 rounded-md hover:bg-muted/40 transition-colors`
- Add `divide-y divide-border/30` between rows for visual separation
- Result badges (Correct/Incorrect/Unanswered) right-aligned with consistent width

**Pros:**
- Strongest visual structure — each question is a clear, tappable element
- The "card-in-card" pattern is well-established (e.g., Stripe dashboard, GitHub PR file lists)
- Clear affordance: hover state on each row communicates clickability
- Solves both the layering issue AND the "text dump" problem

**Cons:**
- Most changes required
- `SessionBreakdownList` is shared — would need history-specific variant or props
- Card-in-card can feel heavy if the outer card is too prominent

---

## Recommendation

**Option B (Subtle Inset)** strikes the best balance:

1. It fixes the layering issue without over-engineering
2. Per-row hover on breakdown items communicates clickability (addressing the "Review session" removal — users will naturally discover they can click questions)
3. It's the smallest change that addresses all four problems
4. Works with the shared `SessionBreakdownList` component through a lightweight `className` prop addition

Option A could work but risks the breakdown feeling uncontained. Option C is the most polished but may be over-engineering for the current need — it could be a future iteration.

---

## Open Questions

1. **Should "View breakdown" button remain as-is, or become an icon-only chevron?**
   The button uses `variant="outline"` and takes significant horizontal space. A `ChevronDown`/`ChevronUp` icon button could be more compact and let the session summary line breathe. However, the text label provides clearer affordance for first-time users.

2. **Should unanswered questions be visually de-emphasized in the breakdown?**
   Currently, unanswered questions show `text-muted-foreground/60` which dims them. But they're still full-width list items. With 14 unanswered out of 20 (as in the screenshot), the breakdown is dominated by dimmed rows. Consider either: (a) keep as-is (clear that the session was abandoned), (b) collapse unanswered into "14 unanswered" summary, or (c) separate answered/unanswered into two groups.

3. **Should the session card header change when expanded?**
   Currently the header looks the same whether collapsed or expanded. A subtle change (e.g., bold the mode label, or add a top-border accent) could signal the expanded state more clearly.

4. **Does removing "Review session" need a discovery mechanism?**
   The current button was the most explicit "you can review this session" signal. Without it, navigation depends on: (a) clicking the card header, or (b) clicking an individual question. Both are implicit. Should there be a tooltip, onboarding hint, or first-time animation to communicate these click targets?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-01 | Created BS-036 | History breakdown UX needs focused attention beyond the broad BS-035 audit |
