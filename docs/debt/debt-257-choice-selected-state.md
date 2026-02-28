# DEBT-257: Choice Button Selected State

**Status:** Blocked
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** AFFORD-1
**Blocked by:** Decision 5 (Choice Button Selected State) + DEBT-251 merged
**File:** `components/question/choice-button.tsx`

---

## Item

### AFFORD-1: Choice Button Selected State Subtlety

**Severity:** Medium

**Problem:** When a user selects a choice before submitting, the only visual change is `border-ring` (border shifts from 15% to 40% lightness). No background tint. Chrome agent confirmed this is "hard to distinguish at a glance."

**Current** (`choice-button.tsx:34`):
```tsx
selected && correctness === null && 'border-ring',
```

**Target** (pending Decision 5 — recommended):
```tsx
selected && correctness === null && 'border-ring bg-muted/20',
```

**Change:** Add `bg-muted/20` to the selected (pre-submission) state for stronger affordance while keeping the border pattern.

---

## Decision Dependency

**Decision 5** must resolve before implementation:
- **Recommended:** Add `bg-muted/20` for subtle background tint
- **Alternative:** Accept current behavior as sufficient

**Sequencing:** Must merge **after DEBT-251** (which modifies hover/opacity/correctness on the same file).

---

## Verification

Visual: Select a choice without submitting → selected choice has visible background tint distinguishing it from unselected choices, even in dark mode.
