# DEBT-273: Choice Button Surface Hierarchy Fix

**Priority:** P2
**Created:** 2026-03-03
**Source:** [BS-039](../brainstorming/bs-039-choice-button-surface-hierarchy-and-hover-ux.md)
**Scope:** Primary code change in `components/question/choice-button.tsx`, with synchronized test and Pattern Registry updates for all question-facing views

---

## Problem

In dark mode, `ChoiceButton` uses `bg-background` (3.5% lightness) inside a `<Card>` wrapper (`bg-card`, 7%). This creates an inverted surface hierarchy where interactive choice rows are **darker** than their container — they appear as dark cutouts "punched through" the card. The hover effect (`hover:bg-muted/60`, composited ~9.4% over card) then leaps ~6% in one step, roughly 7× larger than the dashboard's smooth ~0.8% hover transition.

### Current state (broken)

```
Choice base:  bg-background  →  3.5%   (below card surface)
Choice hover: bg-muted/60    →  ~9.4%  (overshoots card, jarring 6% jump)
Card surface: bg-card        →  7.0%   (parent)
```

### Target state (matches dashboard row pattern)

```
Choice base:  bg-muted/20    →  ~8.0%  (sits just above card surface)
Choice hover: bg-muted/40    →  ~8.6%  (smooth ~0.8% step up)
Card surface: bg-card        →  7.0%   (parent)
```

All composited lightness values are over `bg-card` (7%). See [Pattern Registry §1.2](../frontend/pattern-registry.md) for the full opacity scale.

---

## Affected Views

`ChoiceButton` is rendered inside `QuestionCard`, which is consumed by two parent components that cover **every question-facing view in the app**:

| Parent Component | File | Views |
|-----------------|------|-------|
| `PracticeView` | `app/(app)/app/practice/components/practice-view.tsx` | Quick Practice, Tutor mode, Exam mode |
| `QuestionPageClient` | `app/(app)/app/questions/[slug]/question-page-client.tsx` | Dashboard review, Practice session review, History session review, History question review, Bookmarks review, direct `/app/questions/[slug]` fallback (dashboard-origin UI) |

**One fix in `choice-button.tsx` covers all current question-facing entry points.**

---

## Post-Migration Health Signal (2026-03-04)

A full Preview/Dev smoke run after applying migration 0014 (`claimed_at` on `idempotency_keys`) passed across Quick Practice, Tutor, Exam, Dashboard, History, Bookmarks, and Billing.

- No `Internal error` banners on write operations
- Answer submission, bookmark CRUD, and session start/end writes all succeeded
- Review routes (dashboard/history/bookmarks) loaded and rendered correctly

This debt item is therefore **not blocked** by the prior migration incident; implementation can proceed.

---

## Implementation

### 1. Update default base and hover (`choice-button.tsx:28-30`)

```diff
- 'block w-full rounded-xl border border-border bg-background p-4 text-left shadow-sm transition-colors focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
+ 'block w-full rounded-xl border border-border/60 bg-muted/20 p-4 text-left shadow-sm transition-colors focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
  !disabled && 'cursor-pointer hover:bg-muted/40',
  !disabled && !selected && 'hover:border-muted-foreground/30',
```

Changes:
- `bg-background` → `bg-muted/20` (elevate base to sit above card surface)
- `hover:bg-muted/60` → `hover:bg-muted/40` (smooth ~0.8% hover step, matching dashboard)
- `border-border` → `border-border/60` (softer border, matching dashboard row convention)
- Scope `hover:border-muted-foreground/30` to **unselected** rows only, so selected state does not lose its ring border on hover

### 2. Update selected neutral state (`choice-button.tsx:34`)

Since the default base is now `bg-muted/20`, the selected state (currently also `bg-muted/20`) must differentiate:

```diff
- selected && correctness === null && 'border-ring bg-muted/20',
+ selected && correctness === null && 'border-ring bg-muted/40',
```

This gives selected a visible step above the new base while preserving the `border-ring` indicator. Because hover border is now unselected-only, selected+hover remains visually selected (no border regression to hover border color).

### 3. No changes needed for:

- **Focus + keyboard cues** (`focus-within:border-ring`, `focus-within:ring-ring/50`, `focus-within:ring-[3px]`) — unchanged
- **Shadow + transition behavior** (`shadow-sm`, `transition-colors`) — unchanged
- **Disabled behaviors** (`cursor-not-allowed`, `opacity-50`) and **wrong-unselected** dimming — unchanged
- **Correctness states** (`bg-success/10`, `bg-destructive/10`) — unchanged semantic treatment; these visually override neutral border/fill at render time
- **Letter badges** (`bg-muted` on the A/B/C/D circles) — with the row base moving to `bg-muted/20` (~8%), the badge-to-row contrast decreases from 7.5% to 3%, which should make badges feel more naturally nested. Visual verification will confirm.
- **`QuestionCard`** wrapper — no changes needed, the Card continues to provide `bg-card` as the parent surface

### 4. Update Pattern Registry (not I-3 only)

Update all sections that currently encode old I-3 behavior:

1. **§1.2 `/60` row** (`docs/frontend/pattern-registry.md`):
   - Before: `Choice buttons and direct-action interactive targets`
   - After: `Exception-only emphasized hover (no current canonical consumers)`
2. **§1.2 Decision sentence**:
   - Before: `Use /40 inside cards, /50 on page background, /60 for direct-action targets (choices, chips).`
   - After: `Use /40 inside cards (including I-3 choice buttons), /50 on page background. /60 is exception-only and requires explicit design review.`
3. **§I-3 Choice Button** (replace canonical classes/rationale):
   - Base:
     ```
     block w-full rounded-xl border border-border/60 bg-muted/20 p-4 text-left shadow-sm transition-colors
     focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]
     ```
   - Hover (enabled):
     ```
     cursor-pointer hover:bg-muted/40
     ```
   - Unselected-only hover border:
     ```
     hover:border-muted-foreground/30
     ```
   - Selected (neutral): `border-ring bg-muted/40`
   - Rationale update: choice buttons are rendered inside `QuestionCard` (`bg-card`) and follow in-card row hierarchy, not standalone page-surface hierarchy.
4. **Part 9 hover decision tree**:
   - Replace `Direct-action target (choice, chip) → hover:bg-muted/60`
   - With `Choice button inside card → hover:bg-muted/40 (I-3); /60 remains exception-only`
5. **Appendix quick reference row (`I-3`)**:
   - Hover column: `hover:bg-muted/40`
   - Border column: `border-border/60`

### 5. Update existing tests

Required assertion updates:

- `components/question/choice-button.test.tsx`
  - `:151` change expected hover token from `hover:bg-muted/60` → `hover:bg-muted/40`
  - `:220` change selected neutral expectation from `bg-muted/20` → `bg-muted/40`
  - `:238` invert expectation: unselected should now **contain** `bg-muted/20` (base), not exclude it
  - `:257` replace `not.toContain('bg-muted/20')` in correctness case — `twMerge` already strips `bg-muted/20` when `bg-success/10` is present (same `bg-*` conflict group), so the existing assertion still passes, but it's fragile and tests an implementation detail. Replace with semantically meaningful assertions: assert `bg-success/10` is present and `bg-muted/40` (selected-neutral token) is absent.
  - Add explicit expectations that wrapper base includes `border-border/60` + `bg-muted/20`
- `components/question/ChoiceButton.browser.spec.tsx`
  - Add a selected-hover regression test ensuring selected rows retain selected treatment while hovered (do not collapse to unselected-hover appearance)
- `components/theme-token-regression.test.tsx`
  - Extend ChoiceButton selected-state token test to include new neutral hierarchy tokens (`border-border/60`, `bg-muted/40` in selected render path)
- `components/question/QuestionCard.test.tsx` and `components/question/QuestionCard.browser.spec.tsx`
  - No token assertions currently; no required edits for this change set

---

## State Matrix (Authoritative)

| State | Expected classes / result |
|-------|---------------------------|
| Default (unselected, enabled) | `border-border/60 bg-muted/20` |
| Hover (unselected, enabled) | `hover:bg-muted/40` + `hover:border-muted-foreground/30` |
| Selected (neutral, pre-submit) | `border-ring bg-muted/40` |
| Selected + hover | Same surface as selected (`bg-muted/40`) and selected border remains authoritative |
| Disabled (unselected) | `cursor-not-allowed opacity-50` (no hover affordance) |
| Correct (`correctness === 'correct'`) | `border-success bg-success/10 text-success` |
| Incorrect (`correctness === 'incorrect'`) | `border-destructive bg-destructive/10 text-destructive` |
| Wrong-unselected (`correctness === 'wrong-unselected'`) | Neutral base + `opacity-50` dimming |
| Focus-within (keyboard nav) | `focus-within:border-ring` + `focus-within:ring-ring/50` + `focus-within:ring-[3px]` |

**Precedence note:** Neutral base tokens remain in className strings, but semantic correctness classes render as the visible border/fill in post-submit states.

---

## BS-039 Open Questions Resolution

| BS-039 Open Question | Resolution in DEBT-273 |
|----------------------|------------------------|
| Should letter badges change? | No. Keep `bg-muted`; reduced contrast against new base improves nesting. |
| Should selected state change? | Yes. Promote selected neutral to `bg-muted/40` + `border-ring`. |
| Does this affect correctness states? | No class changes; semantic states remain `success/destructive` and stay visually strong. |
| Pattern Registry amendment or new pattern? | Amendment. Update existing I-3 + related registry references; no standalone variant retained. |

---

## Verification Plan

After implementing, visually verify in dark mode:

- [ ] Quick Practice — choice rows sit visibly above card, hover is smooth
- [ ] Tutor mode — same visual behavior
- [ ] Exam mode — same visual behavior
- [ ] Dashboard review (correct answer) — success state still renders clearly
- [ ] Dashboard review (incorrect answer) — destructive state still renders clearly
- [ ] History session review — choice rows consistent
- [ ] Bookmarks review — choice rows consistent
- [ ] Selected state — visibly different from unselected base
- [ ] Selected + hover — remains visibly selected (does not collapse to unselected-hover look)
- [ ] Letter badges — feel naturally nested in rows (not floating)
- [ ] Hover border transition (`border-border/60` → `hover:border-muted-foreground/30` on unselected rows) feels intentional and non-jarring
- [ ] Disabled state — opacity-50 still readable

---

## Summary of class changes

| Element | Before | After |
|---------|--------|-------|
| Choice base | `bg-background` | `bg-muted/20` |
| Choice border | `border-border` | `border-border/60` |
| Choice hover | `hover:bg-muted/60` | `hover:bg-muted/40` |
| Choice hover border scope | `hover:border-muted-foreground/30` (all enabled rows) | `hover:border-muted-foreground/30` (unselected enabled rows only) |
| Selected (neutral) | `bg-muted/20` | `bg-muted/40` |
| Correctness states | unchanged | unchanged |
| Letter badges | unchanged | unchanged |

---

## Related

- [BS-039](../brainstorming/bs-039-choice-button-surface-hierarchy-and-hover-ux.md) — Original analysis with visual verification screenshots
- [Pattern Registry §1.2](../frontend/pattern-registry.md) — Background opacity scale reference
- `audit-screenshots/bs-039-visual-verification-2026-03-03/` — Playwright dark-mode captures
