# SPEC-031: Unified Visual Front — Card Contrast + Shell Parity

> **⚠️ TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Ready
**Layer:** Feature
**Date:** 2026-02-17
**Resolves:** [BS-020](../brainstorming/bs-020-card-contrast-and-hover-consistency.md), [BS-021](../brainstorming/bs-021-marketing-app-shell-divergence-and-accessibility-parity.md)

---

## Overview

The authenticated app and the marketing landing page use different background colors. In dark mode, this inverts the card elevation model — cards that pop out on the landing page sink into the app background and disappear on hover. Separately, the marketing shell has semantic HTML bugs (nested `<main>`, unlabeled sections) and copy inconsistencies ("Sign In" vs "Sign in").

This spec fixes both in two phases:
- **Phase 1:** Align app background to landing page, fix card hover contrast (BS-020)
- **Phase 2:** Fix semantic landmarks and copy drift (BS-021)

See the brainstorming docs for full root cause analysis, severity assessment, and impact analysis. This spec is prescriptive — it says exactly what to change, in what order.

---

## Test Harness Requirements (Mandatory)

All test work in this spec must follow repo-wide React 19 + Vitest rules:

1. Every `*.test.tsx` file must start with `// @vitest-environment jsdom` on line 1
2. Render-output tests must use `renderToStaticMarkup` (not `@testing-library/react`)
3. Interactive/async UI checks belong in `*.browser.spec.tsx` (via `vitest-browser-react`) or Playwright E2E
4. Update existing tests where possible; do not create duplicate coverage files for the same behavior

---

## Phase 1: Card Contrast Alignment (BS-020)

### Problem Summary

App layout uses `bg-muted` (11% lightness) as body background. Cards use `bg-card` (7%). Cards are darker than their background — the opposite of the landing page where `bg-background` (3.5%) makes cards lighter. On hover, `hover:bg-muted/50` blends toward 11%, making cards nearly invisible against the page.

### Requirements

#### Functional

1. In dark mode, app cards must be visibly elevated above their page background at rest and on hover
2. The dark-mode elevation stack must follow: `background (3.5%) → card (7%) → muted (11%) → border (15%)`
3. Card hover must increase card-to-page contrast, not decrease it
4. Light mode must not regress (minimal visual change expected: pure white vs off-white)

#### Non-Functional

1. Single layout root change — all app pages inherit automatically
2. No new design tokens or CSS variables
3. Existing `transition-colors` on cards is preserved (no behavior change)

### Exact Changes

#### 1A. App layout background (primary fix)

```diff
// app/(app)/app/layout.tsx:73
- <div className="min-h-screen bg-muted">
+ <div className="min-h-screen bg-background">
```

**Affected pages:** Dashboard, Practice, Quick Practice, Session pages, History, Bookmarks, Billing, Question View — all inherit from this layout root.

#### 1B. Stat card border hover (9 cards)

Change `hover:border-border/80` → `hover:border-border` on all stat cards. Border should emphasize on hover, not fade.

```diff
// app/(app)/app/dashboard/page.tsx — 5 stat cards (lines 61, 69, 77, 85, 93)
- hover:border-border/80 hover:bg-muted/50
+ hover:border-border hover:bg-muted/50

// app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx — 4 stat cards (lines 39, 45, 51, 57)
- hover:border-border/80 hover:bg-muted/50
+ hover:border-border hover:bg-muted/50
```

#### 1C. Update frontend standards doc

```diff
// docs/frontend/standards.md — "Hoverable cards (stat cards)" section
- transition-colors hover:border-border/80 hover:bg-muted/50
+ transition-colors hover:border-border hover:bg-muted/50
```

### Resolved Decisions (Phase 1)

| BS-020 Open Question | Resolution |
|---------------------|------------|
| Q1: Is two-tone background intentional? | **No.** Treat as drift. `bg-muted` was a reasonable early choice but inverts card elevation. |
| Q4: Does browser verification matter? | **Yes.** Playwright audit is authoritative for measured contrast behavior and should be updated from “verify bug” to “verify fix.” |
| Q2: Should stat cards have hover effects? | **Defer.** Keep hover for now; evaluate removing from non-interactive cards as follow-up after visual verification post-deploy. |
| Q3: Audit light mode? | **Done.** Impact is minimal — pure white vs off-white. No regression. |
| Q5: Landing impact stat cards hover? | **Defer.** They work fine without hover. Not in scope. |
| Q6: Quick fix or design system pass? | **Quick fix.** Ship Option A + border cleanup. Defer token-level redesign. |

### Tests First (Phase 1)

Write these tests before implementation:

```typescript
// app/(app)/app/layout-shell.test.tsx — add test
it('uses bg-background for the app body (not bg-muted)', () => {
  // Verify the layout root uses bg-background
  // This guards against regression to bg-muted
});
```

```typescript
// components/theme-token-regression.test.tsx — update existing test
it('uses semantic hover tokens for dashboard stat cards', () => {
  // Update: assert hover:border-border (not hover:border-border/80)
});
```

Also update any assertions in `tests/e2e/bs-020-card-contrast-audit.spec.ts` that currently validate the broken state (`bg-muted` layout root, `hover:border-border/80`) so they validate the fixed state.

**E2E verification:** `tests/e2e/bs-020-card-contrast-audit.spec.ts` already measures contrast. After the fix:
- Dashboard card lightness (7%) should be GREATER than page bg (3.5%) — inverted from current
- Hover contrast gap should be >5% (currently <5%)

Update the E2E test assertions to verify the fix rather than the bug.

---

## Phase 2: Shell Semantic Parity (BS-021)

### Problem Summary

The marketing landing page has semantic HTML bugs (nested `<main>` elements, unlabeled sections) and copy casing inconsistencies ("Sign In" vs "Sign in") that create accessibility issues and visual-quality drift between the marketing and app shells.

### Requirements

#### Functional

1. Landing page must have exactly one `<main>` element (not nested)
2. All major landing sections must have accessible labels
3. "Sign in" casing must be consistent across marketing-shell + unauthenticated auth-nav CTAs
4. Hero `<h1>` accessible name must be verified and fixed if broken

#### Non-Functional

1. No navigation IA changes (marketing and app nav intentionally differ)
2. No theme toggle changes (deferred — needs product decision)
3. Skip-link (`#main-content`) must continue to work after `<main>` fix, with a focusable target (`tabIndex={-1}`)

### Exact Changes

#### 2A. Remove nested `<main>` on marketing pages

The marketing layout renders `<main>{children}</main>`, and `marketing-home.tsx` renders another `<main id="main-content">` inside it. Remove the inner one and move `id="main-content"` to the outer one.

```diff
// components/marketing/marketing-layout.tsx:59
- <main>{children}</main>
+ <main id="main-content" tabIndex={-1}>{children}</main>
```

```diff
// components/marketing/marketing-home.tsx:66
- <main id="main-content" className="...">
+ <div className="...">
  ...
- </main>
+ </div>
```

**Verify:** Skip-link (`<a href="#main-content">`) still lands on the correct element.

#### 2B. Add section labels for landing page

Add `aria-label` to the five unlabeled sections in `marketing-home.tsx`:

| Line | Current | Add |
|------|---------|-----|
| 68 | `<section>` (hero) | `aria-label="Hero"` |
| 95 | `<section>` (stats) | `aria-label="Impact statistics"` |
| 129 | `<section id="features">` | `aria-label="Features"` |
| 170 | `<section>` (pricing) | `aria-label="Pricing"` |
| 237 | `<section>` (CTA) | `aria-label="Get started"` |

#### 2C. Standardize "Sign in" casing

Canonical form: **"Sign in"** (sentence case). Update these locations:

```diff
// components/marketing/marketing-home.tsx:251
- Sign In
+ Sign in

// components/auth-nav.tsx:46
- Sign In
+ Sign in
```

`marketing-layout.tsx:85` already uses "Sign in" — no change needed.

#### 2D. Verify hero `<h1>` accessible name

`marketing-home.tsx:73-77` splits the heading across two spans. Verify the computed accessible name reads correctly. If the spans concatenate without spacing (e.g., `Master YourBoard Exams.`), add `aria-label` on the `<h1>`.

**Action:** Test in browser, fix only if needed.

### Resolved Decisions (Phase 2)

| BS-021 Open Question | Resolution |
|---------------------|------------|
| Q1: Theme toggle on marketing? | **Defer.** Low severity, needs product decision. Not in scope. |
| Q2: Canonical "Sign in" casing? | **Yes.** Sentence case ("Sign in") on marketing-shell + unauthenticated auth-nav CTAs. |
| Q3: Section landmarks as hard standard? | **Yes for landing page.** Add labels now. Formalize as standard in design-principles after implementation. |
| Q4: Formalize parity in design-principles? | **Phase 3 follow-up.** Codify after Phase 1 + 2 are implemented and verified. |
| Q5: Landing as baseline for polish? | **Yes.** Validated by BS-020 impact analysis. Codify in Phase 3. |

### Tests First (Phase 2)

```typescript
// components/marketing/marketing-home.test.tsx — add tests
it('renders exactly one main element (no nested main)', () => {
  // Count <main> elements in rendered output — expect 1
});

it('labels all major landing sections with aria-label', () => {
  // Assert each section has an aria-label
});

it('uses consistent "Sign in" casing in CTA', () => {
  // Assert CTA text is "Sign in" not "Sign In"
});

it('exposes the hero heading with accessible name "Master Your Board Exams."', () => {
  // Verify heading accessible name (or aria-label fallback) includes proper spacing
});
```

Also update any existing assertions in `components/marketing/marketing-home.test.tsx` that currently expect `<main id="main-content"` to come from `marketing-home.tsx`; after this change the target `<main>` lives in `marketing-layout.tsx`.

```typescript
// components/marketing/marketing-layout.test.tsx — update existing test
it('renders the outer main with id="main-content" and tabIndex="-1"', () => {
  // Assert skip-link target lives on the single outer <main>
});
```

```typescript
// components/auth-nav.test.tsx — update existing assertions
it('uses sentence-case "Sign in" for unauthenticated users', () => {
  // Update all unauthenticated assertions that currently expect "Sign In"
});
```

---

## Deferred Items (Not in Scope)

These are explicitly tracked as follow-up, not forgotten:

| Item | Why Deferred | Tracked In |
|------|-------------|------------|
| Remove hover from non-interactive stat cards | Needs visual verification post-background-change | BS-020 Q2 |
| Add hover to landing impact stat cards | Aesthetic polish, not broken | BS-020 Q5 |
| Standardize hover to `hover:bg-muted` (full opacity) | Works now with `bg-background` parent; can evaluate later | BS-020 follow-up #3 |
| Theme toggle parity (marketing vs app) | Product decision, not a code fix | BS-021 Q1 |
| Design-principles codification | Phase 3: after implementation, update design-principles.md | BS-021 Q4 |
| Shell-parity checklist formalization | Phase 3: codify expectations | BS-021 Q4 |

---

## Implementation Notes

### Phase 1 PR scope
- `app/(app)/app/layout.tsx` — one-line background change
- `app/(app)/app/dashboard/page.tsx` — 5 stat card border hover fixes
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` — 4 stat card border hover fixes
- `docs/frontend/standards.md` — update hoverable card standard
- Unit tests (layout test, regression test update)
- E2E test update (`bs-020-card-contrast-audit.spec.ts` — flip assertions from "verify bug" to "verify fix")

### Phase 2 PR scope
- `components/marketing/marketing-layout.tsx` — move `id="main-content"` to outer `<main>`
- `components/marketing/marketing-home.tsx` — remove inner `<main>`, add section labels, fix CTA casing
- `components/auth-nav.tsx` — fix "Sign In" → "Sign in"
- Unit tests (`marketing-home.test.tsx`, `marketing-layout.test.tsx`, `auth-nav.test.tsx` updates)

### Sequencing
Phase 1 and Phase 2 can be **separate PRs** or **one PR with two commits**. Phase 1 should land first (higher visibility, resolves the most impactful bug). Phase 2 has no dependency on Phase 1 code but follows logically in the unified-front initiative.

---

## Success Criteria

1. In dark mode, dashboard stat cards are visibly elevated from page background at rest
2. On hover, stat cards become more visible, not less
3. Landing → Dashboard transition feels like the same product
4. Landing page has exactly one `<main>` element
5. All landing sections are discoverable via screen reader landmark navigation
6. "Sign in" is consistently cased across marketing-shell + unauthenticated auth-nav CTAs
7. No visual regression in light mode

---

## Related

- [BS-020](../brainstorming/bs-020-card-contrast-and-hover-consistency.md) — Full card audit, impact analysis, color stack reference
- [BS-021](../brainstorming/bs-021-marketing-app-shell-divergence-and-accessibility-parity.md) — Shell divergence analysis, verified code paths
- [DEBT-108](../_archive/debt/debt-108-hardcoded-zinc-colors-break-light-dark-toggle.md) — Original semantic color cleanup
- [E2E Tests](../../tests/e2e/bs-020-card-contrast-audit.spec.ts) — Playwright contrast verification
- [Frontend Standards](../frontend/standards.md) — Stat card hover standard (to be updated)
- [Design Principles](../frontend/design-principles.md) — Navigation zone model, action bar composition
