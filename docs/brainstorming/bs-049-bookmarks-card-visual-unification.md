# BS-049: Bookmarks Card Visual Unification

**Date:** 2026-03-12
**Triggered by:** Visual comparison of Bookmarks page against recently unified History Questions tab and Dashboard Recent Activity
**Scope:** Bookmark cards use bordered `<Card>` with elevated styling, redundant "Review" button, and title link hover — all visually dated compared to the borderless tonal fill, whole-row-clickable pattern now established across History and Dashboard.
**Related:** [BS-048](../_archive/brainstorming/bs-048-history-row-fill-depth-and-hover-policy.md) (History row fill/affordance cleanup — direct precedent), [DEBT-302](../_archive/debt/debt-302-history-row-fill-and-affordance-cleanup.md), [BS-044](./bs-044-dark-mode-border-weight-tiering.md) (border weight tiering), [Pattern Registry](../frontend/pattern-registry.md), [Contrast Policy](../frontend/contrast-policy.md)

---

## The Problem

The Bookmarks page (`app/(app)/app/bookmarks/page.tsx`) was last updated before the History and Dashboard visual unification work (DEBT-301, DEBT-302). It now stands out as the only question-list surface that still uses bordered, elevated `<Card>` containers with explicit action buttons.

### Current state (bookmark rows)

```tsx
<Card className="gap-0 rounded-2xl p-6 shadow-sm dark:border-foreground/40">
  <!-- title as <Link> with hover:underline -->
  <!-- "Review" button (navigates to same href as title) -->
  <!-- "Remove" button (opens AlertDialog confirmation) -->
</Card>
```

### Side-by-side comparison

| Aspect | Bookmarks (current) | History Questions (target) | Dashboard Activity |
|--------|---------------------|---------------------------|-------------------|
| Container | `<Card>` with border, shadow | `<Link>` — borderless tonal fill | `<Link>` — borderless tonal fill |
| Rest fill | `bg-card` (via Card) | `bg-foreground/[0.08]` | `bg-foreground/5` (inside card) |
| Hover | None on card; `hover:underline` on title | `hover:bg-foreground/[0.12]` | `hover:bg-foreground/[0.08]` |
| Border | `dark:border-foreground/40` | None | None |
| Shadow | `shadow-sm` | None | None |
| Click target | Title link only | Entire row | Entire row |
| Trailing action | "Review" button + "Remove" button | None (pill removed in DEBT-302) | None |
| Nav affordance | Title underline + Review button | Cursor + hover fill + focus ring | Cursor + hover fill + focus ring |

Bookmarks sits on `bg-background` (page surface, not inside a Card container), so it should follow the History Questions convention: `bg-foreground/[0.08]` rest, `hover:bg-foreground/[0.12]` hover (the parent-aware foreground ramp established in BS-048 Gap 1/6).

---

## Root Cause Analysis

1. **Bookmarks was built before the tonal fill unification.** The bordered Card pattern was the standard when bookmarks was implemented. History and Dashboard have since moved to borderless tonal fill rows.

2. **"Review" button is redundant.** BS-048 Gap 5 established the precedent: a redundant label/button inside an already-clickable surface adds visual weight without informational value. The History Questions tab removed its "Review" pill for the same reason. Clicking the bookmark row itself should navigate to the question.

3. **Title `hover:underline` is redundant.** The whole-row hover fill communicates interactivity. An additional underline on the title is visually noisy — same rationale as BS-048 Gap 3 (session summary underline removal).

4. **Border + shadow is aesthetically heavy.** BS-044 identified that uniform `dark:border-foreground/40` creates a "boxes inside boxes" effect. History resolved this by removing the card wrapper entirely. Bookmarks should follow the same path.

---

## Severity Assessment

- **Who is affected:** All users viewing Bookmarks in dark mode
- **How often:** Every bookmarks page visit
- **Impact:** Aesthetic consistency. No WCAG failures, no functional issues. The current page works correctly — it just looks visually dated next to History and Dashboard.
- **Priority:** P3 (visual polish, design consistency)

---

## Gap Inventory

### Gap 1: Replace `<Card>` with borderless tonal fill row — PROPOSED

**Current:** `<Card className="gap-0 rounded-2xl p-6 shadow-sm dark:border-foreground/40">`

**Proposed:** Replace with a styled container (see Gap 5 for structural details) using:
- Rest: `bg-foreground/[0.08]`
- Hover: `hover:bg-foreground/[0.12]`
- `rounded-2xl p-4 transition-colors`
- No border, no shadow

**Rationale:** Bookmarks rows sit on `bg-background` (same as History Questions). The parent-aware foreground ramp from BS-048 applies: `[0.08]` rest / `[0.12]` hover on page background matches the perceived brightness of `5` / `[0.08]` inside `bg-card`. History Questions uses exactly this token pair.

### Gap 2: Remove "Review" button — PROPOSED

**Current:** `<Button asChild variant="outline" className="rounded-full"><Link href={...}>Review</Link></Button>` — navigates to the exact same href as the title link.

**Proposed:** Remove entirely. Clicking the row navigates to the question review page.

**Rationale:** Identical to BS-048 Gap 5 (History Questions "Review" pill removal). The entire row is the navigation target. Cursor, hover fill, and focus ring communicate "this is clickable." A redundant button adds visual weight and creates a confusing dual-target: "Do I click the title or the button?"

### Gap 3: Remove title `hover:underline` — PROPOSED

**Current:** `<Link className="rounded-sm hover:underline focus-visible:...">`

**Proposed:** Remove `hover:underline`. The whole-row hover fill replaces the underline as the interactive affordance.

**Rationale:** Same as BS-048 Gap 3. Inside a tonal fill row with cursor-pointer and hover background transition, an underline is visually noisy and redundant.

### Gap 4: Keep "Remove" button — PROPOSED

**Current:** `<Button variant="outline" className="rounded-full">Remove</Button>` with `<AlertDialog>` confirmation.

**Proposed:** Keep the Remove button and AlertDialog. This is a destructive action that is functionally distinct from navigation — it must remain a separate, explicit control.

**Open question:** Button variant and positioning within the new row structure. See Gap 5.

### Gap 5: Row structure with nested interactive element — OPEN

This is the key structural challenge. History Questions rows are pure `<Link>` elements with no nested actions. Bookmark rows need both whole-row navigation AND a Remove button that doesn't trigger navigation.

**Options:**

| Option | Structure | Pros | Cons |
|--------|-----------|------|------|
| **A: Overlay link** | `<div>` container + `<Link>` with `absolute inset-0` + Remove button at `relative z-10` | Preserves native link semantics (right-click, middle-click). Clean separation. Common pattern (Linear, GitHub, Vercel). | Slightly more markup. Need to verify AlertDialog trigger z-index layering. |
| **B: Split layout** | Row is a `<div>`. Left content area wrapped in `<Link>`. Right column has Remove button outside the link. | Simplest HTML structure. No z-index concerns. | Link doesn't cover the full row width — clicking right-side whitespace does nothing. Less satisfying interaction feel. |
| **C: JS onClick** | Row is a `<div>` with `onClick={() => router.push(...)}`. Remove button uses `e.stopPropagation()`. | Simple implementation. | Loses native link semantics (no right-click → open in new tab, no middle-click, no cmd+click). Bad for accessibility. |

**Leaning toward Option A** — overlay link is the established premium pattern and preserves full link semantics. The AlertDialog trigger button would need `relative z-10` to sit above the overlay link.

### Gap 6: Empty state card — PROPOSED

**Current:** `<Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm dark:border-foreground/40">`

**Proposed:** Keep as `<Card>` but remove the `dark:border-foreground/40` override. The empty state is a CTA container (contains text + "Start practicing" button), not a list row. It should use the standard Card surface (S-1 pattern) without the heavy dark border override.

**Rationale:** CTA containers are structurally different from list rows. The Card surface is appropriate here. But the explicit dark border override should go — it was added when all cards got `dark:border-foreground/40`, which BS-044 identified as aesthetically heavy. Standard `border-border` is sufficient.

### Gap 7: Unavailable question rows — PROPOSED

**Current:** Unavailable bookmarks use the same `<Card>` with the same border/shadow treatment, but show "[Question no longer available]" text with no Review button.

**Proposed:** Same borderless tonal fill at rest (`bg-foreground/[0.08]`), but:
- No hover state (static — not clickable)
- No cursor-pointer
- No focus ring
- Matches the History Questions unavailable row pattern exactly

### Gap 8: Padding density — OPEN

History Questions uses `p-4` (compact). Current bookmarks use `p-6` (spacious). The bookmark rows show more content (full question text excerpt below the title), so `p-4` may feel cramped.

**Options:**
- Match History Questions at `p-4` for full consistency
- Keep `p-6` if content density justifies it
- Split: `p-4` vertical + `px-5` horizontal (custom density)

Needs visual verification after implementation.

---

## Relationship to Existing Patterns

After these changes, bookmarks would join the "standalone navigation row on page background" family documented in the Pattern Registry:

| Surface | Context | Rest fill | Hover fill | Trailing action |
|---------|---------|-----------|------------|----------------|
| History Questions | `/app/history` (Questions tab) | `bg-foreground/[0.08]` | `hover:bg-foreground/[0.12]` | None |
| **Bookmarks (proposed)** | `/app/bookmarks` | `bg-foreground/[0.08]` | `hover:bg-foreground/[0.12]` | Remove button (z-10 above overlay link) |
| Dashboard Activity | `/app/dashboard` (inside card) | `bg-foreground/5` | `hover:bg-foreground/[0.08]` | None |

Bookmarks would be the first surface in this family with a nested destructive action, establishing a reusable pattern for "tonal fill row with secondary action button."

---

## Open Questions

1. **Gap 5 decision:** Overlay link (Option A) vs split layout (Option B)? Need to verify AlertDialog plays well with overlay link z-index layering.

2. **Gap 8 decision:** `p-4` or `p-6` padding? Needs visual verification.

3. **Remove button variant:** Currently `variant="outline" className="rounded-full"`. Should this stay outline, or shift to `variant="ghost"` to reduce visual weight in the new borderless row? Ghost would be more subtle; outline would maintain the current explicit affordance.

4. **Should we also create a page spec?** `docs/frontend/pages/` has specs for dashboard, practice, and quick-practice but not bookmarks. A page spec would document the component inventory and surface hierarchy after these changes.

5. **Mobile layout:** Current bookmarks stack vertically on mobile (`flex-col gap-4 sm:flex-row`). With the Review button removed and only Remove remaining, does the mobile layout need adjustment? The button could sit inline with metadata on mobile.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-12 | Created BS-049 | Visual audit identified bookmarks as the remaining surface using bordered cards while History/Dashboard have moved to borderless tonal fill. Direct precedent in BS-048 (History row cleanup). |
