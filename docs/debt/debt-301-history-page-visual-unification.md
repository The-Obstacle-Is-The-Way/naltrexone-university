# DEBT-301: History Page Visual Unification

**Priority:** P2
**Created:** 2026-03-10
**Status:** Open
**Source:** [BS-047](../brainstorming/bs-047-history-sessions-tab-visual-unification.md)
**Related:** [Dashboard page doc](../frontend/pages/dashboard.md), [Practice page doc](../frontend/pages/practice.md), [Pattern Registry](../frontend/pattern-registry.md), [Contrast Policy](../frontend/contrast-policy.md), [BS-044](../brainstorming/bs-044-dark-mode-border-weight-tiering.md)

---

## Context

Dashboard and Practice have already been upgraded from bordered nested boxes to borderless tonal-fill surfaces with quieter disclosure affordances. The History page is now the last major app page still using the old bordered-card language for repeating rows in both tabs.

This debt converts the validated BS-047 gap inventory into an implementable visual-unification pass for the History page. The goal is not to redesign History from scratch; it is to bring the Sessions and Questions tabs onto the same tonal-fill surface language already established on Dashboard and Practice.

---

## Sessions Tab Changes

The Sessions tab currently stacks bordered row boxes directly on the page background and nests a fully chromed `View breakdown` outline button inside each row. Expanded breakdown content also uses heavy separators and dividers in dark mode.

### 1. Session rows → borderless tonal fill

Current row contract in `app/(app)/app/history/components/history-sessions-tab.tsx`:

```tsx
rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors
dark:border-foreground/40
hover:bg-muted/40 dark:hover:border-foreground/70
```

Target contract:

```tsx
rounded-xl bg-foreground/5 p-3 transition-colors
hover:bg-foreground/[0.08]
```

Interactive rows must also preserve their existing `cursor-pointer` class (applied conditionally when `isRowInteractive` is true).

This matches the established Dashboard row pattern while keeping History on page background (no wrapping Card added). On page background, `bg-foreground/5` still reads as a repeating list-row surface rather than a standalone panel.

### 2. `View breakdown` outline button → chevron disclosure

Keep the existing React-state disclosure architecture (`selectedSessionId`, async review loading). Do **not** migrate this interaction to native `<details>`.

Implementation direction:
- Remove the bordered `View breakdown` / `Hide breakdown` button
- Replace it with a trailing disclosure **button** that renders a `<ChevronDown>` icon
- Rotate the chevron when the row is expanded
- Keep the existing row-level navigation link to session review intact
- The disclosure trigger must remain explicit and must not hijack the row’s existing navigation target
- Preserve the current accessibility wiring on that disclosure control: `type="button"`, `aria-expanded`, `aria-controls`, and an informative `aria-label`

**Decision:** Use the existing React state (`isSelected`) to drive icon rotation and `aria-expanded`, not `group-open:rotate-180`.

### 3. Breakdown separator → decorative, not boundary-grade

Current expanded breakdown wrapper:

```tsx
mt-3 border-t border-border/30 pt-3 dark:border-foreground/40
```

Target direction:

```tsx
mt-3 border-t border-border/30 pt-3 dark:border-foreground/10
```

The separator between the session summary row and its expanded breakdown is a decorative/internal divider, not a required boundary. It should follow the softer T4 separator treatment from [BS-044](../brainstorming/bs-044-dark-mode-border-weight-tiering.md), not the current `dark:border-foreground/40` interactive-boundary weight.

### 4. Breakdown list dividers → soften dark-mode divider weight

Current breakdown list contract in `app/(app)/app/shared/components/session-breakdown-list.tsx`:

```tsx
divide-y divide-border/20 dark:divide-foreground/40
```

Target direction:

```tsx
divide-y divide-border/20 dark:divide-foreground/20
```

These are decorative list dividers. The current dark override is much louder than the light-mode divider and should be softened to the T4 decorative range.

---

## Questions Tab Changes

The Questions tab still uses bordered/shadowed cards for both available and unavailable rows, plus a second bordered micro-surface for the trailing `Review` affordance.

### 5. Available question rows → borderless tonal fill

Current available-row contract in `app/(app)/app/history/components/history-questions-tab.tsx`:

```tsx
block rounded-2xl border border-border p-4 shadow-sm transition-colors hover:bg-muted/50
```

Target direction:

```tsx
block rounded-2xl bg-foreground/5 p-4 transition-colors hover:bg-foreground/[0.08]
focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

Drop the border and `shadow-sm`. Reuse the same monotonic foreground ramp already adopted on Dashboard and Practice.

### 6. Trailing `Review` pill → quieter tonal micro-surface

Current trailing affordance:

```tsx
inline-flex items-center rounded-full border px-4 py-2 text-sm
```

Target contract:

```tsx
inline-flex items-center rounded-full border-0 bg-foreground/[0.06] px-4 py-2 text-sm font-medium text-foreground/60
```

The `Review` affordance stays visible, but it becomes a quieter tonal micro-surface that does not reintroduce a second loud border inside an already-tonal row.

**Sizing note:** The `px-4 py-2 text-sm` sizing is intentionally larger than Dashboard's badge pills (`px-2 py-0.5 text-xs`). The Review label is a visual CTA indicator inside a clickable row, not subordinate metadata — it warrants the larger touch-friendly size. If it looks too heavy after implementation, sizing can be revisited as a follow-up.

### 7. Unavailable question rows → same tonal fill family

Current unavailable-row contract:

```tsx
<Card className="gap-0 rounded-2xl border-border p-4 shadow-sm">
```

Target direction:
- Move unavailable rows onto the same tonal-fill family as available rows
- Remove legacy border/shadow chrome
- Keep the unavailable copy and metadata hierarchy intact

Unavailable rows should feel like the disabled/static sibling of the available question rows, not like a separate pre-unification Card pattern.

---

## Deferred / Out of Scope

The following BS-047 items are intentionally **not** part of DEBT-301:

- **Gap 3:** No wrapping `<Card>` is added around the Sessions list. Option B is the decision: keep rows on page background and align them with the Dashboard row token rather than promoting each row to `bg-card`.
- **Gap 6:** No mode-badge conversion on Sessions rows. Inline `Tutor` / `Exam` text stays for now because that row summary uses a denser dot-separated layout than Dashboard.
- **Gap 9:** No separate light-mode workstream. The row/card chrome reduction in Sessions and Questions should improve both themes automatically.
- **Questions-tab filter card container:** No redesign of the outer filter card in this debt. It is a lower-priority design judgment call.
- **Questions-tab filter dropdown controls:** No change. They are an intentional control-pattern difference from Practice.
- **SegmentedControl / tab bars:** No change. Sessions/Questions tab bar and All/Tutor/Exam segmented filter are already aligned with the shared tab-switch contract.
- **Pagination links:** No change. They already use `headerActionLinkClasses` correctly.

---

## Acceptance Criteria

- [ ] Session rows in `history-sessions-tab.tsx` no longer use `border border-border/60 bg-muted/20 dark:border-foreground/40`
- [ ] Session rows use `bg-foreground/5` at rest and `hover:bg-foreground/[0.08]` on hover
- [ ] Interactive session rows preserve `cursor-pointer`
- [ ] Existing focus-ring behavior on the interactive History row children remains unchanged
- [ ] The bordered `View breakdown` / `Hide breakdown` button is removed
- [ ] Expanded/collapsed state is represented by a trailing disclosure button with a `<ChevronDown>` icon driven by existing React state
- [ ] The replacement disclosure control preserves `type="button"`, `aria-expanded`, `aria-controls`, and an informative `aria-label`
- [ ] Expanded-session separator no longer uses `dark:border-foreground/40`
- [ ] Expanded-session separator uses the softer decorative treatment `dark:border-foreground/10`
- [ ] Breakdown list dividers no longer use `dark:divide-foreground/40`
- [ ] Breakdown list dividers use `dark:divide-foreground/20`
- [ ] Available question rows in `history-questions-tab.tsx` no longer use bordered/shadowed card chrome
- [ ] Available question rows use the tonal row contract `bg-foreground/5` + `hover:bg-foreground/[0.08]`
- [ ] Available question rows drop `shadow-sm`
- [ ] The trailing `Review` affordance uses `border-0 bg-foreground/[0.06] text-foreground/60`
- [ ] Unavailable question rows no longer render with bordered/shadowed Card chrome
- [ ] Unavailable question rows move onto the same tonal-fill family as available rows
- [ ] SegmentedControl instances, tab bars, filter dropdown controls, and pagination links remain unchanged

---

## Files to Modify

Implementation should be scoped to the existing History surface and its direct tests/docs:

### Source
- `app/(app)/app/history/components/history-sessions-tab.tsx`
- `app/(app)/app/history/components/history-questions-tab.tsx`
- `app/(app)/app/shared/components/session-breakdown-list.tsx`

### Tests
- `app/(app)/app/history/components/history-sessions-tab.test.tsx`
- `app/(app)/app/history/components/history-sessions-tab.browser.spec.tsx`
- `app/(app)/app/history/components/history-questions-tab.test.tsx`
- `app/(app)/app/shared/components/session-breakdown-list.test.tsx`

### Documentation sync
- `docs/frontend/pattern-registry.md`
- `docs/frontend/contrast-policy.md`
- `docs/debt/debt-301-history-page-visual-unification.md`
- `docs/debt/index.md`

---

## Visual Verification Checklist

After implementation, verify all of the following in both dark and light mode:

- [ ] History Sessions tab with multiple collapsed rows
- [ ] History Sessions tab with one expanded row
- [ ] Expanded breakdown loading state
- [ ] Expanded breakdown error state
- [ ] Expanded breakdown list with available + unavailable questions
- [ ] Sessions empty state
- [ ] Sessions mode filter (`All / Tutor / Exam`) unchanged
- [ ] Sessions pagination links unchanged
- [ ] History Questions tab with available rows
- [ ] History Questions tab with unavailable rows
- [ ] Questions tab empty state(s)
- [ ] Questions tab filter card and dropdown controls unchanged
- [ ] Questions-tab trailing `Review` affordance is visually quieter than before
- [ ] `sm:` breakpoint behavior for row headers and trailing disclosure/review affordances still feels balanced
