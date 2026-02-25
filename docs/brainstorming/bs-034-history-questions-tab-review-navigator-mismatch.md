# BS-034: History Questions Tab — Ad-Hoc Questions Incorrectly Grouped into Question Navigator

**Date:** 2026-02-25
**Triggered by:** Manual UX walkthrough. Clicking "Review" on an individual ad-hoc question from History → Questions tab renders a Question Navigator grouping all three visible questions — despite them being independent, unrelated questions answered one at a time.
**Scope:** The History Questions tab treats all visible questions as a single navigable sequence, conflating ad-hoc practice with session-based review.
**Related:** [SPEC-027](../specs/) (Session Review Navigation), [SPEC-022](../_archive/specs/spec-022-question-log.md) (Question Log)

---

## The Problem

The app has three question-taking modes:

| Mode | Session? | Navigator expected? |
|------|----------|-------------------|
| **Exam mode** | Yes (`sessionId` + `sessionMode: 'exam'`) | Yes — questions belong to a scored session |
| **Tutor mode** | Yes (`sessionId` + `sessionMode: 'tutor'`) | Yes — questions belong to a practice session |
| **Ad-hoc / Quick Practice** | No (`sessionId: null`) | No — each question is independent |

**The bug:** When a user reviews any question from the **History → Questions** tab, ALL visible questions on the current page are bundled into a `historySeq` URL parameter. The question review page interprets this sequence as a navigable group and renders the Question Navigator — even when every question in the list is an independent ad-hoc question with no shared session.

### Observed behavior

1. User answers 3 questions via Quick Practice (ad-hoc, one at a time)
2. User navigates to **History → Questions** tab — sees all 3 questions listed
3. User clicks "Review" on question 1
4. **Result:** Question page shows "Question navigator" with buttons [1] [2] [3] and label "Question 1 of 3" — as if these were a 3-question session
5. User can navigate between all 3 unrelated questions using the navigator

### Expected behavior

- Ad-hoc questions should open in **standalone review** (identical to the Dashboard review behavior) — no navigator, just the single question with "Back to History" link
- Session questions (tutor/exam) should use `sessionId` to fetch the actual session and show the navigator with session-correct questions

### Contrast with working entry points

| Entry point | URL params | Navigator? | Correct? |
|-------------|-----------|-----------|----------|
| **Dashboard → Recent Activity → Review** | `from=dashboard&mode=review&attemptId=...` | No | Yes |
| **Quick Practice → inline review** | N/A (inline feedback) | No | Yes |
| **History → Sessions → Review session** | `from=history&mode=review&sessionId=...` | Yes (session questions) | Yes |
| **History → Questions → Review** | `from=history&mode=review&historySeq=q1,q2,q3&historyIndex=0` | Yes (ALL page questions) | **No** |

---

## Root Cause Analysis

### 1. History Questions tab builds sequence from ALL visible rows

`app/(app)/app/history/components/history-questions-tab.tsx:192-196`:

```tsx
const historySequence = rows.flatMap((row) =>
  row.isAvailable ? [row.slug] : [],
);
const historySequenceParam =
  historySequence.length > 0 ? historySequence.join(',') : undefined;
```

This collects **every available question on the current page** into one flat sequence — regardless of `sessionId`, `sessionMode`, or whether questions have any relationship to each other.

### 2. Every review link gets the full sequence

`app/(app)/app/history/components/history-questions-tab.tsx:502-508`:

```tsx
const href = toQuestionRoute(row.slug, {
  from: 'history',
  mode: 'review',
  historyHref,
  historySeq: historySequenceParam,    // ALL page questions
  historyIndex: historyIndexBySlug.get(row.slug),
});
```

There is no check for `row.sessionId`. Ad-hoc questions get the same `historySeq` as session questions.

### 3. Question page controller creates SessionNavigation from historySeq

`app/(app)/app/questions/[slug]/use-question-page-controller.ts:105-136`:

```tsx
useEffect(() => {
  const sessionId = input.sessionId;
  if (!sessionId) {
    const historySequence = input.historySequence ?? null;
    if (historySequence && historySequence.length > 0) {
      // ...builds SessionNavigation from the historySequence
      setSessionNavigation({
        questions: historySequence.map((slug, index) => ({
          slug,
          order: index + 1,
          isCorrect: null,  // no correctness info for historySeq questions
        })),
        currentIndex,
        from,
        historySequence,
      });
      return;
    }
    setSessionNavigation(null);  // only reached when historySeq is absent
    return;
  }
  // ...sessionId path (fetches real session data)
```

The controller has two paths:
- **`sessionId` present** → fetches actual session from API → correct navigator with real correctness data
- **`historySeq` present (no sessionId)** → builds fake session from URL param → navigator with `isCorrect: null` for all questions

The `historySeq` path was designed for the Questions tab but doesn't distinguish ad-hoc from session questions.

### 4. Navigator renders with neutral (outline) buttons

`app/(app)/app/questions/[slug]/components/review-question-navigator.tsx:46-81`:

Since `isCorrect` is `null` for all historySeq-sourced questions, every button renders with `variant="outline"` — no green/red color coding. This is visually distinct from a real session navigator (which has color-coded buttons), but it's still confusing because it implies the questions are related.

---

## Severity Assessment

**Severity: Medium-High**

- **User confusion:** The navigator implies the questions belong together, which is factually wrong for ad-hoc practice
- **Misleading "Question X of Y":** "Question 1 of 3" suggests a session with 3 questions, but no such session exists
- **Inconsistency:** The same question reviewed from the Dashboard shows no navigator, but from History it shows one — different UX for the same question
- **No data corruption:** This is purely a presentation/navigation bug. No data is affected.
- **Frequency:** Affects every user who reviews ad-hoc questions from the History Questions tab

---

## Proposed Fix (Sketch)

### Option A: Route by `sessionId` presence per row (Recommended)

In `history-questions-tab.tsx`, differentiate the review link based on whether the question has a `sessionId`:

```tsx
// For questions WITH a session → use sessionId (real navigator)
const href = row.sessionId
  ? toQuestionRoute(row.slug, {
      from: 'history',
      mode: 'review',
      sessionId: row.sessionId,
      historyHref,
    })
  // For ad-hoc questions → standalone review (no sequence)
  : toQuestionRoute(row.slug, {
      from: 'history',
      mode: 'review',
      historyHref,
    });
```

**Pros:**
- Session questions get the proper navigator (fetched from DB with real `isCorrect` values)
- Ad-hoc questions get standalone review (matching Dashboard behavior)
- Removes the `historySequence` computation entirely (lines 192-199 can be deleted)
- Clean separation: sessions tab handles session navigation, questions tab is a flat list

**Cons:**
- Loses the ability to navigate between questions on the Questions tab page — but this was semantically wrong anyway since the questions aren't related

### Option B: Filter `historySeq` to only include questions sharing the same `sessionId`

Keep the `historySeq` mechanism but only group questions that share a `sessionId`. Ad-hoc questions (no sessionId) would be excluded from any sequence.

**Pros:**
- Preserves navigation for session questions that appear on the same page
- More surgical change

**Cons:**
- Still produces a partial, client-side view of the session (only questions visible on the current page, not all session questions)
- The Sessions tab already provides the complete, correct session navigator via `sessionId`
- Adds complexity for no real user benefit

### Recommendation: **Option A**

The Questions tab is a flat, filterable list of ALL attempted questions. Its job is to let users find and review individual questions — not to replicate session navigation. The Sessions tab already handles session-based review correctly. Option A simplifies the code and gives users the correct mental model: "I'm reviewing one question from my history."

---

## Affected Files

| File | Change |
|------|--------|
| `app/(app)/app/history/components/history-questions-tab.tsx` | Remove `historySequence` computation (L192-199). Update review link to use `sessionId` for session questions, standalone for ad-hoc (L502-508). |
| `app/(app)/app/history/components/history-questions-tab.test.tsx` | Update test expectations for review link `href` values |

No changes needed to:
- `use-question-page-controller.ts` — the `historySeq` path can remain as a valid fallback for any future use
- `review-question-navigator.tsx` — unchanged, just won't receive historySeq-sourced data for ad-hoc questions
- `lib/routes.ts` — `toQuestionRoute` already supports both signatures

---

## Open Questions

1. **Should session questions on the Questions tab use `sessionId` or `historySeq`?** Option A uses `sessionId`, which means clicking review on a session question from the Questions tab would show the full session navigator (all session questions, not just those visible on the page). This is arguably correct — you're reviewing the session that question belongs to.

2. **Should we add an `attemptId` to the ad-hoc review link?** The Dashboard uses `attemptId` in its review links. The Questions tab currently doesn't have `attemptId` in its row data. Adding it would make the Dashboard and Questions tab review links identical for ad-hoc questions. Not strictly necessary — the question page works without `attemptId` — but worth considering for parity.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-25 | Created BS-034 | Manual UX walkthrough revealed ad-hoc questions incorrectly grouped into navigator |
