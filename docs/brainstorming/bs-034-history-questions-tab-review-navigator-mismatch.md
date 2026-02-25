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

1. **~~Should session questions on the Questions tab use `sessionId` or `historySeq`?~~** **Resolved:** Chrome agent confirmed Tutor/Exam questions from the Questions tab get `historySeq` instead of `sessionId`, losing all session context. Option A (`sessionId`) is now definitively the correct choice — it restores the real session relationship with color-coded buttons.

2. **Should we add an `attemptId` to the ad-hoc review link?** The Dashboard uses `attemptId` in its review links. The Questions tab currently doesn't have `attemptId` in its row data. Adding it would make the Dashboard and Questions tab review links identical for ad-hoc questions. Not strictly necessary — the question page works without `attemptId` — but worth considering for parity.

3. **Should the related UX inconsistencies (subtitle, back link, Try Again label) be addressed in the same fix or tracked separately?** They are independent of the navigator bug and could be deferred to BS-033 (which already tracks feedback UX issues) or a separate pass.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-25 | Created BS-034 | Manual UX walkthrough revealed ad-hoc questions incorrectly grouped into navigator |
| 2026-02-25 | Chrome agent audit validates and expands scope | Confirmed bug at scale (20 buttons). Discovered Tutor/Exam questions also lose session context from Questions tab. Source filter does not suppress. Three related UX inconsistencies flagged. Severity upgraded from Medium-High to High. Open question 1 resolved in favor of Option A. |
