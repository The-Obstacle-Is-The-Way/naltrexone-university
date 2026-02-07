# DEBT-153: Brittle CSS Class String Assertions in renderToStaticMarkup Tests

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-07

---

## Description

The codebase's jsdom test suite uses `renderToStaticMarkup` + `expect(html).toContain('tailwind-class-string')` to verify component styling. This is a structural consequence of the React 19 testing strategy (see `docs/dev/react-vitest-testing.md`), not a one-off mistake — `@testing-library/react` is broken with React 19 + Vitest, so `renderToStaticMarkup` is the correct choice for render-output testing.

The problem is what gets asserted against the static markup. Approximately 20-22 of the 31 Tailwind class assertions test **purely presentational** properties (typography, spacing, decorative classes) rather than **behavioral** properties (state, visibility, accessibility).

## Scale

| Metric | Count |
|--------|-------|
| Total `.test.tsx` files using `renderToStaticMarkup` | 47 |
| Total `expect(html).toContain()` assertions | 373 |
| Assertions testing Tailwind class strings | 31 (~8%) |
| Purely presentational class assertions | 20-22 |
| Behavior-meaningful class assertions | 9-11 |

### Presentational assertions (brittle — break on any class reorder or Tailwind refactor)

- `'font-heading font-semibold text-foreground'` — typography composition
- `'text-2xl font-bold font-heading tracking-tight text-foreground'` — heading pattern
- `'text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'` — link styling
- `'border-destructive/30'`, `'bg-destructive/10'` — color token values

### Behavior-meaningful assertions (worth keeping)

- `'sr-only'` — screen-reader visibility
- `'sm:hidden'` — responsive breakpoint behavior
- `'bg-primary'` — active state indication
- `'focus-visible:ring-[3px]'` — focus indicator presence

## Files with highest fragility risk

1. `app/error-heading-styles.test.tsx` — entire file tests typography class compositions across 10 error pages
2. `app/pricing/page.test.tsx` — asserts `font-heading font-semibold` on plan titles
3. `components/error-card.test.tsx` — asserts destructive color token classes
4. Multiple nav tests (`app-desktop-nav`, `auth-nav`, `mobile-nav`, `marketing-home`) — assert `transition-colors` presence

## Impact

- **Today:** Low. 31 assertions is manageable. Tests pass and catch real drift.
- **On refactor:** High. Any Tailwind config change, class extraction, or component restructure breaks presentational assertions. A design system migration (e.g., CSS-in-JS, Tailwind v5, design tokens) would break all 20+ presentational assertions simultaneously.
- **False confidence:** Asserting `transition-colors` exists in a class string doesn't prove the transition works visually. These tests catch typos and accidental removals but not rendering bugs.

## Alternatives already in the codebase

| Pattern | Where used | Resilience |
|---------|-----------|------------|
| `data-testid` attributes | 7 assertions in jsdom tests | High — decoupled from styling |
| `data-slot` attributes | 17 assertions in UI component tests | High — semantic structure |
| `getByRole()` queries | 119 usages in browser specs | High — accessibility-driven |
| `role` attributes | 1 assertion in jsdom tests | High |

Browser mode tests (`*.browser.spec.tsx`) already use semantic selectors exclusively and never assert Tailwind classes. The fragility is isolated to the jsdom layer.

## Resolution Path

### Option A: Migrate presentational assertions to `data-testid` (incremental)
- Add `data-testid` attributes to style-critical elements (headings, error states, transition links)
- Replace `expect(html).toContain('font-heading')` with `expect(html).toContain('data-testid="page-heading"')`
- Keep behavior-meaningful class assertions (`sr-only`, `sm:hidden`, `bg-primary`)
- ~20 test changes across ~12 files

### Option B: Move style tests to browser specs (thorough)
- Presentational concerns are visual — test them in real Chromium via `*.browser.spec.tsx`
- Use `getComputedStyle()` or visual assertions instead of class strings
- Higher fidelity but slower test execution
- Reserve for style-critical components only

### Option C: Accept and document (pragmatic)
- 8% of assertions, ~31 cases — the blast radius is manageable
- Add a rule in `.claude/rules/testing.md` noting that class string assertions are acceptable for regression guards but should prefer `data-testid` for new tests
- When tests break from a refactor, fix them then

## Progress Update (2026-02-07)

**Phase 1** — Adopted Option C baseline policy: testing guidance updated in `.claude/rules/testing.md` to prefer semantic assertions over class-string checks.

**Phase 2** — Migrated high-fragility presentational assertions to semantic DOM checks:
  - `app/(app)/app/bookmarks/page.test.tsx`
  - `app/(app)/app/review/page.test.tsx`
  - `app/(app)/app/practice/components/practice-view.test.tsx`
  - `app/(app)/app/billing/page.test.tsx`
  - `components/marketing/marketing-home.test.tsx`
  - `app/error-heading-styles.test.tsx`

**Phase 3** — Completed migration of all remaining brittle presentational assertions:
  - `components/auth-nav.test.tsx`
  - `components/app-desktop-nav.test.tsx`
  - `app/(app)/app/questions/[slug]/question-page-client.test.tsx`
  - `app/pricing/page.test.tsx`
  - `components/mobile-nav.test.tsx`
  - `components/error-card.test.tsx`
  - `components/question/ChoiceButton.test.tsx`

### Remaining class assertions (intentionally kept)

Post-resolution audit confirmed all remaining class assertions in `*.test.tsx` files fall into explicitly exempt categories:

| Category | Count | Examples | Rationale |
|----------|-------|---------|-----------|
| Behavior-meaningful | 7 | `sr-only`, `sm:hidden`, `focus-visible:ring-[3px]` | Encode accessibility/visibility behavior, not styling |
| Active-state indication | 3 | `bg-primary` in filter-chip, segmented-control | Visual state alongside `aria-pressed` — listed as acceptable in this doc |
| Design-system regression guards | 16 | `border-success` not `emerald-`, `bg-primary` not `bg-zinc-100` | `theme-token-regression.test.tsx` — guards semantic token usage, not presentational styling |
| Component API contract | 3 | `border-radius:16px`, `padding:2px` in metallic-border | Inline style assertions verifying prop forwarding behavior, not Tailwind classes |

No purely presentational Tailwind class-string assertions remain in jsdom tests.

## Verification

- [x] Decision made on resolution approach (A, B, or C)
- [x] If A: Presentational class assertions migrated to semantic selectors (`data-testid`, role, href, text, or DOM semantics)
- [ ] If B: Style-critical tests migrated to browser specs
- [x] If C: Testing rule updated to guide new test authors
- [x] No regressions in test suite
- [x] Post-resolution audit confirmed remaining assertions are behavior-meaningful or design-system guards

## Related

- `docs/dev/react-vitest-testing.md` — explains why `renderToStaticMarkup` was chosen
- `.claude/rules/testing-react19.md` — test authoring rules
- DEBT-141 (archived): Migrated practice hook tests from `renderLiveHook` to browser mode
- DEBT-143 (archived): Practice UI components missing browser specs
