# DEBT-252: History Sessions Compliance

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-28
**Resolved:** 2026-02-28
**Owner:** Frontend/UI
**Parent:** [DEBT-250](../../debt/debt-250-frontend-visual-divergence-compliance-plan.md)
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

**Pattern:** Standards §16 (Dark Mode) + Pattern Registry D-5 resolution — no page-level `dark:` color overrides outside `components/ui/`

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

### A11Y-1: History Sessions Clickable Row — No Explicit Role

**Current** (`history-sessions-tab.tsx:179-180`):
```tsx
<li
  key={row.sessionId}
  tabIndex={isRowInteractive ? 0 : undefined}
  className={
```

**Target:** No change — `role="link"` was considered and rejected.

**Why `role="link"` was rejected:** The `<li>` contains nested `<a>` elements (session summary link, "Review session" link, breakdown question links). Adding `role="link"` to the `<li>` creates nested link roles, which violates the ARIA spec ("Authors SHOULD NOT nest elements with the `link` role inside other elements with the `link` role"). It also breaks Playwright/browser tests — `getByRole('link')` resolves to multiple elements (the `<li>` and its nested `<a>` elements). The row remains keyboard-navigable via `tabIndex={0}` + click/Enter handler, and screen reader users navigate via the contained `<a>` links.

---

## TDD Approach

1. **A11Y-1 test:** Render a session row with a valid `firstQuestionSlug`. Assert the `<li>` does NOT have `role="link"` (invalid ARIA nesting). Assert `tabIndex="0"` for keyboard access. Render without slug → assert no `tabIndex`.
2. **D-1 test:** Render interactive row. Assert `hover:bg-muted/40` present, `hover:bg-accent/40` absent, `dark:hover:bg-foreground/10` absent.
3. **D-5 test:** Render row with breakdown button. Assert button className contains `rounded-full` but not `dark:border-foreground/30`, `dark:bg-foreground/10`, or `dark:hover:bg-foreground/25`.

**Test file:** `app/(app)/app/history/components/history-sessions-tab.test.tsx` (existing colocated suite; update current class assertions for D-1/D-5 and add role assertion for A11Y-1 using `renderToStaticMarkup` + jsdom)

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

# A11Y-1: No role="link" on <li> (invalid ARIA nesting with nested <a> elements)
rg -n "role=.*link" \
  'app/(app)/app/history/components/history-sessions-tab.tsx'
# Expected: 0 matches (role="link" rejected — see A11Y-1 rationale)
```

---

## Visual QA

1. **Dark mode:** Hover a history session row → subtle background shift visible (~8.6% effective)
2. **Dark mode:** "View breakdown" outline button → distinguishable inside `bg-muted/20` row using system variant styling
3. **Screen reader:** Navigate to a session row → keyboard accessible via `tabIndex={0}` + Enter handler; nested `<a>` links provide screen reader navigation targets

---

## Sequencing Note

DEBT-256 (STRUCT-1: expanded breakdown hierarchy) and DEBT-259 (D-13: shared constants extraction) both touch this same file. They are sequenced **after** DEBT-252 merges to prevent merge conflicts.
