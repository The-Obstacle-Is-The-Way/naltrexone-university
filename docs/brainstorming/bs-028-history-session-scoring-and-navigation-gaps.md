# BS-028: History Session Scoring and Navigation Gaps

**Date:** 2026-02-21
**Triggered by:** Dogfooding — Tutor session with 5 questions (1 answered, 4 unanswered) displays "1/1 correct (100%)" instead of reflecting unanswered questions; session card lacks clickable navigation to review mode
**Scope:** Tutor mode score display misleads users about session completeness; session card navigation requires excessive clicks to reach the session review navigator
**Related:** [BS-022](../_archive/brainstorming/bs-022-unanswered-question-review-handling.md) (Unanswered Question Review Handling — archived), [SPEC-034](../specs/spec-034-unanswered-question-review-handling.md)

---

## The Problem

Three related UX issues on the History → Sessions tab:

### Problem 1: Tutor Mode Score Hides Unanswered Questions

**Observed:** A Tutor session with 5 questions where only 1 was answered (correctly) and 4 were left unanswered displays:

```
Tutor • 1/1 correct (100%) • 42s • Feb 20, 2026
```

**Expected:** The display should reflect that 4 questions were not answered. Something like:

```
Tutor • 1/5 correct (20%) • 42s • Feb 20, 2026
```

The current logic is **intentionally designed** this way — Tutor mode uses `answered` as the denominator while Exam mode uses `questionCount`. But from a user's perspective, seeing "100%" when you only answered 1 out of 5 questions is misleading. It gives a false sense of mastery.

### Problem 2: Session Card Not Clickable → Review Mode

**Observed:** To get from the History sessions list to the session review navigator (the question-by-question review with Previous/Next navigation), the user must:

1. Click "View breakdown" button on the session card
2. Wait for breakdown to load
3. Click an individual question link in the breakdown list

**Expected:** Clicking the session card header ("Tutor • 1/1 correct • 42s") or some prominent element should navigate directly to the session review navigator (starting at question 1). The individual question links in the breakdown are a nice detail view, but the primary action should be "review this session."

### Problem 3: No "Go to Session Review" Action in Breakdown

**Observed:** Once the breakdown is expanded, the only navigation options are individual question links. There is no button or link to enter the full session review mode (the question navigator page starting at question 1).

**Expected:** The breakdown panel should have a prominent action to enter the session review navigator, in addition to the per-question links.

---

## Root Cause Analysis

### Problem 1: Score Denominator Logic

**File:** `src/application/use-cases/get-session-history.ts:57-58`

```typescript
const accuracyDenominator =
  session.mode === 'exam' ? questionCount : answered;
```

**File:** `app/(app)/app/history/components/history-sessions-tab.tsx:64-65`

```typescript
const fractionDenominator =
  row.mode === 'exam' ? row.questionCount : row.answered;
```

Both the use case and the display component use `answered` (not `questionCount`) as the denominator for Tutor mode. This was a deliberate design decision — Tutor mode is "learn as you go," so the thinking was only answered questions should count.

**But the UX consequence is bad:** A user who quits a Tutor session after answering 1 of 5 questions sees "100%" — which is technically "100% of what you answered" but reads as "you aced this session."

**Existing test confirms this is intentional** (`get-session-history.test.ts:85-138`): The test explicitly asserts Tutor mode with 1 answered + 1 unanswered yields `accuracy: 1` (100%).

### Problem 2: Session Card Has No Click Handler

**File:** `app/(app)/app/history/components/history-sessions-tab.tsx:78-81`

```typescript
<li
  key={row.sessionId}
  className="rounded-xl border border-border/60 bg-muted/20 p-3"
>
```

The `<li>` is a plain container. The session summary text (lines 83-94) is a `<div>` with `<span>` children — none are links or buttons. The only interactive element is the "View breakdown" `<Button>` (lines 96-106).

### Problem 3: Breakdown Only Has Per-Question Links

**File:** `app/(app)/app/shared/components/session-breakdown-list.tsx:26-38`

Each question row is a `<Link>` to `toQuestionRoute(slug, { from: 'history', mode: 'review', sessionId, historyHref })`. There is no session-level "Review all" link or button in the breakdown panel.

---

## Severity Assessment

| Problem | Severity | Frequency | Impact |
|---------|----------|-----------|--------|
| **Misleading Tutor score** | Medium-High | Every Tutor session that's abandoned early or has unanswered questions | Users get false confidence; undermines trust in the scoring system |
| **Session card not clickable** | Medium | Every session review | Extra clicks; non-obvious path to session review mode |
| **No "Review session" action** | Low-Medium | Every breakdown expansion | Users must click a specific question rather than entering review at the start |

---

## Proposed Fix (Sketch)

### Fix 1: Unify Score Denominator

**Option A (Recommended): Always use `questionCount` as denominator for both modes.**

- Tutor and Exam both show `correct/questionCount` → e.g., "1/5 correct (20%)"
- Simple, honest, consistent
- Requires updating: `get-session-history.ts`, `history-sessions-tab.tsx`, and their tests

**Option B: Show dual info for Tutor.**

- Display: "1/1 answered correct • 4 unanswered • 5 total"
- More informative but more complex UI

**Option C: Keep Tutor denominator as `answered` but add an "unanswered" indicator.**

- Display: "1/1 correct (100%) • 4 unanswered"
- Preserves current logic but makes the incompleteness visible

### Fix 2: Make Session Card Navigable

**Option A (Recommended): Make the session summary text a link.**

- Wrap "Tutor • 1/5 correct (20%) • 42s • Feb 20, 2026" in a `<Link>` that navigates to the first question of the session in review mode
- Keep "View breakdown" button for the expanded detail view
- Requires: knowing the first question's slug (may need to fetch or include in the session history row)

**Option B: Make the entire card clickable.**

- The `<li>` becomes a clickable card that navigates to session review
- "View breakdown" becomes a secondary action (e.g., expand/collapse arrow)

### Fix 3: Add "Review Session" Button to Breakdown

- Add a "Review session" button/link at the top of the breakdown panel
- Links to the first question of the session in review mode
- Straightforward addition to `SessionBreakdownList` or the breakdown container in `history-sessions-tab.tsx`

---

## Open Questions

1. **Should Tutor and Exam scoring be fully unified?** Or is there a valid reason to keep Tutor denominator as `answered`? (User feedback strongly suggests unification.)

2. **What slug do we use for the session-level link?** The session history rows don't currently include question slugs. Options:
   - Fetch the first question slug on the server when building the history page
   - Add `firstQuestionSlug` to the `SessionHistoryRow` type
   - Use the session review endpoint to get the first question, then redirect

3. **Should the session card navigate to review mode, or to the breakdown?** The user's instinct is that clicking the card should go to the review navigator (Question 1 of N with Previous/Next). The breakdown could remain an inline expand action via the button.

4. **Does the "Back to History" link from the review page need updating?** Currently it uses `historyHref` to preserve pagination state. This should continue working regardless of how we enter review mode.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-21 | Created brainstorming doc | Dogfooding revealed misleading Tutor score display and navigation friction |
