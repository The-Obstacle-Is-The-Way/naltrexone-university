# BS-049: Bookmarks Card Visual Unification

**Date:** 2026-03-12
**Triggered by:** Visual comparison of Bookmarks page against recently unified History Questions tab and Dashboard Recent Activity
**Scope:** Bookmark cards use bordered `<Card>` with elevated styling, redundant "Review" button, and title link hover. That bordered-card treatment now looks visually dated next to the borderless tonal-fill row patterns used by History Questions and Dashboard Recent Activity.
**Related:** [DEBT-307](../debt/debt-307-bookmarks-row-visual-unification.md), [BS-048](./bs-048-history-row-fill-depth-and-hover-policy.md) (History row fill/affordance cleanup — direct precedent), [DEBT-302](../debt/debt-302-history-row-fill-and-affordance-cleanup.md), [DEBT-289](../debt/debt-289-dashboard-nested-card-surface-strategy.md) (Dashboard tonal-fill row precedent), [BS-044](../../brainstorming/bs-044-dark-mode-border-weight-tiering.md) (border weight tiering), [Pattern Registry](../../frontend/pattern-registry.md), [Contrast Policy](../../frontend/contrast-policy.md)

---

## The Problem

The Bookmarks page (`app/(app)/app/bookmarks/page.tsx`) still reflects the older bordered-card question-row pattern. It now stands out as the only question-list surface that still uses elevated `<Card>` containers with explicit action buttons instead of the newer tonal-fill row treatments used by History Questions and Dashboard Recent Activity.

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
| Click target | Title link + redundant Review button | Entire row | Entire row |
| Trailing action | "Review" button + "Remove" button | None (pill removed in DEBT-302) | None |
| Nav affordance | Title underline + Review button | Cursor + hover fill + focus ring | Cursor + hover fill + focus ring |
| Metadata shown | Difficulty (plain text) + bookmarked date | Result (colored) + difficulty + date + session type | Result (colored) + date; difficulty as pill badge |
| Result status | Not shown | Correct/Incorrect with `text-success`/`text-destructive` | Correct/Incorrect with `text-success`/`text-destructive` |

Bookmarks sits on `bg-background` (page surface, not inside a Card container), so it should follow the History Questions convention: `bg-foreground/[0.08]` rest, `hover:bg-foreground/[0.12]` hover (the parent-aware foreground ramp established in BS-048 Gap 1/6).

---

## Root Cause Analysis

1. **Bookmarks still uses the older bordered-card row treatment.** History Questions and Dashboard Recent Activity have since converged on borderless tonal fill rows, but bookmarks has not yet followed that visual shift.

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
| **A: Overlay link** | `relative` container + absolutely positioned `<Link className="inset-0">` + Remove button at higher z-index | Preserves native link semantics (right-click, middle-click, open in new tab) while making the visible row feel fully clickable. | Not currently an established in-repo pattern. Needs explicit focus-ring handling and AlertDialog trigger layering verification. |
| **B: Delegated container activation** | Pointer-clickable row container + explicit title `<Link>` + Remove button guard (History Sessions pattern) | Matches existing multi-action row precedent in this repo. No overlay stacking. Keyboard/native link semantics stay on the explicit Link. | Full-row activation is pointer convenience rather than a native full-surface link. Requires click-guard logic, and right-side whitespace is not a semantic Link target. |
| **C: Split layout** | Row is a `<div>`. Left content area wrapped in `<Link>`. Right column has Remove button outside the link. | Simplest HTML structure. No z-index concerns. | Link doesn't cover the full row width, so the row can feel less unified than History Questions. |

**Updated recommendation:** Option A is viable if we want native full-row link semantics, but it is not yet an established local pattern. Option B currently has the stronger in-repo precedent (`history-sessions-tab.tsx`) for rows that combine row-level navigation intent with separate secondary controls. If Option A is chosen, we should treat it as a new pattern and document the focus/z-index recipe in the Pattern Registry.

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
- Reuses the same static page-background tonal surface treatment as the History Questions unavailable row pattern

**Rationale:** The visual surface treatment should align with the History unavailable-row family, but the metadata remains bookmarks-specific (`Unavailable • Bookmarked {date}` rather than result/session metadata).

### Gap 8: Missing result status in metadata — OPEN

**Current:** Bookmark metadata shows only `{difficulty} • Bookmarked {date}`. There is no indication of whether the user previously answered the question correctly or incorrectly.

**History Questions shows:** `{Correct|Incorrect} • {difficulty} • {date} • {session type}` — with the result colored `text-success` (green) or `text-destructive` (red).

**Dashboard Activity shows:** `{Correct|Incorrect} • {date}` — same colored result status.

**The data gap:** `BookmarkRow` (`src/application/ports/bookmarks.ts`) currently only carries `questionId`, `slug`, `stemMd`, `difficulty`, and `bookmarkedAt`. It does **not** include `isCorrect` or any attempt result. Adding result status would require the `GetBookmarksUseCase` to join against the user's attempt history — a data-layer change, not just CSS.

**Options:**
- **A: Add result status** — Enrich `BookmarkRow` with `lastResult?: 'correct' | 'incorrect'` by joining against attempts. Aligns metadata with History Questions. Adds query complexity.
- **B: Keep metadata as-is** — Bookmarks serves a different purpose (review list, not history). The user bookmarked a question to revisit it — showing their previous result may not be the primary signal. Keep the simpler metadata.
- **C: Add result status only if attempted** — Show result when available, show "Not yet attempted" otherwise. Most informative but adds visual complexity.

**Needs decision.** This is a content/data question, not a visual treatment question. It can be deferred and addressed separately from the visual unification pass if needed.

### Gap 9: Spacing density — OPEN

History Questions uses `p-4` with `ul className="space-y-4"`. Current bookmarks use `p-6` with `ul className="space-y-3"`. The bookmark rows show more content (full question text excerpt below the title), so matching History exactly may feel cramped, but keeping the current roomier card padding and tighter inter-row gap may blunt the visual unification.

**Options:**
- Match History Questions at `p-4` and `space-y-4` for full consistency
- Keep a roomier content density (`p-6` and/or `space-y-3`) if the longer excerpt needs more breathing room
- Split the difference: `px-5 py-4` with `space-y-4`

Needs visual verification after implementation.

---

## Relationship to Existing Patterns

After these changes, bookmarks would join the "standalone navigation row on page background" family documented in the Pattern Registry:

| Surface | Context | Rest fill | Hover fill | Trailing action |
|---------|---------|-----------|------------|----------------|
| History Questions | `/app/history` (Questions tab) | `bg-foreground/[0.08]` | `hover:bg-foreground/[0.12]` | None |
| **Bookmarks (proposed)** | `/app/bookmarks` | `bg-foreground/[0.08]` | `hover:bg-foreground/[0.12]` | Remove button with structure TBD (overlay link or delegated activation) |
| Dashboard Activity | `/app/dashboard` (inside card) | `bg-foreground/5` | `hover:bg-foreground/[0.08]` | None |

Bookmarks would be the first surface in this family with a nested destructive action. If implemented, it should establish a reusable local pattern for "tonal fill row with secondary action button" rather than relying on one-off structure.

The Pattern Registry decision tree currently routes standalone lists with embedded controls to the legacy "bookmarks pattern — Card contains buttons/links" branch. Implementing BS-049 should replace that branch with the chosen row-with-secondary-action pattern instead of leaving the new structure undocumented.

---

## Open Questions

1. **Gap 5 decision:** Overlay link (Option A, new local pattern) vs delegated container activation (Option B, existing local precedent from History Sessions)?

2. **Focus treatment for Gap 5:** If Option A wins, should the row-level focus ring live on the overlay Link itself or be mirrored onto the container with `focus-within` so the visible surface reads like the other row patterns?

3. **Gap 8 decision:** Should bookmarks show result status (correct/incorrect)? This is a data-layer question that can be decoupled from the visual pass.

4. **Gap 9 decision:** `p-4` + `space-y-4`, `p-6` + `space-y-3`, or a hybrid spacing recipe? Needs visual verification.

5. **Remove button variant:** Pattern Registry currently classifies secondary actions like `Remove` as `outline` + `rounded-full`. Should bookmarks stay on that standard, or does the borderless row justify a documented `ghost` exception?

6. **Mobile layout:** Current bookmarks stack vertically on mobile (`flex-col gap-4 sm:flex-row`). With the Review button removed and only Remove remaining, does the mobile layout need adjustment? The button could sit inline with metadata on mobile.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-12 | Created BS-049 | Visual audit identified bookmarks as the remaining surface using bordered cards while History/Dashboard have moved to borderless tonal fill. Direct precedent in BS-048 (History row cleanup). |
| 2026-03-12 | Added Gap 8 (result status metadata) | Chrome browser visual audit revealed Bookmarks is the only question-list surface missing correct/incorrect result status. History and Dashboard both show colored result indicators. Data-layer change required — `BookmarkRow` currently lacks attempt data. |
| 2026-03-12 | Promoted to DEBT-307 | Implementation contract settled in debt form: bookmarks will adopt page-background tonal rows, delegated container activation, outline `Remove`, and no result-status data expansion in this pass. |
| 2026-03-12 | DEBT-307 resolved | Bookmarks now ship the standalone tonal-row pattern with delegated pointer activation, no redundant `Review`, retained outline `Remove`, and synced Pattern Registry / Contrast Policy documentation. |
