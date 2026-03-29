# BS-052: Bookmark Icon Toggle — Replace Text Pills with Filled/Unfilled Bookmark Graphic

**Date:** 2026-03-13
**Triggered by:** User observation that the "Remove" pill on the Bookmarks page and the "Bookmark" / "Remove bookmark" pills in the Practice action bar feel heavy and text-forward for what is conceptually a simple toggle. The industry-standard pattern — a filled bookmark icon when bookmarked, an empty/outlined bookmark icon when not — would be more compact, more immediately recognizable, and more visually elegant.
**Scope:** Explore replacing text-based bookmark controls across the app with a toggle bookmark icon (filled ↔ outlined), starting with the Bookmarks page Remove pill and extending to the practice and review action bars.
**Related:** [BS-051](../_archive/brainstorming/bs-051-bookmark-pill-hover-pattern-investigation.md) (bookmark pill hover pattern), [BS-049 (archived)](../_archive/brainstorming/bs-049-bookmarks-card-visual-unification.md) (bookmark card unification), [DEBT-307 (archived)](../_archive/debt/debt-307-bookmarks-row-visual-unification.md) (bookmark row visual unification)

**Status:** Active — no icon-toggle UI has shipped. Later bookmark work changed surface timing and placement (`BS-053`, `DEBT-318`), but production still uses text pills for bookmark add/remove actions and the Bookmarks page still uses the AlertDialog-backed Remove pill.

---

## The Problem

### Current state: text pills everywhere

Bookmarking in the app is still text-based on every surfaced add/remove control:

| Surface | Current Control | Label |
|---------|----------------|-------|
| **Bookmarks page** (each row) | `Button variant="outline" rounded-full` | "Remove" |
| **Tutor / Quick Practice action bar** | `Button variant="outline" rounded-full` | "Bookmark" or "Remove bookmark" |
| **Question review / session review action bar** | `Button variant="outline" rounded-full` | "Bookmark" or "Remove bookmark" |

Both use outline pill buttons with text labels. This works functionally but has drawbacks:

1. **Takes up horizontal space** — "Remove bookmark" is a wide pill, especially on mobile
2. **Doesn't leverage universal iconography** — users instantly recognize the bookmark icon shape (the flag/ribbon) across every browser, every app, every platform
3. **Text labels for a binary toggle feel verbose** — a filled/unfilled icon communicates the same state with zero reading effort
4. **The "Remove" label on the Bookmarks page is ambiguous** — Remove what? The question? The bookmark? An icon toggle makes the action self-evident

### The standard pattern

Nearly every modern app uses the bookmark/save toggle icon:

```
Not bookmarked:  ☐  (outlined bookmark shape — empty, clickable)
Bookmarked:      ☑  (filled bookmark shape — solid, clickable to remove)
```

Examples:
- **Chrome/Safari/Firefox**: Outlined star → filled star in the address bar
- **Twitter/X**: Outlined bookmark → filled bookmark on tweets
- **YouTube**: Save button uses outlined → filled bookmark
- **Notion**: Star/bookmark icon toggle in the corner
- **VS Code**: Bookmark icon toggle in editor gutter

The pattern is: icon sits in a predictable position (usually top-right corner of the item), outlined when inactive, filled when active. One click toggles. No text needed, and heavier confirmation UX is often replaced with lightweight reversal or undo.

---

## Current Architecture (What We're Working With)

### Domain layer — already supports toggle

`toggle-bookmark.ts` already implements idempotent toggle logic:
- If bookmarked → removes it, returns `{ bookmarked: false }`
- If not bookmarked → adds it, returns `{ bookmarked: true }`

No domain changes needed. The icon toggle maps 1:1 to the existing use case.

### Bookmarks page — currently has a confirmation dialog

`RemoveBookmarkControl` in `app/(app)/app/bookmarks/page.tsx` currently:
1. Shows a "Remove" outline pill
2. On click, opens an `AlertDialog` confirmation ("Remove bookmark?")
3. On confirm, calls `removeBookmarkAction` server action
4. Revalidates `/app/bookmarks` and redirects with toast
5. Is covered by page tests and E2E flows that currently assume the confirm-then-redirect behavior

With an icon toggle, the confirmation dialog becomes optional, but the reversibility story differs by surface. On the Practice page, the action is instantly reversible because the control stays visible. On the Bookmarks page, removing the bookmark removes the row from the current list, so reversal is **not** instant unless we also add undo support or keep the row visible optimistically. This makes the bookmarks-surface migration more behaviorally significant than a simple icon swap.

### Practice action bar — already has toggle state

`practice-view.tsx` already tracks `isBookmarked` and renders conditionally:
- Not bookmarked → "Bookmark" button
- Bookmarked → "Remove bookmark" button
- Loading → disabled state

The icon version would render the same states visually (outlined vs filled) with the same `onToggleBookmark()` handler.

### Question review / session review action bar — also text-based today

`question-page-client.tsx` renders the same text bookmark pill in review mode once bookmark state hydrates:
- Not bookmarked → "Bookmark"
- Bookmarked → "Remove bookmark"
- Loading/saving → disabled state

This means the eventual icon-toggle rollout is broader than just Bookmarks page + active practice. The review page now carries the same text-pill pattern.

### Available icons

Lucide React (already in the project) provides:
- `Bookmark` — outlined bookmark shape (the empty state)
- `BookmarkCheck` — bookmark with checkmark (could indicate saved)
- `BookmarkMinus` — bookmark with minus (could indicate remove)
- `BookmarkPlus` — bookmark with plus (could indicate add)
- `BookmarkX` — bookmark with X

The simplest approach: use `Bookmark` from Lucide with `fill` prop toggled:
- **Not bookmarked**: `<Bookmark className="size-5" />` (stroke only, empty)
- **Bookmarked**: `<Bookmark className="size-5 fill-current" />` (filled)

This is one icon, two visual states. Clean and minimal.

---

## Proposed Design

### Surface 1: Bookmarks Page (Row-Level Toggle)

**Current:**
```
┌─────────────────────────────────────────────────────────┐
│ A patient with a history of polysubstance...    [Remove]│
│ Hard • Bookmarked Feb 9, 2026                           │
└─────────────────────────────────────────────────────────┘
```

**Proposed:**
```
┌─────────────────────────────────────────────────────────┐
│ A patient with a history of polysubstance...        [🔖]│
│ Hard • Bookmarked Feb 9, 2026                           │
└─────────────────────────────────────────────────────────┘
```

Where `[🔖]` is a filled Bookmark icon (since every item on this page is bookmarked). Clicking it removes the bookmark, but the row-disappearing behavior means we need an explicit decision: keep confirmation, add undo, or keep the row around optimistically long enough to reverse.

**Key decisions:**
- **Position**: Right side of the row, vertically centered (replacing the Remove pill's position)
- **Icon state**: Always filled on bookmarks page (they're all bookmarked by definition)
- **Click behavior**: Open question for decision. Options are immediate remove + undo toast, keep the existing confirmation until undo exists, or keep the row visible optimistically long enough to reverse
- **Size**: `size-5` (20px) — standard for inline row icons
- **Hit target**: Use an icon-sized control only if the surrounding pill/padding still preserves an approximately 44×44px touch target
- **Hover**: Icon color darkens/lightens, optional scale micro-animation

### Surface 2: Practice Action Bar (Toggle)

**Current:**
```
┌─────────────────────────────────────────────────────────┐
│  [← Previous]          [Bookmark]          [Next →]     │
└─────────────────────────────────────────────────────────┘
```

**Proposed:**
```
┌─────────────────────────────────────────────────────────┐
│  [← Previous]            [🔖]              [Next →]     │
└─────────────────────────────────────────────────────────┘
```

Where the icon toggles between outlined (not bookmarked) and filled (bookmarked) on click. The existing toast messages ("Question bookmarked." / "Bookmark removed.") remain.

**Key decisions:**
- **Position**: Same spot in the action bar, but icon-only instead of text pill
- **Icon states**: Outlined = not bookmarked, filled = bookmarked
- **Accessible label**: `aria-label="Bookmark question"` or `aria-label="Remove bookmark"` (dynamic)
- **`aria-pressed`**: Already exists on the current button, keeps working
- **Loading state**: Dim/pulse the icon while `bookmarkStatus === 'loading'`

### Component: `BookmarkToggle`

A shared component used on both surfaces:

```tsx
// components/ui/bookmark-toggle.tsx (sketch)
type BookmarkToggleProps = {
  bookmarked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: 'sm' | 'default';
  label: string; // for aria-label stem, e.g. question title
};

function BookmarkToggle({ bookmarked, onToggle, disabled, size = 'default', label }: BookmarkToggleProps) {
  return (
    <Button
      variant="outline"
      aria-label={bookmarked ? `Remove bookmark: ${label}` : `Bookmark: ${label}`}
      aria-pressed={bookmarked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'rounded-full',
        size === 'sm' ? 'h-8 px-2.5' : 'h-9 px-3',
      )}
    >
      <Bookmark
        className={cn(
          size === 'sm' ? 'size-4' : 'size-5',
          bookmarked && 'fill-current',
        )}
      />
    </Button>
  );
}
```

---

## Cross-Cutting Concerns

### 1. Confirmation dialog removal (Bookmarks page)

Currently the Remove action has a confirmation dialog. With a toggle icon, this becomes friction:
- **One click to open dialog → one click to confirm → done** (current: 2 clicks)
- **One click to toggle → done, undo available via toast** (proposed: 1 click + undo safety net)

The undo toast pattern is more modern and less disruptive. However, this is a behavioral change — the user accidentally clicking the icon would remove the bookmark immediately. The undo toast mitigates this.

**Open question:** Should we add an undo mechanism to the toast? Currently the redirect-based flow doesn't support undo. This would require either:
- Optimistic UI: remove the row visually, re-add on undo (client-side state)
- Server-side undo: toast triggers a re-bookmark action within a time window

### 2. Accessibility

- `aria-pressed` already works for the toggle pattern
- `aria-label` must be dynamic and descriptive (already is on the current button)
- The icon alone is not sufficient — screen readers need the label
- Focus ring styling inherits from `Button` component
- Color contrast: Lucide stroke icons typically render at full foreground color, meeting contrast requirements

### 3. Mobile touch targets

The current "Remove" pill is large and easy to tap. An icon button must maintain a minimum 44×44px touch target (WCAG 2.5.8). The `Button size="icon"` variant at `size-9` (36px) is slightly under — may need `size-10` (40px) or padding adjustment.

### 4. Visual feedback on state change

When the bookmark state toggles:
- **Fill transition**: CSS `transition-colors` on the icon so the fill animates in/out
- **Optional micro-scale**: Brief `scale-110` on click for tactile feedback (like Twitter's heart animation, but subtle)
- **Toast message**: Keep existing toast behavior for confirmation

---

## Phasing

### Phase 1: Bookmarks page only
- Replace "Remove" pill with filled `BookmarkToggle` icon
- Decide whether to remove `AlertDialog` immediately or keep it until undo/optimistic reversal exists
- Update redirect/toast flow or replace it with a local state transition
- Narrowest surface area, but not behavior-free because the current list removes the item entirely

### Phase 2: Practice + review action bars
- Replace "Bookmark" / "Remove bookmark" text pills with `BookmarkToggle`
- Keep existing toggle logic and toast notifications
- Higher cross-cutting impact — touches quick practice, tutor session practice, question review, and session-review action bar layout

### Phase 3 (optional): Corner-positioned bookmark icon on question surfaces
- Add a small bookmark icon in the top-right corner of applicable question surfaces (for example history rows/cards or bookmark rows)
- This is the "bookmark in the corner" pattern — visible bookmark state at a glance without needing to open the question
- Largest scope — would touch card components across multiple pages

---

## Open Questions

1. **Undo toast vs confirmation dialog?** Removing the confirmation dialog is simpler and more modern, but undo requires client-side state management or a time-windowed server action. Is the complexity worth it, or is "no confirmation, no undo" acceptable since re-bookmarking is trivial?

2. **Icon color when bookmarked?** Options:
   - `fill-current` (matches text color — neutral, matches the row)
   - `fill-primary` / `text-primary` (accent color — draws attention, clearly "active")
   - `fill-amber-400` / `text-amber-400` (warm gold — classic bookmark color, like Chrome's star)

3. **Should Phase 3 (corner icon on cards) happen?** The user mentioned wanting the icon "in the corner of things" — this could mean the bookmarks page row (Phase 1) or literally a persistent corner icon on every question card. The latter is a bigger design decision.

4. **Animation on toggle?** A brief fill animation makes the toggle feel responsive. But animation adds complexity and may not align with the app's current interaction patterns (which are straightforward transitions). Worth it?

5. **Does this affect the `FilterChip` component at all?** No — bookmark toggle is a separate interaction pattern from filter chip selection. But both will exist as pill-shaped controls, so visual consistency matters.

6. **Should the action-bar bookmark be icon-only or icon+label?** Icon-only is compact but requires the user to know what the icon means. Icon+label ("Bookmark" with icon) is safer for discoverability but less compact. The bookmarks page can get away with icon-only because context is clear (it's a bookmarks list). Practice and review action bars may benefit from icon+short label on first encounter.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-13 | Created BS-052 | Text pills for bookmark toggle are verbose and don't leverage universal bookmark iconography. The filled/unfilled bookmark icon pattern is a well-understood interaction across all major platforms. |
| 2026-03-13 | Proposed phased rollout (bookmarks page first) | Narrowest initial surface area, though still behaviorally significant because removing from the list is not instantly reversible |
| 2026-03-13 | No code changes yet | Brainstorming only — needs design decisions on icon color, undo behavior, and phasing before implementation |
| 2026-03-29 | Refreshed current-state inventory | Production still uses text pills on the Bookmarks page, tutor/quick-practice action bar, and review/session-review action bar. Later bookmark work changed timing and placement, but did not land the icon-toggle UI proposed here. |
