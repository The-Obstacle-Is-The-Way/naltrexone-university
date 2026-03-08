# DEBT-288: Feedback Redundant Section Labels

**Priority:** P3
**Created:** 2026-03-08
**Status:** Active

---

## Problem

The feedback component renders redundant section-header labels that restate information already conveyed by the status pill and card styling:

| Flow | Redundant Label | Why It's Redundant |
|------|----------------|--------------------|
| Correct | "Correct answer" (line 69 via `CorrectAnswerSection`) | The `Correct` pill (green) already communicates this. The green-bordered card reinforces it. |
| Incorrect | "Your answer" (line 187) | The `Incorrect` pill (red) already communicates this. The red-bordered card + red letter circle reinforces it. |

The visual hierarchy is already doing the work through three redundant channels:
1. **Pill color** — green = correct, red = incorrect
2. **Card border color** — `border-success/60` vs `border-destructive`
3. **Letter circle color** — green circle vs red circle

The text labels add a fourth channel that doesn't carry new information. They consume vertical space and create visual noise, making the feedback feel heavier than necessary.

### What stays

- **"Correct answer" label in the incorrect flow** — This label introduces a *different* card (transitioning from the user's wrong answer to the correct answer). It carries genuinely new information.
- **"Why other answers are wrong:" label** — Introduces a distinct section with different card styling. Not redundant.
- **"Reference" label** — Introduces the reference section below the separator. Not redundant.
- **"Explanation" fallback label** — When `correctChoice` is null and the label reads "Explanation" in the correct flow, the same redundancy applies (the pill already says "Correct"). Remove it there too.

---

## Proposed Fix

### Correct flow: Before

```
Correct pill → "Correct answer" label → green card → Why other answers are wrong → wrong cards → Reference
```

### Correct flow: After

```
Correct pill → green card → Why other answers are wrong → wrong cards → Reference
```

### Incorrect flow: Before

```
Incorrect pill → "Your answer" label → red card → "Correct answer" label → green card → Why other answers are wrong → wrong cards → Reference
```

### Incorrect flow: After

```
Incorrect pill → red card → "Correct answer" label → green card → Why other answers are wrong → wrong cards → Reference
```

---

## Implementation

**File:** `components/question/feedback.tsx`

### 1. `CorrectAnswerSection` — add `showLabel` prop

```tsx
type CorrectAnswerSectionProps = {
  sectionClassName: string;
  correctChoice: FeedbackChoiceExplanation | null;
  explanationMd: string | null;
  showLabel?: boolean;  // new — defaults to true
};
```

When `showLabel` is `false`:
- Do not render the label `<div>` (line 68-70)
- Remove `mt-2` from the green card `<div>` (line 71), since `mt-2` was spacing from the label — the section container's `mt-6` handles spacing from the pill

### 2. Correct flow — pass `showLabel={false}`

```tsx
<CorrectAnswerSection
  sectionClassName="mt-6"
  correctChoice={correctChoice}
  explanationMd={explanationMd}
  showLabel={false}
/>
```

### 3. Incorrect flow — remove "Your answer" label

Remove the `<div>` at line 186-187 that renders "Your answer". Remove `mt-2` from the red card (line 189) for the same reason — the container's `mt-6` handles spacing from the pill.

### 4. Incorrect flow — keep "Correct answer" label

No change to the `CorrectAnswerSection` call in the incorrect flow (lines 209-213). It already defaults to `showLabel={true}`.

This intentionally preserves:
- the `"Correct answer"` label when `correctChoice` is present in the incorrect flow
- the fallback `"Explanation"` label when `correctChoice === null` in the incorrect flow

The redundancy claim only applies to the first card after the verdict pill:
- correct flow: the success card
- incorrect flow: the destructive `"Your answer"` card

### Accessibility guardrail

The visible labels are redundant for sighted users, but removing them must not make the first card semantically ambiguous for assistive-technology users.

Implementation must therefore verify that:
- the verdict pill text (`Correct` / `Incorrect`) is still announced before the first unlabeled card in DOM reading order
- the first card remains understandable without relying on color alone

If that validation fails, the compensation should stay inside `components/question/feedback.tsx`:
- prefer `role="group"` plus `aria-label` / `aria-labelledby` on the affected card container
- do **not** rely on a bare `aria-label` on a plain `div`

---

## Scope

- **Production code:** `components/question/feedback.tsx`
- **0 new files**
- **Test updates required:**
  - `components/question/Feedback.test.tsx`
  - `app/(app)/app/questions/[slug]/question-page-client.test.tsx`
  - `app/(app)/app/practice/components/practice-view.test.tsx`
- **E2E selector audit required:** these specs currently query `"Correct answer"` by exact text and must be reviewed during implementation because removing the correct-flow label can make the assertion outcome-dependent:
  - `tests/e2e/practice.spec.ts`
  - `tests/e2e/subscribe-and-practice.spec.ts`
  - `tests/e2e/core-app-pages.spec.ts`
  - `tests/e2e/review-mode-audit.spec.ts`
- **No doc changes needed** — this is a UI simplification, not a policy change

---

## Validation

1. `pnpm test --run` — all tests pass after assertion updates
2. `pnpm typecheck` — clean
3. `pnpm lint` — clean
4. Visual verification in browser:
   - Correct flow: pill → green card (no label) → wrong cards → reference
   - Incorrect flow: pill → red card (no label) → "Correct answer" → green card → other wrong cards → reference
5. Confirm spacing is uniform — no extra gaps from removed labels
6. Accessibility verification:
   - sequential screen-reader reading order still makes the first card understandable in both flows
   - quick colorblind check confirms the kept `"Correct answer"` label and verdict pill still distinguish the two cards in the incorrect flow without relying only on red/green contrast
