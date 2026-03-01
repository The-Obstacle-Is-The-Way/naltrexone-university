# DEBT-257: Choice Button Selected State

**Status:** Resolved
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** AFFORD-1
**Unblocked:** Decision 5 resolved (recommended path) + DEBT-251 merged in PR #150
**File:** `components/question/choice-button.tsx`

---

## Item

### AFFORD-1: Choice Button Selected State Subtlety

**Severity:** Medium

**Problem:** When a user selects a choice before submitting, the only visual change is `border-ring` (dark mode: `border-border` 15% lightness to `border-ring` 40% lightness). There is no background tint. Chrome agent confirmed this is "hard to distinguish at a glance."

**Current** (`choice-button.tsx:34`):
```tsx
selected && correctness === null && 'border-ring',
```

**Target** (implemented, Decision 5 recommended path):
```tsx
selected && correctness === null && 'border-ring bg-muted/20',
```

**Change:** Add `bg-muted/20` to the selected (pre-submission) state for stronger affordance while keeping the border pattern.

---

## Decision Dependency

**Decision 5 — RESOLVED:** Add `bg-muted/20` for subtle background tint on selected pre-submission state.

**Sequencing:** DEBT-251 merged in PR #150. No remaining blockers.

---

## Verification

```bash
# AFFORD-1 recommended target class present
rg -n "selected && correctness === null && 'border-ring bg-muted/20'" \
  components/question/choice-button.tsx
# Expected: 1 match when Decision 5 selects the recommended path

# AFFORD-1: after recommended change, only the inner letter badge keeps bare border-ring
rg -n "selected && correctness === null && 'border-ring',$" \
  components/question/choice-button.tsx
# Expected: 1 match when recommended path is implemented (inner badge only);
#           2 matches in current state before AFFORD-1
```

Visual: Select a choice without submitting → selected choice has a visible background tint distinguishing it from unselected choices, including in dark mode.
