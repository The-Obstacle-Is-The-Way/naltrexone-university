# BUG-156: Practice View Post-Submit UX — Button Promotion and Auto-Scroll to Feedback

**Status:** Fixed (2026-02-26)
**Priority:** P1
**Date:** 2026-02-25
**Source:** [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) (Problems 15, 17)

---

## Description

Two post-submit interaction issues in the Practice View that degrade the moment-of-learning experience:

### 1. Post-submit button hierarchy is flat (Problem 15)

After submitting an answer in Quick Practice, the action bar doesn't meaningfully change:
- **Submit** remains visible but disabled — taking up space with no purpose
- **Next →** stays as an outline button — not promoted to primary despite being the clear next action
- The user has to scan the bar to figure out what to do next

**Current action bar (post-submit):**
```
[Submit (disabled)] [Next → (outline)] [Bookmark (outline)]
```

**Expected (post-submit):**
```
[Next → (primary/filled)] [Bookmark (outline)]
```

Submit should be hidden after submission. Next → should become the primary action.

**Note:** Pre-submit hierarchy is already differentiated (Submit = default/primary variant, Next/Bookmark = outline variant). Only the post-submit state is weak.

### 2. No auto-scroll to feedback after submit (Problem 17)

After submitting, the feedback card (verdict + explanation + wrong-answer breakdown + reference) appears below the question card. For longer questions, this requires ~2.5 screen lengths of scrolling. The most critical information — the verdict and correct answer — may be below the fold.

**Current:** No scroll behavior exists after submit. The code only does focus recovery after error states (`use-practice-question-answer-flow.ts:127-136`), not after successful submission.

**Expected:** After submission, auto-scroll to bring the top of the feedback card into the viewport.

## Steps to Reproduce

### Button hierarchy:
1. Navigate to Quick Practice
2. Select an answer and click Submit
3. Observe: Submit button is disabled but still visible; Next → is still outline variant

### Auto-scroll:
1. Navigate to Quick Practice
2. Find a question with a long stem (multi-paragraph)
3. Select an answer and click Submit
4. Observe: Feedback card appears below but viewport doesn't scroll to it; user must scroll manually

## Root Cause

### Button hierarchy

`app/(app)/app/practice/components/practice-view.tsx:249-317`:

The action bar renders all buttons unconditionally when `props.question` is truthy. Submit is always rendered (lines 270-277) with `disabled={!props.canSubmit || props.isPending}` — after submission, `canSubmit` becomes false, so Submit is disabled but still visible. Next → (lines 279-291) always uses `variant="outline"` regardless of submit state.

### Auto-scroll

`app/(app)/app/practice/hooks/use-practice-question-answer-flow.ts:125-136`:

After submission, only focus recovery runs (`questionAreaRef.current?.focus()`). There is no `scrollIntoView` call targeting the feedback card.

The feedback card doesn't have a ref at all — it's rendered conditionally in `practice-view.tsx:240-247`:

```tsx
{props.submitResult && !isExamMode ? (
  <Feedback ... />
) : null}
```

## Fix

### Fix 1: Post-submit button promotion

**File:** `app/(app)/app/practice/components/practice-view.tsx`

Hide Submit after submission and promote Next → to primary:

```diff
-<Button
-  type="button"
-  className="rounded-full"
-  disabled={!props.canSubmit || props.isPending}
-  onClick={props.onSubmit}
->
-  {isSubmittingAnswer ? 'Submitting…' : 'Submit'}
-</Button>
+{!props.submitResult ? (
+  <Button
+    type="button"
+    className="rounded-full"
+    disabled={!props.canSubmit || props.isPending}
+    onClick={props.onSubmit}
+  >
+    {isSubmittingAnswer ? 'Submitting…' : 'Submit'}
+  </Button>
+) : null}
```

Promote Next → to primary variant after submit:

```diff
 <Button
   type="button"
-  variant="outline"
+  variant={props.submitResult ? 'default' : 'outline'}
   className="rounded-full"
   disabled={...}
   onClick={props.onNextQuestion}
 >
   Next →
 </Button>
```

### Fix 2: Auto-scroll to feedback

**File:** `app/(app)/app/practice/components/practice-view.tsx`

Add a ref to the feedback section and scroll to it when `submitResult` appears:

```tsx
const feedbackRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (props.submitResult && feedbackRef.current) {
    feedbackRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}, [props.submitResult]);
```

Wrap the feedback rendering with the ref:

```diff
-{props.submitResult && !isExamMode ? (
-  <Feedback ... />
-) : null}
+{props.submitResult && !isExamMode ? (
+  <div ref={feedbackRef}>
+    <Feedback ... />
+  </div>
+) : null}
```

**Note:** Exam mode doesn't show feedback inline (it shows at session end), so the scroll only applies to non-exam flows.

## Affected Files

| File | Change |
|------|--------|
| `app/(app)/app/practice/components/practice-view.tsx` | Hide Submit post-submit. Promote Next → to primary. Add feedback ref + auto-scroll. |
| `app/(app)/app/practice/components/practice-view.test.tsx` | Assert Submit hidden after submission. Assert Next → variant changes. |
| `app/(app)/app/practice/components/practice-view.browser.spec.tsx` | Assert scroll behavior if feasible in browser mode |

## Verification

- [x] Pre-submit: Submit is primary, Next → is outline — no regression
- [x] Post-submit: Submit is hidden
- [x] Post-submit: Next → is promoted to primary (filled) variant
- [x] Post-submit: Bookmark button remains visible and functional
- [x] Post-submit: Viewport scrolls smoothly to feedback card
- [x] Short questions (feedback visible without scroll): no jarring scroll behavior
- [x] Exam mode: no feedback scroll (feedback not shown inline)
- [x] Session mode (Tutor): button hierarchy works correctly
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test --run` passes

## Related

- [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) — Problems 15 and 17
- BUG-155 — Feedback card visual overhaul (visual complement to this UX fix)
