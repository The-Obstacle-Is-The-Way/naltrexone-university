# BS-047: History Sessions Tab — Visual Unification with Dashboard & Practice

**Date:** 2026-03-10
**Triggered by:** Visual audit of the History Sessions tab after dashboard (DEBT-289) and practice (DEBT-290/291/292/294/295/297) received tonal fill, borderless nested surfaces, and chevron disclosure patterns. The History tab is now the most visually dated page in the app.
**Scope:** Identify every visual gap between the History Sessions tab and the established patterns on Dashboard and Practice, so the fixes can be specced and implemented sequentially.
**Related:** [Dashboard page doc](../frontend/pages/dashboard.md), [Practice page doc](../frontend/pages/practice.md), [BS-044](./bs-044-dark-mode-border-weight-tiering.md) (border tiering), [Pattern Registry](../frontend/pattern-registry.md), [Contrast Policy](../frontend/contrast-policy.md)

---

## Current State (Screenshot Evidence)

The History Sessions tab shows a list of completed sessions as **fully bordered white-outlined boxes** on the dark background. Each row has:
- A visible `border border-border/60` + `dark:border-foreground/40` border (the "cage" effect from BS-044)
- A "View breakdown" outline button per row
- No tonal fill differentiation — rows sit flat against the card/page background
- When expanded, the breakdown region uses a heavy `dark:border-foreground/40` separator

**In contrast**, the Dashboard and Practice pages now use:
- **Borderless tonal fill rows** (`bg-foreground/5`, no border) for nested surfaces
- **Chevron disclosure** (`<ChevronDown>` with `group-open:rotate-180`) for expandable sections on Practice
- **Tonal badge pills** (`bg-foreground/[0.06] border-0 text-foreground/60`) for mode badges on Dashboard
- **Subtle hover ramp** (`hover:bg-foreground/[0.08]`) instead of border-color changes

---

## Gap Inventory

### Gap 1: Session Rows Use Bordered Boxes Instead of Tonal Fill

**Current** (`history-sessions-tab.tsx:180–185`):
```
rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors
dark:border-foreground/40
hover:bg-muted/40 dark:hover:border-foreground/70
```

**Established pattern** (Dashboard `page.tsx:154`):
```
block rounded-xl bg-foreground/5 p-3 transition-colors
hover:bg-foreground/[0.08]
```
No border. Tonal fill defines the surface. Hover lifts fill monotonically.

**Gap:** The history session rows should switch from bordered boxes to the borderless tonal fill established on Dashboard. This eliminates the "wall of cages" (BS-044 T2 concern) and aligns the nested-surface strategy across the app.

**Risk:** Low — local layout change. The row already has `bg-muted/20`; switching to `bg-foreground/5` is a token swap. The border removal is the key visual change.

---

### Gap 2: "View Breakdown" Button Should Be a Chevron Disclosure

**Current** (`history-sessions-tab.tsx:224–236`):
```tsx
<Button variant="outline" className="rounded-full">
  {isSelected ? 'Hide breakdown' : 'View breakdown'}
</Button>
```
A full outline button with text that toggles between "View breakdown" and "Hide breakdown".

**Established pattern** (Practice `practice-session-starter.tsx:213–221`):
```tsx
<summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground ...">
  <span>Topic</span>
  <span className="flex items-center gap-2">
    <span className="text-xs font-normal text-foreground/60">metadata</span>
    <ChevronDown className="h-4 w-4 text-foreground/60 transition-transform group-open:rotate-180" />
  </span>
</summary>
```
A chevron icon that rotates on open. No button chrome. The entire row is the disclosure trigger.

**Gap:** Replace the "View breakdown" outline button with a chevron icon at the trailing edge of the session row. The entire row already has `onClick` navigation behavior — the chevron would serve as the disclosure indicator for the breakdown section, similar to how practice tag filters use `<ChevronDown>`.

**Design decision needed:** The practice page uses native `<details>`/`<summary>` for its disclosure, which gets `group-open:rotate-180` for free. The history breakdown uses React state (`selectedSessionId`) with async data fetching. Options:
- **A**: Keep React state control, add a `<ChevronDown>` icon that rotates based on `isSelected` (no native `<details>`)
- **B**: Migrate to `<details>` with a controlled `open` prop (would need to intercept toggle for async loading)

Option A is simpler and preserves the existing async loading architecture.

**Risk:** Low. The button removal simplifies the row. The chevron is less visually noisy.

---

### Gap 3: No Container Card Wrapping the Session List

**Current:** The session rows (`<ul className="space-y-2">`) render directly on the page background with no wrapping Card.

**Established pattern** (Dashboard `page.tsx:121`):
```tsx
<Card className="gap-0 rounded-2xl p-6 shadow-sm">
  <div className="text-sm font-medium text-foreground">Recent sessions</div>
  <ul className="mt-4 space-y-2">
    {/* tonal fill rows inside card */}
  </ul>
</Card>
```
A Card container wraps the list. Tonal fill rows sit inside the card, creating the two-layer surface hierarchy:
```
bg-background → bg-card → bg-foreground/5 (row)
```

**Gap:** The History Sessions tab has no wrapping Card. The rows float directly on `bg-background`. This means the tonal fill rows would need to be visible against the page background rather than a card background. Two options:
- **A**: Add a wrapping `<Card>` (matches Dashboard 1:1)
- **B**: Keep rows on page background but ensure `bg-foreground/5` still reads as a distinct surface against `bg-background` (it does — the contrast is the same since `bg-card` and `bg-background` are very close in dark mode)

**Decision:** This is a judgment call. The Dashboard has a denser layout with two side-by-side cards, so the Card wrapper serves double duty as a layout container. The History tab is a single-column list that fills the page width — a wrapping Card would add an extra border/surface layer that may not be needed.

**Recommendation:** Option B — keep rows on page background without a wrapping Card. The tonal fill rows provide sufficient surface definition. If it looks thin in practice, the Card can be added in a follow-up.

**Risk:** None for Option B. Option A would need visual verification.

---

### Gap 4: Breakdown Separator Is Visually Heavy

**Current** (`history-sessions-tab.tsx:245`):
```
mt-3 border-t border-border/30 pt-3 dark:border-foreground/40
```

**Concern:** The `dark:border-foreground/40` override makes the separator as prominent as the row boundary itself. Inside a tonal fill row, the separator should be softer — it's internal structure, not a boundary.

**Established reference** (Dashboard activity rows): Dashboard rows don't have internal separators — they're atomic. But the breakdown list (`session-breakdown-list.tsx:28`) uses `divide-y divide-border/20 dark:divide-foreground/40`.

**Gap:** If we switch rows to tonal fill (Gap 1), the breakdown separator should soften to match. Options:
- Use `border-foreground/15` or `border-foreground/20` in dark mode
- Remove the border entirely and rely on spacing (`mt-3 pt-3`) to separate content from breakdown

**Risk:** Low. Internal to the row.

---

### Gap 5: Breakdown List Dividers Have Asymmetric Dark Mode Treatment

**Current** (`session-breakdown-list.tsx:28`):
```
divide-y divide-border/20 dark:divide-foreground/40
```

Light mode: `/20` (very subtle). Dark mode: `/40` (as prominent as interactive element borders).

**Gap:** The dark mode dividers are disproportionately heavy compared to light mode. These are T4 decorative separators (BS-044 classification) — they should use a softer dark token like `dark:divide-foreground/15` or `dark:divide-foreground/20` to match the light mode subtlety.

**Risk:** Low. Internal list separators.

---

### Gap 6: Mode Badge Treatment (Minor)

**Current:** Session rows display mode as inline text: `<span className="font-medium">{formatSessionMode(mode)}</span>`.

**Established pattern** (Dashboard `page.tsx:157`):
```tsx
<span className="inline-flex items-center rounded-full border-0 bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium text-foreground/60">
  {toSentenceCase(row.mode)}
</span>
```
A borderless tonal pill badge.

**Gap:** The history session rows use plain text for mode while Dashboard uses a tonal pill badge. This is a minor visual inconsistency — the history rows show mode as part of a dot-separated summary line (`Tutor • 0/5 correct (0%) • 43m 9s • Mar 7, 2026`) which is a different layout pattern from Dashboard's stacked card layout. The dot-separated summary may not benefit from a badge.

**Decision:** Defer — this is a layout-level difference, not just a token difference. The summary line format works well for the denser history list. Badge treatment would require rethinking the row layout.

**Risk:** N/A (deferred).

---

## Summary of Proposed Changes

| # | Gap | Action | Priority | Risk |
|---|-----|--------|----------|------|
| 1 | Bordered rows → tonal fill | Switch session rows to `bg-foreground/5` borderless pattern | P1 | Low |
| 2 | "View breakdown" button → chevron | Replace outline button with `<ChevronDown>` icon (Option A) | P1 | Low |
| 3 | No container Card | Keep as-is (Option B) — rows on page background | — | — |
| 4 | Heavy breakdown separator | Soften dark mode to `border-foreground/15` or remove | P2 | Low |
| 5 | Asymmetric breakdown dividers | Soften dark mode to `divide-foreground/15` or `/20` | P2 | Low |
| 6 | Mode badge treatment | Defer — different layout context | P3 | — |

---

## Open Questions

1. **Should the entire row be the disclosure trigger for breakdown?** Currently the row click navigates to session review. If the row also serves as the breakdown trigger, we need to decide which action wins. Options: (a) chevron is the only breakdown trigger, row click navigates; (b) swap — row click opens breakdown, link inside navigates.

2. **Do we need the breakdown at all on this page?** The Dashboard doesn't have inline breakdown — it just links to the review. Should History simplify to match, or is the breakdown a genuinely useful feature unique to this view?

3. **Should the "Showing X–Y of Z sessions" text and mode filter move inside a Card header?** Dashboard puts its header ("Recent sessions" + "View all") inside the Card. History has the count and filter floating above the rows.

4. **Does the Questions tab need the same treatment?** The Questions tab (`history-questions-tab.tsx`) uses standalone `I-2` rows (`block rounded-2xl border border-border p-4 shadow-sm`). These are already closer to the Card pattern but still use full borders. This brainstorming doc focuses on the Sessions tab; the Questions tab should be assessed separately.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-10 | Created BS-047 | History Sessions tab is visually dated after Dashboard and Practice received tonal fill, borderless rows, and chevron disclosure. Gap inventory needed before implementation. |
