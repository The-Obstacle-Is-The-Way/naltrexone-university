# DEBT-280: Choice Button and Segmented Control Dark Mode Surface Refinement

**Priority:** P2
**Created:** 2026-03-06
**Source:** [BS-045](../brainstorming/bs-045-choice-button-dark-mode-fill-and-border-refinement.md), [BS-044](../../brainstorming/bs-044-dark-mode-border-weight-tiering.md)
**Resolved:** 2026-03-06 — [PR #175](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/175)
**Scope:** Remove the resting gray fill from choice buttons, widen hover/selected state steps, and remove the heavy shared tab-switch dark border override — all while maintaining WCAG AA compliance.

---

## Problem

DEBT-279 (PR #174) applied `dark:bg-foreground/8` and `dark:border-foreground/40` to choice buttons for WCAG SC 1.4.11 compliance. The result is functional but aesthetically heavy:

1. **Gray fill** makes buttons look like concrete blocks instead of blending with the card
2. **Border** at `/40` is 2.6x brighter than the parent card's border — inverts visual hierarchy
3. **Hover/selected** are nearly indistinguishable (5-point fill gap, identical border)
4. **Shared tab-switch container** uses the same heavy `/40` despite the active pill / active tab already defining the control

Full analysis with computed values: [BS-045](../brainstorming/bs-045-choice-button-dark-mode-fill-and-border-refinement.md)

---

## Decision: Approach A (Conservative)

Remove the resting fill. Keep `/40` resting border (WCAG compliant, no decorative-border argument needed). Widen state steps so hover and selected are clearly perceptible.

If the resting border still feels heavy after visual testing, open a follow-up. Do **not** substitute BS-045's exploratory softer-border/ring variants into this ticket.

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
| Rest | transparent (= card `#121212`) | `/40` (`#6A6A6A`) | — | ~`3.46:1` |
| Hover | `/8` (`#242424`) | `/55` (`#8A8A8A`) | ~`1.21:1` | ~`5.43:1` |
| Selected | `/15` (`#333333`) | `/70` (`#ABABAB`) | ~`1.48:1` | ~`8.16:1` |

**Math source:** These values are composited from the real dark tokens in `app/globals.css` (`--foreground: #EDEDED`, `--card: #121212`), not from pure-white assumptions.

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

No change. The badge uses `dark:border-foreground/60 dark:bg-foreground/20`. Its fill separation is modest on hovered/selected neutral surfaces, but the border carries the visual definition:

- badge fill `#3E3E3E` vs card `#121212` = ~`1.75:1`
- badge fill `#3E3E3E` vs hover fill `#242424` = ~`1.45:1`
- badge fill `#3E3E3E` vs selected fill `#333333` = ~`1.18:1`
- badge border `#959595` vs selected fill `#333333` = ~`4.22:1`

Do **not** change the badge in DEBT-280. If post-implementation screenshots still show badge blending, open a follow-up to evaluate `dark:bg-foreground/25`.

### 3. Shared Tab-Switch Container (`components/ui/tab-switch-styles.ts`)

**Line 11** — remove `dark:border-foreground/40`:

```ts
// Before:
'inline-flex rounded-lg border border-border bg-muted p-1 dark:border-foreground/40';

// After:
'inline-flex rounded-lg border border-border bg-muted p-1';
```

The active pill (`bg-primary` = white) already provides dominant visual definition. The container falls back to `border-border` (`#262626`), which is only ~`1.13:1` against `bg-muted` (`#1C1C1C`). That means the container border must be treated as decorative, not as a required boundary.

This is acceptable for current consumers because `tabSwitchContainerClasses` is only used by:

- `components/ui/segmented-control.tsx`
- `app/(app)/app/history/components/history-tab-bar.tsx`
- `app/(app)/app/history/components/history-sessions-tab.tsx`

Do **not** reuse this container pattern for a control that depends on the container border for identification.

### 4. Focus / Selection Constraint

Do **not** add a selected-state ring in this ticket. `ChoiceButton` already uses `focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]`, and the tab-switch items already use `focus-visible:ring-ring/50 focus-visible:ring-[3px]`.

The current ring shadow is not strong enough to serve as a second always-on state channel in dark mode: `ring-ring/50` composites to roughly ~`1.70:1` against the dark surfaces in this flow, while the focus distinction currently relies on the stronger `border-ring` change. Reusing that ring for selected state would blur selection vs keyboard focus. DEBT-280 is a surface-refinement pass, not a focus-system redesign.

---

## Files Changed

| File | Change |
|------|--------|
| `components/question/choice-button.tsx` | Remove `dark:bg-foreground/8` rest fill. Change hover border `/70` → `/55`. Change hover fill `/15` → `/8`. Change selected fill `/20` → `/15`. |
| `components/ui/tab-switch-styles.ts` | Remove `dark:border-foreground/40` from container. |
| `components/question/choice-button.test.tsx` | Update positive token assertions and add negative assertions that stale dark tokens are absent. |
| `components/ui/tab-switch-styles.test.ts` | Update the exact canonical container string and add a negative assertion for `dark:border-foreground/40`. |
| `components/ui/segmented-control.test.tsx` | Add a negative assertion for `dark:border-foreground/40`; the current substring check is too weak. |
| `app/(app)/app/history/components/history-tab-bar.test.tsx` | Add the same negative assertion because the history tabs consume the shared container classes. |
| `docs/frontend/pattern-registry.md` | Update I-3 and I-5, plus the summary rows that still encode the pre-DEBT-280 tokens. |
| `docs/frontend/pages/quick-practice.md` | Update the live audit after implementation or add a clear pre-DEBT-280/superseded note. |
| `docs/_archive/debt/debt-279-wcag-aa-contrast-remediation-plan.md` | Optional: add a superseded-by note pointing to DEBT-280 to reduce drift confusion. |

---

## Test Plan

### Unit Tests (`choice-button.test.tsx`)

Update any existing assertions that check for `dark:bg-foreground/8` — that token no longer exists on the rest state. Verify:

1. **Rest state (dark, unselected):** has `dark:border-foreground/40`, does NOT have `dark:bg-foreground/8`
2. **Hover tokens present:** `dark:hover:bg-foreground/8` and `dark:hover:border-foreground/55`
3. **Selected state (dark):** has `dark:bg-foreground/15` and `dark:border-foreground/70`
4. **Selected state omits neutral hover tokens:** no `dark:hover:bg-foreground/8` / `dark:hover:border-foreground/55` leak onto selected markup
5. **Verdict states unaffected:** `!hasVerdict` guard still gates all dark overrides — correct/incorrect styling unchanged
6. **Wrong-unselected remains readable:** existing no-parent-opacity behavior stays intact
7. **Badge unchanged:** keep `dark:border-foreground/60 dark:bg-foreground/20` unless a separate follow-up is intentionally opened

### Unit Tests (`tab-switch-styles` consumers)

1. **`tab-switch-styles.test.ts`:** exact container string becomes `inline-flex rounded-lg border border-border bg-muted p-1`
2. **`tab-switch-styles.test.ts`:** explicitly assert `dark:border-foreground/40` is absent
3. **`segmented-control.test.tsx`:** explicitly assert rendered markup does not contain `dark:border-foreground/40`
4. **`history-tab-bar.test.tsx`:** explicitly assert rendered markup does not contain `dark:border-foreground/40`

The current segmented-control and history-tab-bar tests only assert a class-name prefix. That is not sufficient: stale dark tokens could be appended and still pass.

### Browser / Interaction Checks

1. **`ChoiceButton.browser.spec.tsx`:** keep the selected-hover guard intact so selected markup does not regress toward hover tokens
2. **`quick-practice-client.browser.spec.tsx`:** behavioral routing coverage remains valid; no new visual token assertions are needed there because the component-level regression suites own the class contract

### Visual Verification (Manual)

After implementation, check in the browser:

1. **Quick Practice page, dark mode:**
   - Choice buttons at rest: flush with card (no gray fill), border visible but not heavy
   - Hover a choice: fill appears, border brightens — clearly different from rest
   - Select a choice: fill is stronger than hover, border is brightest — clearly different from hover
   - Hover a different choice while one is selected: can distinguish them
   - Keyboard-tab to a choice: focus remains visually distinct from selected state; no new selected ring appears

2. **Practice session page or standalone question page, dark mode:**
   - Shared `ChoiceButton` treatment looks correct outside Quick Practice too
   - Verdict transition selected → correct/incorrect still clean

3. **Shared tab-switch consumers, dark mode:**
   - Container border is subtle (default `border-border`)
   - Active pill (white) clearly defines the selected tab
   - Verify on Quick Practice status control, Practice setup segmented controls, History tabs, and History Sessions mode filter
   - Keyboard-tab to an item: focus is still perceivable after removing the heavy container border

4. **Light mode:** No changes expected — all modifications are `dark:` prefixed

5. **Verdict states (after submitting):**
   - Correct: green border/fill — unchanged
   - Incorrect: red border/fill — unchanged
   - The `!hasVerdict` guard ensures dark overrides don't conflict

6. **Reduced motion:** No animation or timing changes are introduced in this ticket

---

## What This Does NOT Change

- **Light mode** — all changes are `dark:` prefixed
- **Verdict states** — guarded by `!hasVerdict`
- **Feedback cards** — separate component, not in scope
- **Action bar buttons** — standard shadcn Button, not part of this problem
- **Dashboard/History/Bookmark borders** — tracked in BS-044 for separate evaluation
- **Focus ring system** — `focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]` and tab-switch `focus-visible:ring-*` remain unchanged; DEBT-280 must not introduce a second selected-state ring

---

## Relationship to Other Work

- **BS-044 (border weight tiering):** This is the first concrete implementation from the BS-044 exploration. BS-044 covers the whole app; this DEBT covers choice buttons + the shared tab-switch container only.
- **BS-045:** The brainstorming analysis that led to this spec. Approach A selected. Approach B (softer resting border) deferred as a possible follow-up.
- **Pattern Registry / Quick Practice Audit:** Both contain pre-DEBT-280 live tokens today. They must be updated in the same implementation PR or marked historical/superseded.
- **DEBT-279:** The original WCAG remediation that introduced these tokens. This DEBT refines DEBT-279's aesthetic outcome without regressing compliance.
- **DEBT-278 (verdict badge):** Independent — different element, different concern.
