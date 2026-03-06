# DEBT-280: Choice Button and Segmented Control Dark Mode Surface Refinement

**Priority:** P2
**Created:** 2026-03-06
**Source:** [BS-045](../brainstorming/bs-045-choice-button-dark-mode-fill-and-border-refinement.md), [BS-044](../brainstorming/bs-044-dark-mode-border-weight-tiering.md)
**Scope:** Remove the resting gray fill from choice buttons, widen hover/selected state steps, and remove the heavy segmented control dark border — all while maintaining WCAG AA compliance.

---

## Problem

DEBT-279 (PR #174) applied `dark:bg-foreground/8` and `dark:border-foreground/40` to choice buttons for WCAG SC 1.4.11 compliance. The result is functional but aesthetically heavy:

1. **Gray fill** makes buttons look like concrete blocks instead of blending with the card
2. **Border** at `/40` is 2.6x brighter than the parent card's border — inverts visual hierarchy
3. **Hover/selected** are nearly indistinguishable (5-point fill gap, identical border)
4. **Segmented control** border uses the same heavy `/40` despite the active pill already defining the control

Full analysis with computed values: [BS-045](../brainstorming/bs-045-choice-button-dark-mode-fill-and-border-refinement.md)

---

## Decision: Approach A (Conservative)

Remove the resting fill. Keep `/40` resting border (WCAG compliant, no decorative-border argument needed). Widen state steps so hover and selected are clearly perceptible.

If the resting border still feels heavy after visual testing, iterate toward Approach B (softer resting border with documented decorative-border justification) in a follow-up.

---

## Exact Token Changes

### 1. Choice Button (`components/question/choice-button.tsx`)

**Current dark tokens (lines 32–42):**

```
Rest:      dark:bg-foreground/8     dark:border-foreground/40
Hover:     dark:hover:bg-foreground/15   dark:hover:border-foreground/70
Selected:  dark:bg-foreground/20    dark:border-foreground/70
```

**New dark tokens:**

```
Rest:      (no fill override)       dark:border-foreground/40
Hover:     dark:hover:bg-foreground/8    dark:hover:border-foreground/55
Selected:  dark:bg-foreground/15    dark:border-foreground/70
```

| State | Fill | Border | Fill contrast vs card | Border contrast vs card |
|-------|------|--------|----------------------|------------------------|
| Rest | transparent (= card `#121212`) | `/40` (~#6A6A6A) | — | ~3.2:1 |
| Hover | `/8` (~#232323) | `/55` (~#888888) | ~1.2:1 | ~4.6:1 |
| Selected | `/15` (~#333333) | `/70` (~#ABABAB) | ~1.6:1 | ~7.0:1 |

**Fill steps:** 0 → 8 → 15 (gaps of 8 and 7 — both perceptible)
**Border steps:** /40 → /55 → /70 (gaps of 15 each — even, perceptible)

#### Line-by-line changes in `choice-button.tsx`:

**Line 33** — remove `dark:bg-foreground/8` from the rest state:

```tsx
// Before:
!hasVerdict && 'dark:border-foreground/40 dark:bg-foreground/8',

// After:
!hasVerdict && 'dark:border-foreground/40',
```

**Lines 36–37** — adjust hover fill and border:

```tsx
// Before:
'hover:border-muted-foreground/30 dark:hover:border-foreground/70 dark:hover:bg-foreground/15',

// After:
'hover:border-muted-foreground/30 dark:hover:border-foreground/55 dark:hover:bg-foreground/8',
```

**Line 42** — adjust selected fill (border stays at `/70`):

```tsx
// Before:
'border-ring bg-muted/40 dark:border-foreground/70 dark:bg-foreground/20',

// After:
'border-ring bg-muted/40 dark:border-foreground/70 dark:bg-foreground/15',
```

### 2. Letter Badge (`choice-button.tsx`, line 62)

No change. The badge uses `dark:border-foreground/60 dark:bg-foreground/20`. With a transparent button background at rest, the badge at `/20` has good contrast against the card (`#3E3E3E` on `#121212`). On hovered button (`bg-foreground/8` = `#232323`), badge at `/20` = `#3E3E3E` gives ~1.3:1 — tight but acceptable since the badge border at `/60` carries the visual definition.

If visual testing shows the badge blending on hover, bump to `dark:bg-foreground/25` in a follow-up.

### 3. Segmented Control (`components/ui/tab-switch-styles.ts`)

**Line 11** — remove `dark:border-foreground/40`:

```ts
// Before:
'inline-flex rounded-lg border border-border bg-muted p-1 dark:border-foreground/40';

// After:
'inline-flex rounded-lg border border-border bg-muted p-1';
```

The active pill (`bg-primary` = white) already provides dominant visual definition. The container falls back to `border-border` (`#262626`) — subtle, appropriate for a grouping container. The segmented control is identifiable by its shape, text labels, and active pill — the container border is decorative under SC 1.4.11.

---

## Files Changed

| File | Change |
|------|--------|
| `components/question/choice-button.tsx` | Remove `dark:bg-foreground/8` rest fill. Change hover border `/70` → `/55`. Change hover fill `/15` → `/8`. Change selected fill `/20` → `/15`. |
| `components/ui/tab-switch-styles.ts` | Remove `dark:border-foreground/40` from container. |
| `docs/frontend/pattern-registry.md` | Update choice button dark-mode token values. |

---

## Test Plan

### Unit Tests (`choice-button.test.tsx`)

Update any existing assertions that check for `dark:bg-foreground/8` — that token no longer exists on the rest state. Verify:

1. **Rest state (dark, unselected):** has `dark:border-foreground/40`, does NOT have `dark:bg-foreground/8`
2. **Hover tokens present:** `dark:hover:bg-foreground/8` and `dark:hover:border-foreground/55`
3. **Selected state (dark):** has `dark:bg-foreground/15` and `dark:border-foreground/70`
4. **Verdict states unaffected:** `!hasVerdict` guard still gates all dark overrides — correct/incorrect styling unchanged

### Unit Tests (`tab-switch-styles` consumers)

If any test asserts `dark:border-foreground/40` on the segmented control container, remove that assertion.

### Visual Verification (Manual)

After implementation, check in the browser:

1. **Quick Practice page, dark mode:**
   - Choice buttons at rest: flush with card (no gray fill), border visible but not heavy
   - Hover a choice: fill appears, border brightens — clearly different from rest
   - Select a choice: fill is stronger than hover, border is brightest — clearly different from hover
   - Hover a different choice while one is selected: can distinguish them

2. **Segmented control, dark mode:**
   - Container border is subtle (default `border-border`)
   - Active pill (white) clearly defines the selected tab
   - Overall feels lighter/less caged than before

3. **Light mode:** No changes expected — all modifications are `dark:` prefixed

4. **Verdict states (after submitting):**
   - Correct: green border/fill — unchanged
   - Incorrect: red border/fill — unchanged
   - The `!hasVerdict` guard ensures dark overrides don't conflict

---

## What This Does NOT Change

- **Light mode** — all changes are `dark:` prefixed
- **Verdict states** — guarded by `!hasVerdict`
- **Feedback cards** — separate component, not in scope
- **Action bar buttons** — standard shadcn Button, not part of this problem
- **Dashboard/History/Bookmark borders** — tracked in BS-044 for separate evaluation
- **Focus ring** — `focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]` is unchanged

---

## Relationship to Other Work

- **BS-044 (border weight tiering):** This is the first concrete implementation from the BS-044 exploration. BS-044 covers the whole app; this DEBT covers choice buttons + segmented control only.
- **BS-045:** The brainstorming analysis that led to this spec. Approach A selected. Approach B (softer resting border) deferred as a possible follow-up.
- **DEBT-279:** The original WCAG remediation that introduced these tokens. This DEBT refines DEBT-279's aesthetic outcome without regressing compliance.
- **DEBT-278 (verdict badge):** Independent — different element, different concern.
