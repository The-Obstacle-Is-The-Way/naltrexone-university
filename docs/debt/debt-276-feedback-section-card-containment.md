# DEBT-276: Feedback Section Card Containment

**Priority:** P3
**Created:** 2026-03-04
**Source:** [BS-041](../brainstorming/bs-041-feedback-display-content-vs-code-separation.md)
**Scope:** Part B code-only UI containment update in `components/question/feedback.tsx` plus targeted regression-test updates in `components/question/Feedback.test.tsx`

---

## Problem

After DEBT-274 reordered incorrect-flow sections, the feedback card still has inverted hierarchy:

1. Primary learning sections ("Your answer", "Correct answer") render as flat text
2. Supplementary wrong-answer items render in contained cards (`rounded-xl border border-border/60 bg-background/50 p-3`)

This is most visible in incorrect flow, where users must distinguish two primary sections quickly but those sections have no visual containment.

### Current rendering

```
Correct flow:
1. Correct badge
2. Correct answer label + flat content
3. Why-other-answers heading + contained neutral cards
4. Reference

Incorrect flow:
1. Incorrect badge
2. Your answer label + flat content
3. Correct answer label + flat content
4. Why-other-answers heading + contained neutral cards
5. Reference
```

### Target rendering (Part B only)

```
Correct flow:
1. Correct badge
2. Correct answer label + success-contained card
3. Why-other-answers heading + existing neutral cards (unchanged)
4. Reference (unchanged)

Incorrect flow:
1. Incorrect badge
2. Your answer label + destructive-contained card
3. Correct answer label + success-contained card
4. Why-other-answers heading + existing neutral cards (unchanged)
5. Reference (unchanged)
```

---

## Affected Files

| File | Change |
|------|--------|
| `components/question/feedback.tsx` | Wrap the incorrect-flow "Your answer" content block in `rounded-xl border border-destructive/20 bg-destructive/5 p-3` |
| `components/question/feedback.tsx` | Wrap the "Correct answer" content block (both correct and incorrect flows) in `rounded-xl border border-success/20 bg-success/5 p-3` |
| `components/question/Feedback.test.tsx` | Add/adjust render-output assertions for new section card containment classes |
| `components/theme-token-regression.test.tsx` | No expected assertion changes; run as blast-radius guard for semantic token usage |

### NOT affected

- MDX content and authoring conventions (Part A in BS-041; DEBT-275 C2/C3)
- Parser/seed logic (`scripts/seed-helpers.ts`)
- `FeedbackProps` / types
- Verdict badge styling (`bg-success/15`, `bg-destructive/15`)
- Reference section styling/structure
- Wrong-answer item card styling (`rounded-xl border border-border/60 bg-background/50 p-3`)

---

## Affected Views (Runtime)

`Feedback` is rendered by:

| Parent Component | File | Views |
|-----------------|------|-------|
| `PracticeView` | `app/(app)/app/practice/components/practice-view.tsx` | Tutor/quick-practice feedback surfaces |
| `QuestionPageClient` | `app/(app)/app/questions/[slug]/question-page-client.tsx` | Dashboard review, session review, history review, bookmarks review |

One containment change in `feedback.tsx` updates all feedback surfaces.

---

## Implementation

### 1. Correct-answer containment (both flows)

Wrap the existing correct-answer content region with:

```tsx
<div className="mt-2 rounded-xl border border-success/20 bg-success/5 p-3">
  ...
</div>
```

### 2. Your-answer containment (incorrect flow only)

Wrap the existing user-choice content region with:

```tsx
<div className="mt-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
  ...
</div>
```

### 3. Keep wrong-answer cards unchanged

Retain:

```tsx
className="rounded-xl border border-border/60 bg-background/50 p-3"
```

### 4. Structural change (from BS-041)

**Before (flat content):**

```tsx
<div className="mt-6">
  <div className="text-sm font-medium text-foreground">Correct answer</div>
  <div className="flex items-start gap-1 text-sm text-foreground">
    <span className="shrink-0 font-medium">{correctChoice.displayLabel})</span>
    <Markdown content={correctChoice.textMd} />
  </div>
  <Markdown content={explanationMd} className="mt-2 text-sm" />
</div>
```

**After (contained section card):**

```tsx
<div className="mt-6">
  <div className="text-sm font-medium text-foreground">Correct answer</div>
  <div className="mt-2 rounded-xl border border-success/20 bg-success/5 p-3">
    <div className="flex items-start gap-1 text-sm text-foreground">
      <span className="shrink-0 font-medium">{correctChoice.displayLabel})</span>
      <Markdown content={correctChoice.textMd} />
    </div>
    <Markdown content={explanationMd} className="mt-2 text-sm" />
  </div>
</div>
```

---

## Test Plan (TDD)

Primary suite: `components/question/Feedback.test.tsx`

### Existing assertions that break

No current assertions in `Feedback.test.tsx` or `theme-token-regression.test.tsx` are expected to fail solely from adding inner section containment cards:

- `Feedback.test.tsx` is mostly content/order assertions and does not currently assert absence of inner success/destructive section cards.
- `theme-token-regression.test.tsx` only asserts badge semantic tokens (`bg-success/15`, `bg-destructive/15`) and remains compatible.

### New/updated tests needed

1. Correct flow: "Correct answer" content is wrapped in `border-success/20 bg-success/5`.
2. Incorrect flow: "Your answer" content is wrapped in `border-destructive/20 bg-destructive/5`.
3. Incorrect flow: "Correct answer" content is wrapped in `border-success/20 bg-success/5`.
4. Wrong-answer cards keep neutral styling (`border-border/60 bg-background/50`) and are unchanged.
5. Badge and reference section class patterns remain unchanged (explicit regression guard).

### TDD order

1. Add test for correct-flow success card containment (RED)
2. Implement correct-flow containment (GREEN)
3. Add test for incorrect-flow destructive/success containment (RED)
4. Implement incorrect-flow containment (GREEN)
5. Add regression test that wrong-answer cards remain neutral (RED)
6. Verify badge/reference regressions remain unchanged (GREEN)
7. Run:
   - `pnpm test --run components/question/Feedback.test.tsx`
   - `pnpm test --run components/theme-token-regression.test.tsx`

---

## Verification Plan

- [ ] Incorrect answer in practice view: red "Your answer" card appears above green "Correct answer" card
- [ ] Correct answer in practice view: green "Correct answer" card appears before wrong-answer cards
- [ ] Wrong-answer cards remain neutral in both flows
- [ ] Badge colors and reference block rendering are unchanged
- [ ] Light mode: section tints are subtle but visible
- [ ] Dark mode: section tints remain subtle and readable, without overpowering card foreground text
- [ ] Review/history/bookmark entry points render the same containment behavior

---

## Summary of Changes

| What | Before | After |
|------|--------|-------|
| Correct-answer section (both flows) | Flat text block | Success-contained card (`border-success/20 bg-success/5`) |
| Your-answer section (incorrect flow) | Flat text block | Destructive-contained card (`border-destructive/20 bg-destructive/5`) |
| Wrong-answer section cards | Neutral cards | Unchanged neutral cards |
| Badge / Reference / Props / MDX | Existing behavior | Unchanged |

---

## Related

- [BS-041](../brainstorming/bs-041-feedback-display-content-vs-code-separation.md) — Source analysis and Part A/Part B boundary
- [DEBT-275](./debt-275-bs033-residual-open-items.md) — Residual content-layer items (C2, C3) and clinical-pearl enhancement (F1)
- [DEBT-274](../_archive/debt/debt-274-incorrect-answer-feedback-flow-reorder.md) — Prior incorrect-flow ordering change
