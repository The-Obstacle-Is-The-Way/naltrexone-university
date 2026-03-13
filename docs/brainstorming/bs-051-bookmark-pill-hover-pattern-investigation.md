# BS-051: Bookmark Pill Hover Pattern Investigation — Remove Button Border Affordance

**Date:** 2026-03-13
**Triggered by:** While investigating the practice chip hover problem (BS-050), we noticed that the Bookmarks page Remove pill already has a superior hover pattern: the pill border brightens on hover (`dark:hover:border-foreground/70`) and its fill also deepens, producing a much clearer signal than the practice chips. This doc investigates that pattern and asks whether (a) it should be the standard for pill-shaped interactive elements and (b) what changes are planned for the bookmark pill itself.
**Scope:** Investigate the bookmark Remove pill's hover behavior, document it as a reference pattern, and note planned near-term changes to the bookmark pill (icon replacement).
**Related:** [BS-050](./bs-050-practice-chip-hover-affordance.md) (practice chip hover fix), [BS-049 (archived)](../_archive/brainstorming/bs-049-bookmarks-card-visual-unification.md) (bookmark card unification), [DEBT-307 (archived)](../_archive/debt/debt-307-bookmarks-row-visual-unification.md) (bookmark row visual unification), [BS-044](./bs-044-dark-mode-border-weight-tiering.md) (border tiering)

---

## The Problem (or Rather, the Pattern)

The bookmark Remove pill is actually a **positive example** — its hover behavior is the one thing that works well compared to the practice chips. The question isn't "what's wrong with it" but "what can we learn from it and what's planned next."

### Current bookmark Remove pill implementation

Located in `app/(app)/app/bookmarks/page.tsx`, the Remove button uses:

```tsx
<Button variant="outline" className="rounded-full">
  Remove
</Button>
```

Which resolves to the `outline` variant from `components/ui/button.tsx`:

```
border bg-background shadow-xs
hover:bg-accent hover:text-accent-foreground
dark:bg-input/30 dark:border-foreground/40
dark:hover:border-foreground/70 dark:hover:bg-input/50
```

### What makes the hover work

| Aspect | Rest | Hover | Delta |
|--------|------|-------|-------|
| **Dark border** | `foreground/40` | `foreground/70` | **+30 points** — clearly visible |
| **Dark fill** | `input/30` | `input/50` | +20 points — subtle but present |
| **Light border** | default `border` | no change | 0 — light mode relies on fill only |
| **Light fill** | `bg-background` | `bg-accent` | token swap — noticeable |

The dark-mode border brightening is the standout behavior. The pill edge "lights up" from a subtle 40% border to a prominent 70% border. This is the exact pattern missing from `FilterChip` (addressed in BS-050).

### Important comparison detail: the row also hovers

For available bookmarks, the Remove pill sits inside `BookmarkRowShell`, which also changes the row fill on hover:

```
Rest:  bg-foreground/[0.08]
Hover: bg-foreground/[0.12]
```

So the perceived clarity on the Bookmarks page is not coming from the button alone. It is a **layered hover stack**:

1. The row background lifts
2. The Remove pill fill lifts
3. In dark mode, the Remove pill border brightens significantly

This matters because the Practice page chips are being compared against a richer multi-layer hover treatment, not just a single border change in isolation.

### Light-mode gap

In light mode, the outline Button variant does **not** change its border on hover — it only changes the background fill to `bg-accent`. This works acceptably for a single Remove button, but if this pattern were adopted more broadly for chip selectors, a light-mode border hover step might also be valuable.

---

## Near-Term Plans: Bookmark Icon Replacement

The user has noted a plan to eventually replace the text "Remove" with a small bookmark graphic/icon inside the pill. This would be a cross-cutting change because:

1. **The pill shape and outline variant stay** — the container treatment is solid
2. **The content changes** — text → icon (small bookmark graphic)
3. **Accessibility implications** — `aria-label` already exists (`Remove bookmark: {stem}`), so the label remains even when visible text goes away
4. **Size may need adjustment** — an icon-only pill might need `size="icon"` or custom padding instead of the default `h-9 px-4 py-2`

This is explicitly **not in scope now** — the user wants to focus on the practice chip hover issue first. But documenting the intent here prevents future surprise when the bookmark pill eventually changes.

---

## What the Bookmark Pill Teaches Us

### The border-brightening hover pattern is effective

The `dark:hover:border-foreground/70` pattern provides a clear, elegant hover signal without relying on fill contrast alone. It should be considered the standard for pill-shaped interactive elements in dark mode.

### Fill-only hover is insufficient for grouped selectors

The practice chips demonstrate that a 3-point fill opacity bump is not enough signal in a group of adjacent pills. The bookmark Remove pill works better because it combines stronger button hover styling with row-level hover context, and because it's a standalone action button — there's no ambiguity about *which* element is hovered. In a chip group, border highlighting becomes essential.

### The outline Button variant already has the right tokens

The border hover behavior doesn't need to be invented — it exists in `button.tsx` line 19. The `FilterChip` component just needs to adopt the same approach.

---

## Open Questions

1. **Should the bookmark icon replacement be tracked as a separate spec/debt item?** It's a UX change (text → icon) with accessibility implications, not just a styling tweak.

2. **When the icon replacement happens, should it use the same `Button variant="outline"` or switch to a custom component?** The current approach (Button + `rounded-full`) is pragmatic, but an icon-only pill might warrant a dedicated `IconPill` or similar.

3. **Should light-mode outline buttons also get a border hover step?** Currently only dark mode brightens the border. The practice chip fix (BS-050) proposes adding `hover:border-foreground/70` for light mode too — should the Button outline variant follow suit for consistency?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-13 | Created BS-051 | Document the bookmark pill's hover pattern as a reference, note planned icon replacement, and cross-reference with BS-050 practice chip fix |
| 2026-03-13 | No immediate code changes to bookmark pill | The current hover behavior is the positive example. Changes are deferred to a future icon-replacement pass. |
| 2026-03-13 | Icon replacement brainstormed in [BS-052](./bs-052-bookmark-icon-toggle-replacement.md) | Full exploration of replacing text pills with filled/unfilled Bookmark icon toggle across both the Bookmarks page and Practice action bar. |
