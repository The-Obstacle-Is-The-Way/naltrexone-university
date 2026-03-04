# DEBT-274: Incorrect Answer Feedback Flow Reorder

**Priority:** P2
**Created:** 2026-03-04
**Source:** [BS-040](../brainstorming/bs-040-incorrect-answer-feedback-flow-redesign.md)
**Scope:** Primary code change in `components/question/feedback.tsx`, with synchronized test updates in `components/question/Feedback.test.tsx`

---

## Problem

The `Feedback` component renders identical section ordering for correct and incorrect answers. When the user gets a question wrong, the first thing they see after the "Incorrect" badge is the correct answer and its full explanation — their own wrong choice is buried 3-4 scroll-lengths down in the "Why other answers are wrong" section, tagged with a small "Your answer" badge.

### Current rendering (both correct AND incorrect — identical)

```
1. Badge: "Correct" or "Incorrect"
2. "Correct answer" label + letter + choice text
3. explanationMd (explanation of correct answer + clinical pearl)
4. "Why other answers are wrong:" heading + all wrong choice cards
   └── "Your answer" badge on the user's choice (if incorrect)
5. Reference
```

### Target rendering for INCORRECT answers

```
1. ❌ "Incorrect" badge
2. "Your answer" label + letter + choice text + choice.explanationMd
3. "Correct answer" label + letter + choice text + explanationMd + clinical pearl
4. "Why other answers are wrong:" heading + remaining wrong choice cards (excluding user's)
5. Reference
```

### Target rendering for CORRECT answers

**No change.** Current layout is kept as-is.

---

## Affected Files

| File | Change |
|------|--------|
| `components/question/feedback.tsx` | Conditional section ordering based on `isCorrect` |
| `components/question/Feedback.test.tsx` | Update existing tests + add new tests for incorrect flow |

### NOT affected

- MDX content files — no changes
- Domain entities — no changes
- Use cases / controllers — no changes
- Database — no changes
- Pipeline / seed scripts — no changes

---

## Affected Views

`Feedback` is rendered inside two parent components that cover every question-facing view:

| Parent Component | File | Views |
|-----------------|------|-------|
| `PracticeView` | `app/(app)/app/practice/components/practice-view.tsx` | Quick Practice, Tutor mode, Exam mode |
| `QuestionPageClient` | `app/(app)/app/questions/[slug]/question-page-client.tsx` | Dashboard review, Practice session review, History session review, History question review, Bookmarks review |

**One fix in `feedback.tsx` covers all views.**

---

## Implementation

### 1. Add new derived values (`feedback.tsx`, after line 31)

Currently the component computes:
- `correctChoice` (line 30-31): `choiceExplanations.find(c => c.isCorrect)`
- `visibleChoiceExplanations` (line 32-37): all wrong choices with non-empty explanationMd
- `hasMissingIncorrectExplanation` (line 38-43): whether any wrong choice lacks explanationMd
- `shouldRenderChoiceExplanations` (line 44-45): guard for the whole wrong-answers section

Add after line 45:

```tsx
// User's selected wrong choice (only relevant for incorrect flow)
const userChoice =
  !isCorrect && selectedChoiceId
    ? choiceExplanations.find((c) => c.choiceId === selectedChoiceId) ?? null
    : null;

// Other wrong choices excluding user's pick (only relevant for incorrect flow)
const otherWrongChoices = !isCorrect
  ? visibleChoiceExplanations.filter((c) => c.choiceId !== selectedChoiceId)
  : visibleChoiceExplanations;

// Guard for "other wrong answers" section in incorrect flow
const shouldRenderOtherWrongChoices =
  !isCorrect && shouldRenderChoiceExplanations && otherWrongChoices.length > 0;
```

### 2. Branch the JSX rendering (`feedback.tsx`, lines 59-112)

The badge (lines 49-57) and reference section (lines 114-121) are unchanged for both flows. Only the middle section (lines 59-112) needs to branch.

**CORRECT flow (keep current layout unchanged):**

When `isCorrect` is true, render exactly the current lines 59-112 with no modifications:
1. "Correct answer" label + correctChoice letter + text
2. explanationMd
3. "Why other answers are wrong:" + all visibleChoiceExplanations

**INCORRECT flow (new layout):**

When `isCorrect` is false, render in this order:

**Section A — "Your answer" (NEW):**
```tsx
{userChoice ? (
  <div className="mt-6">
    <div className="text-sm font-medium text-foreground">Your answer</div>
    <div className="flex items-start gap-1 text-sm text-foreground">
      <span className="shrink-0 font-medium">
        {userChoice.displayLabel})
      </span>
      <Markdown content={userChoice.textMd} />
    </div>
    {userChoice.explanationMd ? (
      <Markdown content={userChoice.explanationMd} className="mt-2 text-sm" />
    ) : null}
  </div>
) : null}
```

**Section B — "Correct answer" (same markup as current lines 59-82):**
```tsx
<div className={userChoice ? 'mt-4' : 'mt-6'}>
  {correctChoice ? (
    <div className="space-y-1">
      <div className="text-sm font-medium text-foreground">
        Correct answer
      </div>
      <div className="flex items-start gap-1 text-sm text-foreground">
        <span className="shrink-0 font-medium">
          {correctChoice.displayLabel})
        </span>
        <Markdown content={correctChoice.textMd} />
      </div>
    </div>
  ) : (
    <div className="text-sm font-medium text-foreground">Explanation</div>
  )}
  {explanationMd ? (
    <Markdown content={explanationMd} className="mt-2 text-sm" />
  ) : (
    <p className="mt-2 text-sm text-muted-foreground">
      Explanation not available.
    </p>
  )}
</div>
```

**Section C — "Why other answers are wrong:" (same card markup, but filtered list):**
```tsx
{shouldRenderOtherWrongChoices ? (
  <div className="mt-4">
    <div className="text-sm font-medium text-foreground">
      Why other answers are wrong:
    </div>
    <div className="mt-2 space-y-3">
      {otherWrongChoices.map((choice) => (
        <div
          key={choice.choiceId}
          className="rounded-xl border border-border/60 bg-background/50 p-3"
        >
          <div className="flex items-start gap-1 text-sm text-muted-foreground">
            <span className="shrink-0">{choice.displayLabel})</span>
            <Markdown content={choice.textMd} />
          </div>
          <Markdown
            content={choice.explanationMd ?? ''}
            className="mt-2 text-sm"
          />
        </div>
      ))}
    </div>
  </div>
) : null}
```

Note: The "Your answer" badge (`choice.choiceId === selectedChoiceId`) is **removed** from the wrong-answer cards in the incorrect flow — the user's choice is already displayed in Section A. The badge check on line 98-102 of the current code is only needed in the correct flow's wrong-answer list (where the user's choice was correct, so it won't match anyway).

### 3. What is NOT changing

- **Badge** (lines 49-57) — unchanged, both flows
- **Reference section** (lines 114-121) — unchanged, both flows
- **Card wrapper** (`<Card role="status">`) — unchanged
- **FeedbackProps type** (lines 7-21) — unchanged, no new props needed
- **`shouldRenderChoiceExplanations` guard** — still used for correct flow
- **Correct flow** — entire current layout preserved as-is

---

## Test Plan (TDD)

All tests in `components/question/Feedback.test.tsx`. Pattern: `renderToStaticMarkup` + DOMParser, per project conventions.

### Existing tests that need updates

**Test: `marks the selected wrong choice as your answer` (line 202)**

Currently asserts "Your answer" appears exactly once in the HTML. With the new layout, "Your answer" will appear as the **section label** in the "Your answer" section, not as a badge inside the wrong-answer cards. The assertion `yourAnswerBadges.toHaveLength(1)` may still pass (string appears once), but the test should be updated to verify location:

```
Update: Assert "Your answer" text appears as a section label (in a div with
font-medium class), NOT as a badge (span with bg-destructive/10 class).
```

### New tests to add

#### T1: Incorrect flow renders "Your answer" section before "Correct answer" section

```
Given: isCorrect=false, selectedChoiceId="choice-a",
       choiceExplanations with choice-a (wrong) and choice-b (correct)
When:  rendered
Then:  "Your answer" text appears BEFORE "Correct answer" text in the HTML
       AND choice-a's displayLabel + textMd appear in the "Your answer" section
       AND choice-a's explanationMd appears in the "Your answer" section
```

#### T2: Incorrect flow excludes user's choice from "Why other answers are wrong"

```
Given: isCorrect=false, selectedChoiceId="choice-a",
       choiceExplanations with choice-a (wrong), choice-b (wrong), choice-c (correct)
When:  rendered
Then:  "Why other answers are wrong:" section contains choice-b
       AND "Why other answers are wrong:" section does NOT contain choice-a's text
       AND choice-a's text appears only in the "Your answer" section
```

#### T3: Incorrect flow does not render "Your answer" badge in wrong-answer cards

```
Given: isCorrect=false, selectedChoiceId="choice-a",
       choiceExplanations with choice-a (wrong), choice-b (wrong), choice-c (correct)
When:  rendered
Then:  No element with class bg-destructive/10 and text "Your answer" exists
       (the badge is replaced by the section label)
```

#### T4: Correct flow layout is unchanged (regression)

```
Given: isCorrect=true, selectedChoiceId="choice-c",
       choiceExplanations with choice-a (wrong), choice-b (wrong), choice-c (correct)
When:  rendered
Then:  "Correct answer" text appears BEFORE "Why other answers are wrong:" text
       AND there is NO "Your answer" section label
       AND the layout matches current behavior exactly
```

#### T5: Incorrect flow with null explanationMd on user's choice

```
Given: isCorrect=false, selectedChoiceId="choice-a",
       choiceExplanations with choice-a (wrong, explanationMd=null),
       choice-b (wrong, explanationMd="..."), choice-c (correct)
When:  rendered
Then:  "Your answer" section still renders with choice-a's displayLabel + textMd
       AND no explanationMd paragraph is shown in the "Your answer" section
       AND the hasMissingIncorrectExplanation guard hides the entire
           "Why other answers are wrong" section (existing behavior preserved)
```

#### T6: Incorrect flow without selectedChoiceId falls back gracefully

```
Given: isCorrect=false, selectedChoiceId=null,
       choiceExplanations with choice-a (wrong), choice-b (correct)
When:  rendered
Then:  No "Your answer" section is rendered (userChoice is null)
       AND "Correct answer" section renders in position 2 (same as current layout)
       AND wrong-answer cards render normally (graceful degradation)
```

### Test execution order (TDD)

1. Write T1 (incorrect flow ordering) — RED
2. Add `userChoice` derived value + "Your answer" section JSX — GREEN
3. Write T2 (exclusion from wrong-answers) — RED
4. Add `otherWrongChoices` filtering + branched wrong-answer rendering — GREEN
5. Write T3 (no badge in wrong-answer cards) — RED
6. Remove badge check from incorrect flow's wrong-answer cards — GREEN
7. Write T4 (correct flow regression) — should already be GREEN
8. Write T5 (null explanationMd edge case) — should already be GREEN given existing guard
9. Write T6 (no selectedChoiceId fallback) — should already be GREEN given null check
10. Update existing `marks the selected wrong choice` test
11. Run full suite, verify all GREEN

---

## Verification Plan

After implementing, verify in the app:

- [ ] Quick Practice — answer incorrectly → "Your answer" section appears first with choice text + explanation
- [ ] Quick Practice — answer incorrectly → "Correct answer" section appears second with full explanation + clinical pearl
- [ ] Quick Practice — answer incorrectly → "Why other answers are wrong" shows remaining choices only (user's choice excluded)
- [ ] Quick Practice — answer correctly → layout is unchanged from current behavior
- [ ] Dashboard review (incorrect answer) — same correct reordering
- [ ] Dashboard review (correct answer) — layout unchanged
- [ ] History session review — both flows render correctly
- [ ] Bookmarks review — both flows render correctly
- [ ] Edge case: question with missing choice explanations — falls back to general explanation only (existing behavior)

---

## Summary of Changes

| What | Before | After |
|------|--------|-------|
| Incorrect flow: first section after badge | "Correct answer" + explanation | "Your answer" + why wrong |
| Incorrect flow: second section | (none — explanation continues) | "Correct answer" + explanation + clinical pearl |
| Incorrect flow: wrong-answer list | All wrong choices including user's (with "Your answer" badge) | All wrong choices EXCLUDING user's (no badge needed) |
| Correct flow | Unchanged | Unchanged |
| Props / types | Unchanged | Unchanged |
| MDX content | Unchanged | Unchanged |

---

## Related

- [BS-040](../brainstorming/bs-040-incorrect-answer-feedback-flow-redesign.md) — Original analysis with UWorld comparison, research backing, and content structure trace
- `components/question/feedback.tsx` — The component being modified (124 lines)
- `components/question/Feedback.test.tsx` — Existing test file (8 tests, 237 lines)
