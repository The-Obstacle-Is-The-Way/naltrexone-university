# DEBT-307: Bookmarks Row Visual Unification and Affordance Cleanup

**Priority:** P3
**Created:** 2026-03-12
**Status:** Open
**Source:** [BS-049](../_archive/brainstorming/bs-049-bookmarks-card-visual-unification.md)
**Related:** [DEBT-289](../_archive/debt/debt-289-dashboard-nested-card-surface-strategy.md), [DEBT-302](../_archive/debt/debt-302-history-row-fill-and-affordance-cleanup.md), [BS-044](../brainstorming/bs-044-dark-mode-border-weight-tiering.md), [Pattern Registry](../frontend/pattern-registry.md), [Contrast Policy](../frontend/contrast-policy.md)

---

## Context

Bookmarks is now the remaining question-list surface that still renders each item as a bordered, shadowed `<Card>` with two separate action targets:

- title `<Link>` with `hover:underline`
- `Review` outline pill pointing to the same href
- `Remove` outline pill with `AlertDialog`

History Questions and Dashboard Recent Activity have already converged on quieter tonal-fill row patterns:

- History Questions: `bg-foreground/[0.08]` rest, `hover:bg-foreground/[0.12]` hover on page background
- Dashboard Recent Activity: `bg-foreground/5` rest, `hover:bg-foreground/[0.08]` hover inside a parent card

BS-049 and the follow-up Chrome audit confirmed the main mismatches are row chrome, hover/affordance model, and density. The metadata differences are real, but not all of them belong in the same implementation slice.

---

## Decisions

### 1. Available bookmark rows move to the standalone tonal-row family

Available bookmark rows should stop rendering as bordered `<Card>` items and instead adopt the on-page tonal surface used by History Questions:

```tsx
rounded-2xl bg-foreground/[0.08] p-4 transition-colors hover:bg-foreground/[0.12]
```

Remove:

- `dark:border-foreground/40`
- `shadow-sm`
- legacy card-per-item chrome

This is the correct parent-surface match. Bookmarks sits directly on `bg-background`, so it should use the same foreground-ramp tokens as History Questions rather than the in-card Dashboard tokens.

### 2. Use delegated container activation, not an overlay link

Bookmarks rows need both navigation and a separate destructive action. The implementation decision is:

- use a pointer-clickable row container
- keep an explicit title `<Link>` for keyboard/native link semantics
- guard clicks originating from interactive descendants (`a`, `button`, form controls, dialog triggers)
- route row-container pointer clicks to the same review href as the title link

This follows the established local precedent in `history-sessions-tab.tsx` for multi-action rows. We are explicitly **not** introducing an overlay-link pattern in this debt.

Why:

- It avoids inventing a new stacked-hit-area pattern that does not yet exist in the codebase
- It keeps keyboard semantics on explicit controls
- It avoids z-index/focus interplay between an absolute link layer and the `AlertDialogTrigger`

### 3. Keep focus rings on explicit controls, not the whole row

Because the row contains multiple interactive elements, the focus treatment should stay control-local:

- title link keeps its focus-visible ring
- `Remove` button keeps the standard button focus-visible ring
- the row container itself is not a focusable pseudo-link and does not get a synthetic row-level focus ring

This is a deliberate consequence of Decision 2. The row behaves like a whole-row navigation target for pointer users, while keyboard users interact with explicit controls.

### 4. Remove the redundant `Review` button and title underline

Delete the `Review` pill entirely. It points to the same href as the title link and adds visual weight without adding information.

Also remove `hover:underline` from the title link. Hover feedback should come from the row-level tonal fill, not a secondary text-decoration cue.

### 5. Keep the `Remove` control as an outline pill

Retain the existing secondary-action button contract:

```tsx
<Button variant="outline" className="rounded-full">Remove</Button>
```

Do not switch this to `ghost` in this debt. The row itself is becoming quieter; the separate destructive-adjacent control should remain explicit and consistent with the Pattern Registry’s secondary-action guidance.

### 6. Unavailable bookmark rows become static tonal siblings

Unavailable rows should move onto the same page-background tonal family as available rows:

```tsx
rounded-2xl bg-foreground/[0.08] p-4
```

Do not add:

- hover fill
- `cursor-pointer`
- link wrapper
- row click delegation

These rows are static siblings, not navigable items.

### 7. Keep the empty state as a Card, but remove the heavy dark border override

The empty state remains a standard CTA-style `<Card>`. It is not a repeating list row and should not be forced into the tonal-row pattern.

Remove only the bookmarks-specific dark override:

```tsx
dark:border-foreground/40
```

Keep the default card surface, copy, and CTA structure.

### 8. Density should align with the standalone-row pattern

Adopt the History Questions density for the row family:

- row padding: `p-4`
- inter-row spacing: `space-y-4`

Do not keep the current bookmarks density (`p-6` with `space-y-3`). That roomier card spacing is part of the old card treatment and weakens the visual unification.

### 9. Metadata scope stays bookmarks-specific in this debt

This debt does **not** add result-status metadata, source/session labels, or a difficulty pill.

Keep:

- difficulty as plain inline text
- `Bookmarked {date}` copy

Do not add:

- `Correct` / `Incorrect`
- attempt-derived source/session metadata
- Dashboard-style difficulty badge

Rationale:

- `BookmarkRow` in `src/application/ports/bookmarks.ts` does not carry attempt outcome data
- adding result state requires a use-case/repository expansion, not a presentational tweak
- plain-text difficulty already aligns with History Questions, which is the closer sibling surface

If bookmark metadata is expanded later, that should ship as a separate data-contract debt/spec rather than being coupled to this visual pass.

---

## Acceptance Criteria

- [ ] Available bookmark rows no longer render with per-item `<Card>` chrome
- [ ] Available bookmark rows use `rounded-2xl bg-foreground/[0.08] p-4 transition-colors hover:bg-foreground/[0.12]`
- [ ] Bookmark list spacing is `space-y-4`
- [ ] Available rows do not render the `Review` button
- [ ] Available row title link does not use `hover:underline`
- [ ] Available rows use delegated container activation for pointer clicks, with guard logic for nested interactive descendants
- [ ] Title link remains the explicit keyboard-accessible navigation control
- [ ] `Remove` remains `variant="outline" className="rounded-full"`
- [ ] Unavailable rows use the static page-background tonal contract with no hover/cursor/link behavior
- [ ] Empty state `<Card>` no longer applies `dark:border-foreground/40`
- [ ] Metadata remains bookmarks-specific: difficulty + bookmarked date only
- [ ] No attempt-result join is added in this debt
- [ ] Pattern Registry decision tree no longer references the legacy “bookmarks pattern — Card contains buttons/links” branch
- [ ] Pattern Registry documents the chosen multi-action bookmarks row structure
- [ ] Contrast Policy classifies the new bookmark row fills as supplementary tonal surfaces

---

## Files to Modify

### Source

- `app/(app)/app/bookmarks/page.tsx`

### Tests

- `app/(app)/app/bookmarks/page.test.tsx`
- `tests/e2e/bookmarks.spec.ts`

### Documentation sync

- `docs/frontend/pattern-registry.md`
- `docs/frontend/contrast-policy.md`
- `docs/debt/index.md`
- `docs/_archive/brainstorming/bs-049-bookmarks-card-visual-unification.md`
- `docs/brainstorming/index.md`
- `docs/debt/debt-307-bookmarks-row-visual-unification.md`

---

## Deferred / Out of Scope

- Adding `Correct` / `Incorrect` bookmark metadata
- Joining bookmark rows against attempt history
- Adding session/source labels to bookmarks
- Converting bookmark difficulty to a pill badge
- Creating a dedicated bookmarks page spec in `docs/frontend/pages/`

If any of those are prioritized, they should be tracked as a separate follow-up once the visual row contract is shipped.
