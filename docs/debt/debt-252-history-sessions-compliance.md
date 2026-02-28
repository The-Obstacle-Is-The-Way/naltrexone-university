# DEBT-252: History Sessions Compliance

**Status:** Not started
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** D-1, D-5, A11Y-1
**File:** `app/(app)/app/history/components/history-sessions-tab.tsx`

---

## Items

### D-1: History Sessions Row Hover Token + Dark Override

**Pattern:** I-1 (Hoverable Row inside Card) — use `muted` token, no `dark:` overrides

**Current** (`history-sessions-tab.tsx:185`):
```
cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:hover:bg-foreground/10
```

**Target:**
```
cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]
```

**Changes:**
1. `hover:bg-accent/40` → `hover:bg-muted/40` (standardize on `muted` token)
2. Remove `dark:hover:bg-foreground/10` (no page-level `dark:` overrides per standards)

**Secondary cleanup:** The session summary `<Link>` inside the row (`history-sessions-tab.tsx:220`) uses `hover:text-foreground` on an element already styled `text-foreground` — a no-op hover. Verify this inner link's hover is either removed or changed to something perceptible when D-1 is fixed.

### D-5: View Breakdown Button Dark Overrides

**Pattern:** Part 5 — no `dark:` overrides outside `components/ui/`

**Current** (`history-sessions-tab.tsx:244`):
```
rounded-full transition-colors dark:border-foreground/30 dark:bg-foreground/10 dark:hover:bg-foreground/25
```

**Target:**
```
rounded-full
```

**Why:** The button uses `variant="outline"` which provides its own dark mode behavior (`dark:bg-input/30 dark:border-input dark:hover:bg-input/50` from `button.tsx`). The page-level overrides conflict with the design system.

**Post-fix check:** Visually verify the outline button is still distinguishable inside the `bg-muted/20` row.

### A11Y-1: History Sessions Clickable Row Missing ARIA Role

**Current** (`history-sessions-tab.tsx:179-181`):
```tsx
<li
  key={row.sessionId}
  tabIndex={isRowInteractive ? 0 : undefined}
  className={
```

**Target:**
```tsx
<li
  key={row.sessionId}
  role={isRowInteractive ? 'link' : undefined}
  tabIndex={isRowInteractive ? 0 : undefined}
  className={
```

**Why:** Screen readers announce `<li tabIndex={0} onClick>` as "list item" rather than conveying interactivity. Adding `role="link"` when interactive communicates the element's purpose.

---

## TDD Approach

1. **A11Y-1 test:** Render a session row with a valid `firstQuestionSlug`. Assert the `<li>` has `role="link"`. Render without slug → assert no `role` attribute.
2. **D-1 test:** Render interactive row. Assert `hover:bg-muted/40` present, `hover:bg-accent/40` absent, `dark:hover:bg-foreground/10` absent.
3. **D-5 test:** Render row with breakdown button. Assert button className contains `rounded-full` but not `dark:border-foreground/30`, `dark:bg-foreground/10`, or `dark:hover:bg-foreground/25`.

**Test file:** `app/(app)/app/history/components/history-sessions-tab.test.tsx` (colocated, `renderToStaticMarkup` + jsdom)

---

## Verification

```bash
# D-1: No accent hover or dark foreground overrides on rows
rg -n 'hover:bg-accent|dark:hover:bg-foreground' \
  'app/(app)/app/history/components/history-sessions-tab.tsx'
# Expected: 0 matches

# D-5: No dark: foreground overrides on buttons
rg -n 'dark:(?:border|bg|hover:bg)-foreground' \
  'app/(app)/app/history/components/history-sessions-tab.tsx'
# Expected: 0 matches

# A11Y-1: Interactive rows set role to link when interactive
rg -n "role=\\{isRowInteractive \\? 'link'" \
  'app/(app)/app/history/components/history-sessions-tab.tsx'
# Expected: 1 match
```

---

## Visual QA

1. **Dark mode:** Hover a history session row → subtle background shift visible (~8.6% effective)
2. **Dark mode:** "View breakdown" outline button → distinguishable inside `bg-muted/20` row using system variant styling
3. **Screen reader:** Navigate to a session row → announced as "link" (not just "list item")

---

## Sequencing Note

DEBT-256 (STRUCT-1: expanded breakdown hierarchy) and DEBT-259 (D-13: shared constants extraction) both touch this same file. They are sequenced **after** DEBT-252 merges to prevent merge conflicts.
