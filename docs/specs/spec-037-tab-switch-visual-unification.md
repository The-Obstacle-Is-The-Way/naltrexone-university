# SPEC-037: Tab Switch Visual Unification — Shared Style Constants for SegmentedControl and HistoryTabBar

> **TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red > Green > Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Ready
**Layer:** Feature
**Date:** 2026-02-21
**Brainstorming:** [BS-027](../brainstorming/bs-027-history-tab-bar-visual-inconsistency.md)

---

## 1. Problem Statement

The History page's "Sessions | Questions" tab bar (`HistoryTabBar`) is visually inconsistent with the `SegmentedControl` used on Practice and Quick Practice. Both serve the same UX purpose (switching between content views) but look like they belong to different apps.

### Root Cause

`HistoryTabBar` uses `bg-background text-foreground` as its active state — the only component in the entire app that does this. In dark mode, `bg-background` resolves to `rgb(9,9,9)`, the same color as the page canvas, making the active tab essentially invisible. Meanwhile, `SegmentedControl` and `FilterChip` both use `bg-primary text-primary-foreground` (high-contrast white), which is the established pattern.

The shape difference (pill vs rectangle) is not the core issue — `FilterChip` is also pill-shaped but uses the correct `bg-primary` active state and looks consistent.

### Verified Class Divergence

| Aspect | `SegmentedControl` | `HistoryTabBar` |
|---|---|---|
| Container shape | `rounded-lg` | `rounded-full` |
| Container bg | `bg-muted` (100%) | `bg-muted/20` (20% opacity) |
| Container border | `border-border` (100%) | `border-border/60` (60% opacity) |
| Container extras | (none) | `items-center gap-1` (not present on SegmentedControl) |
| Item shape | `rounded-md` | `rounded-full` |
| Item padding | `py-1.5` | `py-2` |
| Active state | `bg-primary text-primary-foreground shadow-sm` | `bg-background text-foreground shadow-sm` |
| Class composition | `cn()` | template string concatenation |
| Semantics | `fieldset` + `button` + `aria-pressed` | `nav` + `Link` + `aria-current` |

---

## 2. Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Fix approach | Shared visual class constants consumed by both components | Prevents future drift; one-time restyle would re-diverge |
| Shared module location | `components/ui/tab-switch-styles.ts` | Colocated with the UI primitives that consume it |
| Visual baseline | Current `SegmentedControl` tokens exactly | `SegmentedControl` is source of truth; refactor must not add/remove visual utility classes there |
| Semantic structure | Keep separate (`fieldset`/`button` vs `nav`/`Link`) | Different HTML is correct; visual should be identical |
| `HistoryTabBar` refactor scope | Consume shared constants + switch to `cn()` | Align visuals and class composition method |
| `SegmentedControl` refactor scope | Consume shared constants (extract inline strings) | Source of truth moves from inline to shared module |
| Container token changes | `bg-muted/20` > `bg-muted`, `border-border/60` > `border-border` on HistoryTabBar | Match SegmentedControl; opacity tokens on the tab bar container are the drift |
| Shape standardization | Use `rounded-lg` container + `rounded-md` items on HistoryTabBar | Match SegmentedControl for strict parity; active-state contrast remains the critical fix |
| `items-center gap-1` removal | Drop from HistoryTabBar container; do not add to shared constant | SegmentedControl has never had these; `inline-flex` with uniform-height children centers naturally. Keeping them would be code-level inconsistency even if visually imperceptible |
| SegmentedControl regression guard | No added `gap-*` / `items-*` container classes | Prevent accidental visual change while extracting constants |
| Test strategy | Behavior-first assertions | Avoid brittle implementation checks (no grep/import-coupling tests) |
| React 19 test policy | `// @vitest-environment jsdom` + dynamic import in `beforeAll` for touched `.test.tsx` | Required by repo testing policy |
| Frontend standards update | Add canonical tab-switch section | Codify the pattern to prevent future drift |
| Row/card unification | Out of scope | Different UX pattern (expand-in-place vs navigate); separate decision |
| `FilterChip` changes | None | Already uses `bg-primary`; not drifted |
| Codebase-wide tab-switch coverage | Complete for this control family | Only `SegmentedControl` and `HistoryTabBar` are mutually exclusive horizontal tab-switch controls in current runtime UI |

---

## 3. Detailed Design

### 3.1 New File: Shared Tab-Switch Style Constants

**File:** `components/ui/tab-switch-styles.ts`

```typescript
/**
 * Canonical visual class constants for tab-switch components.
 *
 * Consumed by SegmentedControl (button-based) and HistoryTabBar (link-based).
 * Semantic structure (element types, ARIA) stays in each component.
 * Visual styling is shared here to prevent drift.
 */

/** Outer container wrapping all tab items. */
export const tabSwitchContainerClasses =
  'inline-flex rounded-lg border border-border bg-muted p-1';

/** Base classes for each tab item (active or inactive). */
export const tabSwitchItemBaseClasses =
  'rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]';

/** Additional classes for the active/selected tab item. */
export const tabSwitchItemActiveClasses =
  'bg-primary text-primary-foreground shadow-sm';

/** Additional classes for inactive tab items. */
export const tabSwitchItemInactiveClasses =
  'text-muted-foreground hover:text-foreground';
```

**Constraint:** `tabSwitchContainerClasses` must remain an exact visual match for the current `SegmentedControl` container baseline. Do not add `gap-*` or `items-*` utilities unless both consumers intentionally adopt a new approved visual standard.

### 3.2 Refactor `SegmentedControl` to Consume Shared Constants

**File:** `components/ui/segmented-control.tsx`

**Before:**
```tsx
<fieldset className="inline-flex rounded-lg border border-border bg-muted p-1">
  ...
  <button
    className={cn(
      'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]',
      'disabled:pointer-events-none disabled:opacity-50',
      isActive
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground',
    )}
  >
```

**After:**
```tsx
import {
  tabSwitchContainerClasses,
  tabSwitchItemActiveClasses,
  tabSwitchItemBaseClasses,
  tabSwitchItemInactiveClasses,
} from './tab-switch-styles';

// ...

<fieldset className={tabSwitchContainerClasses}>
  ...
  <button
    className={cn(
      tabSwitchItemBaseClasses,
      'disabled:pointer-events-none disabled:opacity-50',
      isActive ? tabSwitchItemActiveClasses : tabSwitchItemInactiveClasses,
    )}
  >
```

**Key points:**
- `<fieldset>` element stays (correct semantic for button group)
- `aria-pressed`, `disabled`, `onClick` — unchanged
- Optional `<legend>` — unchanged
- Only the class strings change to shared imports
- `disabled:pointer-events-none disabled:opacity-50` stays inline (specific to button variant, not shared)

### 3.3 Refactor `HistoryTabBar` to Consume Shared Constants

**File:** `app/(app)/app/history/components/history-tab-bar.tsx`

**Before:**
```tsx
const baseTabClasses =
  'rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]';

// ...
<div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/20 p-1">
  <Link
    className={`${baseTabClasses} ${
      activeTab === 'sessions'
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'
    }`}
  >
```

**After:**
```tsx
import { cn } from '@/lib/utils';
import {
  tabSwitchContainerClasses,
  tabSwitchItemActiveClasses,
  tabSwitchItemBaseClasses,
  tabSwitchItemInactiveClasses,
} from '@/components/ui/tab-switch-styles';

// ...
<div className={tabSwitchContainerClasses}>
  <Link
    className={cn(
      tabSwitchItemBaseClasses,
      activeTab === 'sessions'
        ? tabSwitchItemActiveClasses
        : tabSwitchItemInactiveClasses,
    )}
  >
```

**Key points:**
- `<nav>` element stays (correct semantic for navigation)
- `<Link>`, `href`, `aria-current` — unchanged
- Delete `const baseTabClasses` (replaced by shared imports)
- Switch from template string concatenation to `cn()` (consistent with project style)
- Container goes from `inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/20 p-1` to `tabSwitchContainerClasses` only — **drop `items-center gap-1`** (SegmentedControl has never had them; `inline-flex` with same-height children centers naturally and container `p-1` provides spacing)
- Active state goes from `bg-background text-foreground` to `bg-primary text-primary-foreground` (the critical fix)

### 3.4 Update Frontend Standards Doc

**File:** `docs/frontend/standards.md`

Add a new subsection under `## 2. Component Standards` after the `FilterChip / SegmentedControl` entry:

```markdown
### Tab-Switch Visual Standard

All tab-switch / segmented-control components MUST use the shared visual constants from `components/ui/tab-switch-styles.ts`:

| Constant | Classes | Usage |
|----------|---------|-------|
| `tabSwitchContainerClasses` | `inline-flex rounded-lg border border-border bg-muted p-1` | Outer wrapper |
| `tabSwitchItemBaseClasses` | `rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:...` | Every tab item |
| `tabSwitchItemActiveClasses` | `bg-primary text-primary-foreground shadow-sm` | Selected item |
| `tabSwitchItemInactiveClasses` | `text-muted-foreground hover:text-foreground` | Unselected items |

Semantic structure (element types, ARIA attributes) is component-specific:
- **Button-based** (`SegmentedControl`): `<fieldset>` + `<button>` + `aria-pressed`
- **Link-based** (`HistoryTabBar`): `<nav>` + `<Link>` + `aria-current`

Do NOT create new tab-switch components without consuming these constants.
```

Also update the Component Inventory table to add:

```markdown
| `tab-switch-styles.ts` | (style constants only) | **No** | No | **No** | Shared by SegmentedControl + HistoryTabBar |
```

---

## 4. Files Summary

### New Files

| File | Purpose |
|------|---------|
| `components/ui/tab-switch-styles.ts` | Shared visual class constants for tab-switch components |
| `components/ui/tab-switch-styles.test.ts` | Regression test: constants contain expected token substrings |

### Modified Files

| File | Change |
|------|--------|
| `components/ui/segmented-control.tsx` | Import shared constants; replace inline class strings |
| `components/ui/segmented-control.test.tsx` | Update tests to behavior-first parity assertions; migrate to `beforeAll` dynamic import policy |
| `app/(app)/app/history/components/history-tab-bar.tsx` | Import shared constants; replace inline class strings; switch to `cn()` |
| `app/(app)/app/history/components/history-tab-bar.test.tsx` | Add visual regression assertions; migrate to `beforeAll` dynamic import policy |
| `docs/frontend/standards.md` | Add Tab-Switch Visual Standard section + component inventory entry |

### Unchanged Files

| File | Why |
|------|-----|
| `components/ui/filter-chip.tsx` | Already uses `bg-primary`; different component purpose (multi-select tags) |
| `app/(app)/app/history/components/history-sessions-tab.tsx` | Row card styling is out of scope |
| `app/(app)/app/dashboard/page.tsx` | Row card styling is out of scope |
| `app/(app)/app/practice/components/practice-session-starter.tsx` | Already uses `SegmentedControl` correctly |
| `app/(app)/app/practice/quick/quick-practice-client.tsx` | Already uses `SegmentedControl` correctly |

---

## 5. Test Plan

### 5.1 Shared Constants Regression Test (NEW)

**File:** `components/ui/tab-switch-styles.test.ts`

```
- tabSwitchContainerClasses includes 'rounded-lg'
- tabSwitchContainerClasses includes 'bg-muted'
- tabSwitchContainerClasses includes 'border-border'
- tabSwitchContainerClasses equals 'inline-flex rounded-lg border border-border bg-muted p-1'
- tabSwitchContainerClasses does NOT include 'rounded-full'
- tabSwitchContainerClasses does NOT include 'bg-muted/20'
- tabSwitchContainerClasses does NOT include 'border-border/60'
- tabSwitchContainerClasses does NOT include 'gap-'
- tabSwitchContainerClasses does NOT include 'items-'
- tabSwitchItemActiveClasses includes 'bg-primary'
- tabSwitchItemActiveClasses includes 'text-primary-foreground'
- tabSwitchItemActiveClasses does NOT include 'bg-background'
- tabSwitchItemInactiveClasses includes 'text-muted-foreground'
- tabSwitchItemBaseClasses includes 'rounded-md'
- tabSwitchItemBaseClasses includes 'focus-visible'
```

### 5.2 SegmentedControl Tests (UPDATE existing)

**File:** `components/ui/segmented-control.test.tsx`

Policy updates for this file:
- Keep `// @vitest-environment jsdom` first line
- Use dynamic import loaded once in `beforeAll` (not inside each `it()`)

Behavior assertions to add:
```
- rendered fieldset includes 'inline-flex rounded-lg border border-border bg-muted p-1'
- rendered output does NOT include 'gap-1' or 'items-center' on the container
- existing semantics still hold: fieldset wrapper, button elements, aria-pressed, disabled behavior
```

### 5.3 HistoryTabBar Tests (UPDATE existing)

**File:** `app/(app)/app/history/components/history-tab-bar.test.tsx`

Policy updates for this file:
- Keep `// @vitest-environment jsdom` first line
- Use dynamic import loaded once in `beforeAll`
- Keep `next/link` mock

Add/update:
```
- active tab includes bg-primary (not bg-background) — update from current assertion
- container includes rounded-lg + bg-muted + border-border and excludes rounded-full + bg-muted/20 + border-border/60
- container does NOT include items-center or gap-1 (parity with SegmentedControl)
- existing semantics still hold: nav landmark, link hrefs, aria-current switching
```

### 5.4 Full Suite Verification

```bash
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration && pnpm build
```

All existing tests must continue passing. The visual change is CSS-class-only: no logic changes, no prop/interface changes, and no DOM structure changes.

---

## 6. Implementation Order

```
Phase 1: Create Shared Constants (RED > GREEN)
  1. Write tab-switch-styles.test.ts with all assertions from 5.1
  2. Create tab-switch-styles.ts with the four exported constants
  3. Run pnpm test --run — new tests pass

Phase 2: Refactor SegmentedControl (RED > GREEN)
  4. Update segmented-control.test.tsx to `beforeAll` dynamic import + behavior parity assertions
  5. Update segmented-control.tsx to import and use shared constants
  6. Run pnpm test --run — SegmentedControl tests pass with no visual regression

Phase 3: Refactor HistoryTabBar (RED > GREEN)
  7. Update history-tab-bar.test.tsx to `beforeAll` dynamic import + new visual assertions
  8. Update history-tab-bar.tsx: import shared constants, switch to cn(), remove baseTabClasses
  9. Run pnpm test --run — all HistoryTabBar tests pass

Phase 4: Documentation
  10. Update docs/frontend/standards.md with Tab-Switch Visual Standard section
  11. Update component inventory table

Phase 5: Full Verification
  12. pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration && pnpm build
  13. Manual smoke test: History page tab switcher should now look identical to Practice/Quick Practice toggles
```

---

## 7. Acceptance Criteria

- [ ] History "Sessions | Questions" tab bar is visually identical to Practice "Tutor | Exam" segmented control
- [ ] Active tab on History uses `bg-primary text-primary-foreground` (high-contrast white in dark mode)
- [ ] History tab container uses exactly `tabSwitchContainerClasses` — no extra utilities (`items-center`, `gap-1` removed)
- [ ] SegmentedControl container remains `inline-flex rounded-lg border border-border bg-muted p-1` (no added `gap-*` or `items-*`)
- [ ] Both containers produce identical class output (strict code-level parity, not just visual equivalence)
- [ ] `HistoryTabBar` preserves `<nav>` element, `<Link>` children, and `aria-current` semantics
- [ ] `SegmentedControl` preserves `<fieldset>` element, `<button>` children, `aria-pressed`, and `disabled` support
- [ ] Regression tests prevent re-introduction of `bg-background` as an active state or `bg-muted/20` on container
- [ ] Touched `.test.tsx` files comply with React 19 policy (`jsdom` directive first + dynamic import in `beforeAll`)
- [ ] `docs/frontend/standards.md` documents the canonical tab-switch token set
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration && pnpm build` all pass

---

## 8. Non-Goals

- **Row card hover/interactivity alignment** — History `<li>` rows vs Dashboard `<a>` rows is a separate UX pattern (expand-in-place vs navigate). Not related to the tab switch.
- **History section card wrapper** — Whether History should wrap its content in a `bg-card` container like Practice/Dashboard is a broader layout decision. Not in scope.
- **FilterChip changes** — Already uses `bg-primary` correctly. Not drifted.
- **Global app navigation links** — Desktop/mobile app nav (`aria-current="page"`) are route navigation patterns, not segmented tab-switch controls.
- **Question navigator grids** — Review/exam question index chips (`aria-current="step"`) are progress/navigation indicators, not tab switches.
- **Action toggles in PracticeView** — Bookmark/mark-for-review `aria-pressed` buttons are binary action toggles, not multi-option view switches.
- **Opacity token cleanup** — `bg-muted/20` and `border-border/60` are used consistently across Dashboard, Practice, and History for row elements. The tab bar was the only place they caused a visibility problem (because the active state was also low-contrast). Row token unification is a separate initiative.
- **Animated tab indicator** — No sliding/morphing animation. Both components use static class swaps on active state. Keep it simple.

---

## 9. Risk Assessment

**Risk: Very Low.**

- No logic changes — only CSS class strings are modified
- No prop changes — no callers need updating
- No DOM structure changes
- SegmentedControl visual baseline is explicitly locked by regression assertions
- HistoryTabBar semantics (`nav`/`Link`/`aria-current`) remain unchanged and test-covered
- Shared constants are a plain TypeScript export — no runtime cost, no new dependencies

---

## 10. Related

- [BS-027](../brainstorming/bs-027-history-tab-bar-visual-inconsistency.md) — Full audit, root cause analysis, browser-agent cross-check
- [SPEC-028](../_archive/specs/spec-028-status-filter-segmented-control.md) — Created the `SegmentedControl` component (predecessor)
- [SPEC-031](../_archive/specs/spec-031-unified-visual-front.md) — Unified visual front (card contrast + shell parity)
- [Frontend Standards](../frontend/standards.md) — To be updated with tab-switch standard
- `components/ui/segmented-control.tsx` — Button-based consumer
- `app/(app)/app/history/components/history-tab-bar.tsx` — Link-based consumer
- `components/ui/filter-chip.tsx` — Reference: uses `bg-primary` correctly (proves pill shape is not the issue)

---

## 11. Codebase-Wide Audit Coverage

### 11.1 Controls Inventory (Audited)

| Control | File(s) | Interaction Model | In Scope for SPEC-037 |
|---|---|---|---|
| `SegmentedControl` | `components/ui/segmented-control.tsx` | Single-select segmented buttons (`aria-pressed`) | Yes |
| `HistoryTabBar` | `app/(app)/app/history/components/history-tab-bar.tsx` | Single-select tab navigation links (`aria-current="page"`) | Yes |
| `FilterChip` | `components/ui/filter-chip.tsx` | Multi-select tag chips (`aria-pressed`) | No |
| App desktop/mobile nav | `components/app-desktop-nav.tsx`, `components/mobile-nav.tsx` | Site/page navigation (`aria-current="page"`) | No |
| Review/exam question navigators | `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx`, `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` | Progress/step navigation (`aria-current="step"`) | No |
| Practice action toggles | `app/(app)/app/practice/components/practice-view.tsx` | Binary action toggles (`aria-pressed`) | No |
| Theme toggle | `components/theme-toggle.tsx` | Theme state toggle | No |

### 11.2 Coverage Conclusion

For the specific family of **mutually exclusive horizontal tab-switch controls used to switch content views**, this spec is complete: current runtime consumers are `SegmentedControl` and `HistoryTabBar` only.

This means implementing SPEC-037 closes the identified drift for that family without over-coupling unrelated control patterns.
