# Review Mode Attempt Identity Gap — Brainstorming

**Date:** 2026-02-11
**Triggered by:** Post-SPEC-023 external review audit of review mode behavior
**Scope:** Multi-attempt questions show the wrong attempt data in review mode because no attempt identifier is passed through the URL
**Related:** `bs-009-session-review-navigation-gap.md` (shares root cause: insufficient URL context), SPEC-023

---

## The Problem

**When a user has attempted the same question multiple times, review mode always shows the most recent attempt — not the attempt the user clicked to review.**

This is a data correctness bug, not a cosmetic issue. A physician who clicks on a specific "Incorrect" entry in their Recent Activity expects to see *that* incorrect attempt (the choices they selected, the feedback for those choices). Instead, they see their most recent attempt, which may have a completely different result.

### Concrete Scenario

A user attempts Question Q1 three times:

```
Attempt A  (Feb 1, 10:00) — Incorrect (selected choice C)
Attempt B  (Feb 1, 11:00) — Incorrect (selected choice B)
Attempt C  (Feb 1, 12:00) — Correct   (selected choice A)
```

**Dashboard Recent Activity** shows three separate entries for Q1, each with its own result badge. The user clicks the first entry (Attempt A, "Incorrect").

- **URL generated:** `/app/questions/q1?from=dashboard&mode=review`
- **Expected:** Shows Attempt A data — choice C highlighted, "Incorrect" feedback, explanation for why C is wrong
- **Actual:** Shows Attempt C data — choice A highlighted, "Correct" feedback

The user clicked an "Incorrect" entry but sees "Correct." The data is wrong.

---

## Root Cause Analysis

Three independent design decisions compound into this bug:

### 1. No `attemptId` in the URL

`toQuestionRoute()` in `lib/routes.ts` only accepts `from` and `mode` parameters:

```typescript
// lib/routes.ts:31-44
export function toQuestionRoute(
  slug: string,
  options?: {
    from?: QuestionOrigin;
    mode?: QuestionMode;
  },
): string { ... }
```

No `attemptId` parameter exists. All review links point to the same URL regardless of which attempt originated them.

### 2. Entry points have the data but don't use it

| Entry Point | Has attemptId? | Passes it to URL? |
|---|---|---|
| **Dashboard Recent Activity** | Yes — `row.attemptId` (used as React `key`) | No |
| **Session Breakdown** | No — has `isAnswered` and `isCorrect` but no attempt ID | No |
| **History Questions Tab** | No — groups by question, shows latest result only | N/A (no multi-attempt issue) |

The Dashboard page (`app/(app)/app/dashboard/page.tsx:207-212`) uses `row.attemptId` as the list `key` but doesn't pass it to `toQuestionRoute()`:

```tsx
<li key={row.attemptId}>
  <Link href={toQuestionRoute(row.slug, { from: 'dashboard', mode: 'review' })}>
    {/* row.attemptId is available but ignored in the URL */}
  </Link>
</li>
```

### 3. `getPreviousAttempt` always fetches the latest attempt

The `GetPreviousAttemptUseCase` (`src/application/use-cases/get-previous-attempt.ts:33-36`) calls:

```typescript
const attempt = await this.attempts.findLatestByUserAndQuestion(
  input.userId,
  input.questionId,
);
```

The repository implementation (`src/adapters/repositories/drizzle-attempt-repository.ts:166-182`) orders by `desc(answeredAt), desc(id)` and takes `limit(1)` — always returning the most recent attempt, with no way to fetch a specific one.

---

## Affected Entry Points

### Dashboard Recent Activity — **BUG (data mismatch)**

Each row in `recentActivity` is a distinct attempt with its own `attemptId`, `isCorrect`, and `answeredAt`. The same question CAN appear multiple times with different results. But all entries for the same question link to the identical URL.

**User impact:** Clicking an older attempt shows the wrong result badge, wrong selected choice, and wrong feedback.

### Session Breakdown — **BUG (cross-session data leak)**

The `SessionBreakdownList` generates links with `toQuestionRoute(slug, { from, mode: 'review' })`. When a user reviews a question from Session A's breakdown, `getPreviousAttempt` fetches the latest attempt *across all sessions*. If the user also answered Q1 in Session B (more recently), the review shows Session B's data — not Session A's.

**User impact:** Clicking a question from an old session shows a different session's answer.

### History Questions Tab — **NO BUG**

The History tab groups by question and shows only the latest result per question (`get-attempted-questions.ts` uses `listAttemptedQuestionsByUserId`). There is exactly one entry per question. The latest result shown matches what `getPreviousAttempt` returns. No data mismatch.

---

## What's NOT a Bug (Validated as Intentional)

Two other observations from the same review audit were validated as working-as-designed:

### Subtitle text is origin-based, not mode-based

The subtitle "Reviewing a question from your history." appears in both review and reattempt mode when originating from history. This is intentional per SPEC-023, which explicitly states: "Keep existing origin-based subtitles." The `mode` parameter controls behavior (pre-fill vs. blank form), not subtitle text.

### Unanswered questions link with `mode=review`

Session breakdown links unconditionally include `mode=review`, even for unanswered questions. SPEC-023 explicitly prescribes this: the question page falls back silently to attempt mode when no previous attempt exists. The user sees a fresh form with no error. Working as designed.

---

## Severity Assessment

**Medium-High.** This is a data correctness issue, not a crash or security bug. But it violates user trust:

- The user sees the wrong answer highlighted in review mode
- The result badge on the entry point ("Incorrect") contradicts the review page ("Correct")
- For a board prep platform where physicians are studying their mistakes, showing the wrong mistake undermines the core learning loop

**Frequency:** Low for most users (requires multiple attempts on the same question). Higher for users who use the "Try Again" flow repeatedly.

---

## Proposed Fix (Sketch)

### Layer 1: Pass `attemptId` through the URL

1. Add optional `attemptId` to `toQuestionRoute()`:
   ```typescript
   export function toQuestionRoute(
     slug: string,
     options?: {
       from?: QuestionOrigin;
       mode?: QuestionMode;
       attemptId?: string;
     },
   ): string { ... }
   ```

2. Dashboard page passes `row.attemptId` to `toQuestionRoute()`.

3. Session breakdown passes attempt ID (requires the data to be available in `PracticeSessionReviewRow` — currently it is not).

### Layer 2: `getPreviousAttempt` supports fetching by ID

1. Add `attemptId` to `GetPreviousAttemptInput` (optional).

2. When `attemptId` is provided, fetch that specific attempt instead of the latest:
   ```typescript
   const attempt = input.attemptId
     ? await this.attempts.findById(input.attemptId)
     : await this.attempts.findLatestByUserAndQuestion(input.userId, input.questionId);
   ```

3. Validate that the fetched attempt belongs to the requesting user (authorization check).

### Layer 3: URL parsing + controller wiring

1. Parse `attemptId` from search params in `question-page-client.tsx`.
2. Pass it through the controller hook to the `getPreviousAttempt` server action.

### Open Questions

- **Should the History Questions Tab also pass `attemptId`?** Currently it groups by question (latest result), so there's no multi-attempt confusion. But if we later show multiple attempts per question, we'd need it.
- **URL length/privacy:** `attemptId` is a UUID. Adding it to the URL is fine for length but exposes an internal ID. Should we use a shorter identifier or is UUID acceptable?
- **Session Breakdown data gap:** `PracticeSessionReviewRow` doesn't currently include `attemptId`. The use case (`get-practice-session-review.ts`) would need to be updated to include it.

---

## Relationship to Other Brainstorming Docs

| Doc | Relationship |
|-----|-------------|
| `bs-009-session-review-navigation-gap.md` | **Shared root cause** — both stem from insufficient URL context. That doc covers missing `sessionId` for sequential navigation. This doc covers missing `attemptId` for data correctness. Fixes could be combined (both add params to `toQuestionRoute`). |
| `bs-008-question-review-mode-gap.md` (archived) | **Predecessor** — this doc originally identified the need for review mode (SPEC-023). The attemptId gap is a refinement that SPEC-023 v1 intentionally deferred. |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-11 | Documented as brainstorming, not spec | Needs architectural discussion (combined with sessionId work?) before speccing |
| 2026-02-11 | Validated via code trace, not Playwright | The bug is in URL construction and data fetching, not rendering. Code trace is the right validation tool. |
| 2026-02-11 | Confirmed subtitle and unanswered-link observations are NOT bugs | Both are explicitly prescribed by SPEC-023 |
