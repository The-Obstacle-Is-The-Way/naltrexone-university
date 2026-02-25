# BS-034: History Questions Tab — Ad-Hoc Questions Incorrectly Grouped into Question Navigator

**Date:** 2026-02-25
**Triggered by:** Manual UX walkthrough. Clicking "Review" on any question from History → Questions tab renders a Question Navigator grouping all 20 visible page questions — despite them being independent, unrelated questions from different modes and topics.
**Scope:** The History Questions tab treats all visible questions as a single navigable sequence, conflating ad-hoc practice with session-based review. Affects ALL question types on this tab — ad-hoc, Tutor, and Exam questions alike lose their real session context.
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

1. User has 49 attempted questions (mix of ad-hoc, Tutor, and Exam sources)
2. User navigates to **History → Questions** tab — sees "Showing 1–20 of 49"
3. User clicks "Review" on any question
4. **Result:** Question page shows "Question navigator" with **20 buttons** — matching the page limit, not a session — and label "Question 1 of 20"
5. User can navigate between completely unrelated questions (e.g., Topiramate pharmacology → Motivational Interviewing) using the navigator
6. All navigator buttons are gray/neutral — no green/red color coding despite the user having answered these questions

### Two dimensions of the bug

**Dimension 1 — Ad-hoc questions get a fake session:** Independent questions answered one at a time are grouped into a navigable sequence. The navigator implies they belong together. They don't.

**Dimension 2 — Tutor/Exam questions lose their real session context:** When a Tutor or Exam question is reviewed from the Questions tab (even when filtered by Source: Tutor), it gets `historySeq` instead of `sessionId`. This means:
- The navigator shows the **page's 20 questions** instead of the **actual session's questions**
- No color coding (real session review has green/red/gray buttons)
- The session relationship is completely severed

The Source filter dropdown does not suppress the bug — filtering to "Ad-hoc practice", "Tutor", or "Exam" still builds `historySeq` from the current page window.

### Expected behavior

- **Ad-hoc questions:** Standalone review (no navigator), identical to Dashboard review behavior
- **Tutor/Exam questions:** Review with `sessionId`, showing the real session's questions with color-coded navigator — identical to Sessions tab review behavior

### Contrast with working entry points (Chrome agent validated)

| Entry point | URL params | Navigator? | Buttons | Color-coded? | Correct? |
|-------------|-----------|-----------|---------|-------------|----------|
| **Dashboard → Recent Activity** | `from=dashboard&mode=review&attemptId=...` | No | — | — | Yes |
| **Quick Practice → inline** | N/A (inline feedback) | No | — | — | Yes |
| **History → Sessions → Review** | `from=history&mode=review&sessionId=...` | Yes | Session size (5 or 20) | Yes (green/red/gray) | Yes |
| **History → Questions → Review (ad-hoc)** | `from=history&historySeq=q1,...,q20&historyIndex=0` | Yes | 20 (page limit) | No (all gray) | **No** |
| **History → Questions → Review (Tutor filtered)** | `from=history&historySeq=q1,...,q20&historyIndex=0` | Yes | 20 (page limit) | No (all gray) | **No** |

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

**Severity: High**

- **User confusion:** The navigator implies 20 questions belong together, but they are from different topics, sessions, and modes
- **Misleading "Question X of Y":** "Question 1 of 20" suggests a 20-question session, but no such session exists — the number is just the pagination page size
- **Cross-topic navigation:** Clicking navigator buttons jumps between completely unrelated subjects (e.g., Topiramate pharmacology → Motivational Interviewing), which is disorienting
- **Session context destroyed:** Tutor/Exam questions lose their real session relationship when reviewed from this tab — no color coding, wrong question group, no way to identify which session the question belongs to
- **Source filter doesn't help:** Users can't work around the bug by filtering to a specific source type
- **Inconsistency:** The same question reviewed from the Dashboard shows no navigator, but from History it shows one. The same Tutor question reviewed from Sessions tab shows the correct session, but from Questions tab shows 20 arbitrary questions
- **No data corruption:** Purely a presentation/navigation bug. No data is affected.
- **Frequency:** Affects every user who reviews any question from the History Questions tab (the primary review entry point)

---

## Proposed Fix (Decided: Position A — Ad-Hoc Only)

With Open Question 4 resolved, the fix is to scope the Questions tab to ad-hoc questions only. This addresses both bugs simultaneously: the navigator bug (no `historySeq` needed) and the session context loss (session questions don't appear here).

### Changes Required

**1. Filter query to ad-hoc only**

The `GetAttemptedQuestions` use case already supports a `source` filter. Hardcode `source: 'adhoc'` when fetching for the Questions tab, so Tutor/Exam questions are excluded at the query level.

**2. Remove `historySequence` computation and `historySeq` from review links**

`history-questions-tab.tsx:192-199` — delete the `historySequence`, `historySequenceParam`, and `historyIndexBySlug` computation entirely.

`history-questions-tab.tsx:502-508` — simplify review links to standalone:

```tsx
const href = toQuestionRoute(row.slug, {
  from: 'history',
  mode: 'review',
  historyHref,
});
```

No `historySeq`, no `historyIndex`, no `sessionId`. Every question on the tab is ad-hoc, so every review is standalone.

**3. Remove the Source filter dropdown**

With only ad-hoc questions on the tab, the Source filter (All / Tutor / Exam / Ad-hoc practice) is unnecessary. Remove it from the UI. The remaining filters (Result, Difficulty, Tag, Sort) are still useful.

**4. Update subtitle**

"Review completed sessions and all attempted questions." → "Review completed sessions and individual practice questions."

---

## Affected Files

| File | Change |
|------|--------|
| `app/(app)/app/history/components/history-questions-tab.tsx` | Hardcode `source: 'adhoc'` in query. Remove `historySequence` computation (L192-199). Simplify review links (L502-508). Remove Source filter dropdown. |
| `app/(app)/app/history/components/history-questions-tab.test.tsx` | Update test expectations: review link `href` values no longer include `historySeq`/`historyIndex`. Remove or update Source filter tests. |
| `app/(app)/app/history/history-search-params.ts` | Remove `source` from `QuestionsFilters` type (or keep for API but remove from UI). |
| `app/(app)/app/history/page.tsx` (or parent) | Update subtitle text. |

No changes needed to:
- `use-question-page-controller.ts` — the `historySeq` path can remain as a dead-code fallback for any future use
- `review-question-navigator.tsx` — unchanged, just won't be triggered from the Questions tab
- `lib/routes.ts` — `toQuestionRoute` already supports the simplified signature
- `src/application/use-cases/get-attempted-questions.ts` — already supports `source` filter, just needs to be called with `'adhoc'`

---

## Related UX Inconsistencies (Chrome Agent Findings)

The Chrome agent audit also flagged three entry-point inconsistencies. These are not part of the core navigator bug but are worth noting for any broader review-page unification work:

### 1. Subtitle text doesn't differentiate review context

| Entry point | Subtitle |
|---|---|
| Dashboard | "Review a question from your recent activity." |
| History → Questions | "Reviewing a question from your history." |
| History → Sessions | "Reviewing a question from your history." |

The History subtitle is identical whether you're reviewing a standalone question or a session question. The Dashboard has a more specific subtitle. Minor — could be improved for clarity.

### 2. Back link position inconsistency

| Entry point | Back link location |
|---|---|
| Dashboard | **Top-right header** ("Back to Dashboard") |
| History | **Bottom action bar** ("Back to History") |

Different layout patterns for the same conceptual navigation. Not blocking, but worth unifying.

### 3. "Try Again" label on correct Dashboard answers

The Dashboard review shows "Try Again" for a correctly-answered question. The History Questions review correctly shows "Practice Again" for correct and "Try Again" for incorrect. The Dashboard path appears to not check the result state when choosing the button label.

---

## Open Questions

1. **~~Should session questions on the Questions tab use `sessionId` or `historySeq`?~~** **Superseded by Q4 decision.** With Position A, session questions won't appear on the Questions tab at all.

2. **Should we add an `attemptId` to the ad-hoc review link?** The Dashboard uses `attemptId` in its review links. The Questions tab currently doesn't have `attemptId` in its row data. Adding it would make the Dashboard and Questions tab review links identical for ad-hoc questions. Not strictly necessary — the question page works without `attemptId` — but worth considering for parity.

3. **Should the related UX inconsistencies (subtitle, back link, Try Again label) be addressed in the same fix or tracked separately?** They are independent of the navigator bug and could be deferred to BS-033 (which already tracks feedback UX issues) or a separate pass.

4. **~~Should the Questions tab scope be narrowed to ad-hoc questions only?~~** **Resolved: Position A — ad-hoc only.**

   The app's practice modes have a clear hierarchy:
   - **Practice → Sessions** (Tutor / Exam) — batched, session-scoped, reviewed with navigator
   - **Quick Practice** — individual, ad-hoc, reviewed standalone

   History should mirror that same hierarchy:
   - **History → Sessions tab** — review Tutor/Exam sessions (with session navigator, color-coded buttons, breakdown)
   - **History → Questions tab** — review Quick Practice ad-hoc questions (standalone, no navigator)

   **Why Position A wins:**
   - Session questions ripped out of their session lose context (no color coding, wrong question group, no session score)
   - The Questions tab can't meaningfully represent session relationships — it's a flat list
   - The Source filter (Tutor/Exam/Ad-hoc) becomes unnecessary when only one source exists
   - Simpler implementation — no mixed review link patterns, no `historySeq` at all

   **Implementation implications:**
   - Filter the `GetAttemptedQuestions` query to exclude questions with a `sessionId` (i.e., `source: 'adhoc'` hardcoded or equivalent)
   - Remove the Source filter dropdown from the Questions tab UI
   - Remove the `historySequence` computation and `historySeq`/`historyIndex` from review links
   - Ad-hoc review links become standalone: `toQuestionRoute(slug, { from: 'history', mode: 'review', historyHref })`
   - The subtitle can be updated: "Review completed sessions and all attempted questions." → "Review completed sessions and individual practice questions."

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-25 | Created BS-034 | Manual UX walkthrough revealed ad-hoc questions incorrectly grouped into navigator |
| 2026-02-25 | Chrome agent audit validates and expands scope | Confirmed bug at scale (20 buttons). Discovered Tutor/Exam questions also lose session context from Questions tab. Source filter does not suppress. Three related UX inconsistencies flagged. Severity upgraded from Medium-High to High. |
| 2026-02-25 | **Decided: Position A — Questions tab = ad-hoc only** | History should mirror Practice hierarchy: Sessions tab for Tutor/Exam, Questions tab for Quick Practice. Session questions lose context on the Questions tab (no color coding, wrong group). Clean separation is simpler to implement and gives users the correct mental model. Source filter becomes unnecessary. |
