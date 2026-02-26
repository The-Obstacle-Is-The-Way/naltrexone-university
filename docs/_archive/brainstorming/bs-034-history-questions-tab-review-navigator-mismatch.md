# BS-034: History Questions Tab — Ad-Hoc Questions Incorrectly Grouped into Question Navigator

**Date:** 2026-02-25
**Archived:** 2026-02-26
**Outcome:** Fully resolved. Core bug fixed as BUG-152 (PR #141). All 4 open questions resolved. Position A (ad-hoc only) decided and implemented. Residual "Try Again" label bug tracked in BS-033 and fixed as BUG-153 (PR #143). Related UX inconsistencies (subtitle, back link) deferred to future polish.
**Triggered by:** Manual UX walkthrough. Clicking "Review" on any question from History → Questions tab renders a Question Navigator grouping all 20 visible page questions — despite them being independent, unrelated questions from different modes and topics.
**Scope:** The History Questions tab treats all visible questions as a single navigable sequence, conflating ad-hoc practice with session-based review. Affects ALL question types on this tab — ad-hoc, Tutor, and Exam questions alike lose their real session context.
**Related:** [SPEC-027](../specs/spec-027-session-review-navigation.md) (Session Review Navigation), [SPEC-022](../specs/spec-022-question-log.md) (Question Log)

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

Position A (decided) achieves this by scoping the Questions tab to ad-hoc only. Tutor/Exam questions are reviewed exclusively from the Sessions tab, which already handles them correctly.

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

"Review completed sessions and all attempted questions." → "Review completed sessions and your Quick Practice questions."

Use the product term "Quick Practice" — it matches the nav bar label and directly tells users which mode's questions live on this tab.

**5. Add empty state for the Questions tab**

With only ad-hoc questions on the tab, users who have only done Tutor/Exam sessions (no Quick Practice) will see an empty Questions tab. Add an empty state that explains where their questions live:

> *"No Quick Practice questions yet. Questions from Tutor and Exam sessions can be reviewed from the Sessions tab."*

This prevents confusion when the tab is empty and teaches the mental model (Sessions tab for session questions, Questions tab for standalone practice).

---

## Affected Files

| File | Change |
|------|--------|
| `app/(app)/app/history/page.tsx` | Hardcode `source: 'adhoc'` in the Questions-tab `getAttemptedQuestions` fetch while preserving other filters (`result`, `difficulty`, `tagSlug`, `sort`). |
| `app/(app)/app/history/components/history-questions-tab.tsx` | Remove `historySequence` computation (L192-199). Simplify review links (L502-508). Remove Source filter dropdown and related source-filter state plumbing. Add empty state copy for zero ad-hoc questions. |
| `app/(app)/app/history/components/history-questions-tab.test.tsx` | Update test expectations: review link `href` values no longer include `historySeq`/`historyIndex`. Remove or update Source filter tests. |
| `app/(app)/app/history/history-search-params.ts` | Optional cleanup: remove `source` from `QuestionsFilters` UI type, or keep parser/href support for backwards-compatible URLs while hiding source controls from UI. |
| `app/(app)/app/history/history-page-client.tsx` | Update subtitle text. |

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

### 3. "Try Again" label on correct standalone non-history answers

Dashboard and Bookmarks review show "Try Again" for correctly-answered questions. The History Questions review correctly shows "Practice Again" for correct and "Try Again" for incorrect. This is caused by history-only label gating in `question-page-client.tsx` (`isStandaloneHistoryReview`), not by correctness itself.

**Resolution:** Fixed as BUG-153 (PR #143). The `reattemptLabel` condition now keys on `submitResult?.isCorrect` across all standalone review contexts.

### 4. Direct URL context mismatch (minor edge case)

Manual agent-browser testing found a low-severity edge case for direct question URLs without query context (for example: `/app/questions/<slug>`):

- UI copy defaults to dashboard review framing ("Review a question from your recent activity." / "Back to Dashboard")
- Interaction mode is submit-mode (shows "Submit"), not review-mode

This is not reachable via normal in-app flows, but it is a real state/copy mismatch for malformed or manually-entered deep links.

---

## Open Questions

1. **~~Should session questions on the Questions tab use `sessionId` or `historySeq`?~~** **Superseded by Q4 decision.** With Position A, session questions won't appear on the Questions tab at all.

2. **~~Should we add an `attemptId` to the ad-hoc review link?~~** **Resolved: No (for the History Questions tab).** Each Questions-tab row already represents the latest attempt per question, and the question page can resolve that latest attempt without `attemptId`. `attemptId` is still meaningful for attempt-scoped entry points (e.g., Dashboard Recent Activity), where it preserves review of the specific attempt row clicked.

3. **~~Should the related UX inconsistencies (subtitle, back link, Try Again label) be addressed in the same fix or tracked separately?~~** **Resolved: Track separately.**
   - **Subtitle and back link position:** Minor cosmetic inconsistencies. Defer to a future polish pass or BS-033.
   - **"Try Again" label on correct Dashboard/Bookmarks answers:** Fixed as BUG-153 (PR #143).

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
   - The subtitle can be updated: "Review completed sessions and all attempted questions." → "Review completed sessions and your Quick Practice questions."
   - An empty state is needed for users with zero ad-hoc questions, pointing them to the Sessions tab

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-25 | Created BS-034 | Manual UX walkthrough revealed ad-hoc questions incorrectly grouped into navigator |
| 2026-02-25 | Chrome agent audit validates and expands scope | Confirmed bug at scale (20 buttons). Discovered Tutor/Exam questions also lose session context from Questions tab. Source filter does not suppress. Three related UX inconsistencies flagged. Severity upgraded from Medium-High to High. |
| 2026-02-25 | **Decided: Position A — Questions tab = ad-hoc only** | History should mirror Practice hierarchy: Sessions tab for Tutor/Exam, Questions tab for Quick Practice. Session questions lose context on the Questions tab (no color coding, wrong group). Clean separation is simpler to implement and gives users the correct mental model. Source filter becomes unnecessary. |
| 2026-02-25 | Added empty state requirement + subtitle copy refinement | Second Chrome agent audit confirmed Position A. Surfaced two gaps: (1) users with only session questions will see empty Questions tab — needs explicit empty state pointing to Sessions tab; (2) subtitle should use product term "Quick Practice" instead of "individual practice" to match nav bar terminology. |
| 2026-02-25 | Resolved all open questions (Q2, Q3) | Q2: No `attemptId` needed for History Questions-tab links because rows are already latest-per-question; `attemptId` remains valid for attempt-scoped entry points like Dashboard. Q3: Subtitle/back link deferred to polish pass. "Try Again" label bug on correct standalone non-history answers (Dashboard/Bookmarks) tracked for BS-033 as a concrete `reattemptLabel` condition fix. |
| 2026-02-25 | Code-truth correction pass applied | Corrected SPEC-027 link target, corrected file ownership of the `source: 'adhoc'` change (`history/page.tsx`, not `history-questions-tab.tsx`), and narrowed Q2 rationale to avoid incorrectly labeling all `attemptId` usage as vestigial. |
| 2026-02-26 | Agent-browser validation pass | Reconfirmed BS-034 navigator bug manually (including pagination-window behavior via `limit/offset`). Expanded related residual label-scope note from Dashboard-only to Dashboard+Bookmarks, and documented minor direct-URL context mismatch edge case. |
| 2026-02-26 | **Archived BS-034** | All findings resolved. Core bug fixed as BUG-152 (PR #141). Residual label bug fixed as BUG-153 (PR #143). All open questions answered. Position A decided and implemented. |
