# DEBT-273: Choice Button Surface Hierarchy Fix

**Priority:** P2
**Created:** 2026-03-03
**Source:** [BS-039](../brainstorming/bs-039-choice-button-surface-hierarchy-and-hover-ux.md)
**Scope:** `components/question/choice-button.tsx` (single file, all question views)

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
| `QuestionPageClient` | `app/(app)/app/questions/[slug]/question-page-client.tsx` | Dashboard review, History session review, History question review, Bookmarks review |

**One fix in `choice-button.tsx` covers all 6+ views.**

---

## Implementation

### 1. Update default base and hover (`choice-button.tsx:28-30`)

```diff
- 'block w-full rounded-xl border border-border bg-background p-4 text-left shadow-sm transition-colors focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
+ 'block w-full rounded-xl border border-border/60 bg-muted/20 p-4 text-left shadow-sm transition-colors focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
  !disabled &&
-   'cursor-pointer hover:border-muted-foreground/30 hover:bg-muted/60',
+   'cursor-pointer hover:border-muted-foreground/30 hover:bg-muted/40',
```

Changes:
- `bg-background` → `bg-muted/20` (elevate base to sit above card surface)
- `hover:bg-muted/60` → `hover:bg-muted/40` (smooth ~0.8% hover step, matching dashboard)
- `border-border` → `border-border/60` (softer border, matching dashboard row convention)

### 2. Update selected neutral state (`choice-button.tsx:34`)

Since the default base is now `bg-muted/20`, the selected state (currently also `bg-muted/20`) must differentiate:

```diff
- selected && correctness === null && 'border-ring bg-muted/20',
+ selected && correctness === null && 'border-ring bg-muted/40',
```

This gives selected a visible step above the new base while preserving the `border-ring` indicator.

### 3. No changes needed for:

- **Correctness states** (`bg-success/10`, `bg-destructive/10`) — these replace the base entirely and render with strong semantic contrast
- **Letter badges** (`bg-muted` on the A/B/C/D circles) — with the row base moving to `bg-muted/20` (~8%), the badge-to-row contrast decreases from 7.5% to 3%, which should make badges feel more naturally nested. Visual verification will confirm.
- **`QuestionCard`** wrapper — no changes needed, the Card continues to provide `bg-card` as the parent surface

### 4. Update Pattern Registry I-3

Update `docs/frontend/pattern-registry.md` section I-3 to reflect that choices inside a Card wrapper use the "in-card row" treatment (`bg-muted/20` → `hover:bg-muted/40`) rather than the standalone `bg-background` treatment. The standalone variant can be retired since choices always appear inside `QuestionCard`.

### 5. Update existing tests

- `choice-button.test.tsx` — update any assertions that check for `bg-background` or `bg-muted/60`
- `ChoiceButton.browser.spec.tsx` — update if it asserts specific background tokens
- `theme-token-regression.test.tsx` — update if it includes choice button token assertions

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
- [ ] Letter badges — feel naturally nested in rows (not floating)
- [ ] Disabled state — opacity-50 still readable

---

## Summary of class changes

| Element | Before | After |
|---------|--------|-------|
| Choice base | `bg-background` | `bg-muted/20` |
| Choice border | `border-border` | `border-border/60` |
| Choice hover | `hover:bg-muted/60` | `hover:bg-muted/40` |
| Selected (neutral) | `bg-muted/20` | `bg-muted/40` |
| Correctness states | unchanged | unchanged |
| Letter badges | unchanged | unchanged |

---

## Related

- [BS-039](../brainstorming/bs-039-choice-button-surface-hierarchy-and-hover-ux.md) — Original analysis with visual verification screenshots
- [Pattern Registry §1.2](../frontend/pattern-registry.md) — Background opacity scale reference
- `audit-screenshots/bs-039-visual-verification-2026-03-03/` — Playwright dark-mode captures
