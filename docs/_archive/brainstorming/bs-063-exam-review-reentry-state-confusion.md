# BS-063: Exam Review Re-Entry State Confusion

**Date:** 2026-04-11
**Triggered by:** User walkthrough of the exam flow end-to-end. After completing an exam, the initial post-exam review and the summary-launched re-entry review can expose different visible button states because they reopen the same review surface at different cursor positions. The user described it as "we're getting crossed here" and suspected the review state machine was mixing states.
**Scope:** Audit the current Summary <-> Post-exam review loop inside `/app/practice/[sessionId]`, trace the actual cursor/label behavior through the shipped hooks, and document where the current implementation creates product confusion.
**Related:** [BS-061](./bs-061-review-surface-divergence-audit.md), [DEBT-350](../debt/debt-350-exam-results-session-continuity.md), [DEBT-359](../debt/debt-359-session-summary-cta-labels.md), [DEBT-360](../debt/debt-360-action-bar-below-fold.md), [DEBT-361](../debt/debt-361-exam-last-question-next-label.md), [DEBT-362](../debt/debt-362-review-submit-screen-affordances.md)
**Promoted to:** [DEBT-364](../../debt/debt-364-post-exam-review-reentry-cursor-persistence.md) on 2026-04-17

---

## Current User Flow Map

### Tutor mode (contrast case)

```text
1. Practice setup -> pick Tutor
2. Question flow -> answer each question -> feedback appears immediately
3. End session
4. Session Summary -> [New Session] [View in History]
```

Tutor mode still goes through `usePracticeSessionReviewStageState()`, but its `onEndSession()` branch finalizes immediately when `sessionMode !== 'exam'` and `isInReviewStage === false`. There is no review-stage loop.

### Exam mode (current shipped behavior)

```text
1. Practice setup -> pick Exam
2. Question flow -> answer questions with no feedback during the run
3. Click "Finish exam" or click "Review & Submit" on the last question
4. Review & Submit (ExamReviewView)
5. Click "Submit exam"
6. Post-exam review (PostExamReviewView) -> initial entry lands on Q1
7. Click "View Summary" or "Finish review"
8. Session Summary
9. Click "Review Answers"
10. Post-exam review again
```

The important nuance is step 10:

- It reuses the same `PostExamReviewView`.
- It reuses the same in-memory `postExamReview` payload when already loaded.
- It reuses the last viewed available question unless the user clicked a specific breakdown row.

That means the visible action set can change on re-entry without a component swap. If the user left review from the last question, re-entry shows `Previous` + `Finish review`; if the user left from the first question, re-entry shows `Next`.

---

## What The Code Actually Does

### 1. The loop itself is intentional

`setSummary()` in [use-practice-session-exam-results-continuity.ts](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.ts:85) sets `examResultsSubstage` to `session_summary` whenever the resolved summary is exam-mode. `onViewSummary()` simply routes back through that setter. The loop is real and unbounded by design:

```text
post_exam_review <-> session_summary
```

This is not a rogue route transition. It is the intended in-session state machine introduced by DEBT-350.

### 2. Untargeted re-entry preserves cursor

The confusing behavior comes from `onReenterPostExamReview()` in [use-practice-session-exam-results-continuity.ts](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.ts:192).

In both re-entry branches, the hook passes `persistedQuestionId: postExamReviewCurrentQuestionId`:

- Cached payload branch: lines 197-205
- Fetch-on-demand branch: lines 209-213

`resolvePostExamReviewCurrentQuestionId()` then resolves in this order:

1. `requestedQuestionId` when present and available
2. `persistedQuestionId` when present and available
3. First available row
4. First row

So the current behavior is:

- Initial post-submit entry: Q1 / first available
- Summary button re-entry: last viewed available question
- Breakdown row re-entry: clicked question when available, otherwise last viewed available question

The earlier draft of this doc overstated the behavior as "always lands on the last question." That is only true when the user exits review from the last question, which is common when they use `Finish review`, but it is not the general rule.

### 3. Labels are static because the view has no entry-context prop

`PostExamReviewView` in [post-exam-review-view.tsx](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:14) receives:

- `currentQuestionId`
- navigation/bookmark callbacks
- `onViewSummary`

It does not receive any signal that distinguishes:

- initial post-submit review
- summary-button re-entry
- breakdown-row re-entry

So the labels stay fixed:

- Header button: `View Summary`
- Last-question CTA: `Finish review`

That is why the same labels appear even after the user has already "finished" once.

### 4. The visible button difference is cursor-driven, not renderer-driven

The user experience feels like "different states" because `previousRow` and `nextRow` are derived from the current row inside `PostExamReviewView` itself. The component is not changing; the cursor is.

That distinction matters:

- The state-management issue is real.
- The symptom is not caused by two different review components competing.

---

## Root Cause Analysis

### Direct code causes

1. `onViewSummary()` does not reset `postExamReviewCurrentQuestionId`; it only toggles the substage back to summary.
2. `onReenterPostExamReview()` always reuses `postExamReviewCurrentQuestionId` for untargeted re-entry.
3. `PostExamReviewView` has no explicit `entrySource` or `hasVisitedSummary` input, so its labels cannot adapt to re-entry context.

### Process cause

The first version of today's interaction-contract update mixed current behavior with intended behavior. That made diagnosis harder because the doc described a Q1 reset and contextual labels that the code does not implement. This audit corrects that drift, but the product confusion comes from the code path above, not from the docs alone.

---

## Complexity Audit

These three hooks currently carry the session/review orchestration:

| Hook file | `useState` | `useRef` | `useCallback` | Total |
|-----------|------------|----------|---------------|-------|
| `use-practice-session-review-stage.ts` | 2 | 2 | 7 | 11 |
| `use-practice-session-review-stage-state.ts` | 3 | 1 | 6 | 10 |
| `use-practice-session-exam-results-continuity.ts` | 5 | 2 | 7 | 14 |
| **Total** | **10** | **5** | **20** | **35** |

That is not automatically a design failure, but it does mean cursor semantics and label semantics need to be explicit. They are not things a future change should "inherit by accident."

---

## Additional Risks Verified

| Risk | Location | Severity | Notes |
|------|----------|----------|-------|
| `onFinalizeReview` depends on the entire `reviewStage` object | [use-practice-session-review-stage.ts](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts:224) | Low | Not currently breaking, but broader than necessary. Narrowing to the specific members would reduce churn. |
| `finalizeExamSessionForPostReview()` can return `null`, and `onFinalizeReview()` then silently returns | [use-practice-session-review-stage.ts](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.ts:228) | Low | Finalization errors are handled upstream, so this is mostly a clarity issue. |
| Re-entry cursor semantics lack targeted hook-level assertions | [use-practice-session-exam-results-continuity.test.tsx](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.test.tsx:1) | Medium | The hook test only verifies the initial state contract. Re-entry behavior is covered mostly at browser/orchestrator level. |

---

## Severity Assessment

**Severity:** P2

- The flow is functionally recoverable, but it is easy to misread.
- The same screen appears to behave differently depending on where the user left it.
- This compounds with [DEBT-359](../debt/debt-359-session-summary-cta-labels.md): ambiguous summary CTAs plus sticky cursor semantics make the whole post-exam flow feel less intentional than it is.

---

## Proposed Fixes

### Fix 1: Make the contract explicit and keep it current

Section 5 of [interaction-contracts.md](../../practice-engine/interaction-contracts.md) now reflects the shipped behavior. Keep that doc current first, then propose product changes as deltas instead of writing intended behavior into the current-implementation contract.

### Fix 2: Reset untargeted re-entry only if product wants a fresh pass

If the product decision is "`Review Answers` should always restart at Q1", the change belongs in both `onReenterPostExamReview()` branches:

- Cached payload branch
- Fetch-on-demand branch

The key change is to stop passing `postExamReviewCurrentQuestionId` as `persistedQuestionId` when no `questionId` was requested.

### Fix 3: Thread explicit entry context into `PostExamReviewView`

If labels should change on re-entry, add a small state value such as:

```ts
type PostExamReviewEntrySource =
  | 'initial'
  | 'summary_button'
  | 'summary_row';
```

Store that alongside the substage and pass it through `renderPracticeSessionExamResults()` into `PostExamReviewView`. That makes label changes intentional instead of inferred from cursor position.

### Fix 4: Keep any re-entry copy changes aligned with DEBT-359

If the product decides on:

- `Review Answers`
- `New Session`
- `Finish review` -> `Back to Summary` on re-entry

those copy changes should ship as one coherent post-exam-flow pass.

---

## Open Questions

| # | Question | Leaning |
|---|----------|---------|
| Q1 | Should untargeted re-entry preserve place or reset to Q1? | Reset to Q1 if the button is framed as a fresh review pass. Preserve place if the product wants "resume review." |
| Q2 | Should breakdown-row re-entry stay targeted? | Yes. The current targeted behavior matches user intent. |
| Q3 | Should label changes be tied to entry source or to cursor position? | Entry source. Cursor position is an effect, not the product concept. |
| Q4 | Is this primarily an architecture problem? | Not today. The direct issues are cursor semantics and missing entry-context state, not the presence of multiple hooks. |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Corrected the root-cause narrative to the actual `onReenterPostExamReview()` path | The confusing behavior is caused by persisted cursor reuse plus static labels, not by two review components competing. |
| 2026-04-11 | Corrected the hook-count audit from 38 to 35 hook invocations | The previous count overstated the current complexity. |
| 2026-04-11 | Kept severity at P2 | This is user-trust erosion in a primary flow, even though the data/state are technically consistent. |
| 2026-04-11 | Recommended explicit entry-source state for label changes | Cursor position alone is not a reliable product signal. |
