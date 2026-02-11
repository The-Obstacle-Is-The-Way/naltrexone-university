# Quick Practice History Gap — Brainstorming

**Date:** 2026-02-10
**Triggered by:** Visual review of Dashboard, Practice, and History pages after SPEC-021
**Scope:** Correctly-answered Quick Practice (ad-hoc) questions are invisible in the entire review flow

---

## The Problem

The app has three practice modes:

| Mode | Creates Session? | Visible in History Sessions? | Visible in Missed Questions? |
|------|-----------------|------------------------------|------------------------------|
| **Tutor** (session-based) | Yes | Yes — full row with score, duration, breakdown | Yes — if most recent attempt is incorrect |
| **Exam** (session-based) | Yes | Yes — full row with score, duration, breakdown | Yes — if most recent attempt is incorrect |
| **Quick Practice** (ad-hoc) | No (`practiceSessionId: null`) | **No** | **Only if missed** |

**The gap:** Quick Practice questions answered correctly vanish from the UI entirely. The data exists in the `attempts` table (`practiceSessionId: null, isCorrect: true`), but no page surfaces it.

**User impact:** A user answers 50 Quick Practice questions, gets 45 right. Those 45 correct answers have no home — they can't be found, reviewed, or tracked anywhere. Only the 5 missed ones appear in History > Missed Questions (labeled "Ad-hoc practice").

**Why this matters for our users:** A physician studying for addiction medicine boards isn't casually quizzing themselves — they're doing deliberate practice under time pressure. Quick Practice is the "I have 5 minutes between patients" mode. The fact that correctly-answered questions evaporate creates a trust problem: the aggregate Dashboard stats count them, but the user can't reconcile which questions produced those numbers. Board prep users also want to verify mastery — "I answered that zaleplon question correctly two weeks ago, let me re-read the explanation." Right now they can't unless they bookmarked it in the moment.

---

## Current Data Model

```
attempts table:
  id, userId, questionId, practiceSessionId (nullable), selectedChoiceId, isCorrect, timeSpentSeconds, answeredAt

Quick Practice: practiceSessionId = NULL
Session-based:  practiceSessionId = UUID → links to practice_sessions table
```

- The `attempts` table already stores EVERY ad-hoc attempt (correct + incorrect)
- **Important nuance:** `practiceSessionId = NULL` is an **"ad-hoc practice" bucket**, not a Quick Practice-only marker. It also includes attempts made on the question detail page (e.g., reattempting from History/Bookmarks). v1 should label this as **"Ad-hoc practice"** and treat it as "Quick Practice + reattempts".
- `listMissedQuestionsByUserId` uses `row_number() OVER (PARTITION BY questionId ORDER BY answeredAt DESC)` to get the latest attempt per question, then filters `isCorrect = false`
- No equivalent query exists for all attempted questions regardless of correctness
- Dashboard stats (`countByUserId`, `countCorrectByUserId`) already include ad-hoc attempts — no `practiceSessionId` filter

---

## Current UI Surfaces

### Dashboard
- **Recent sessions** — Tutor/Exam sessions only (queries `practice_sessions`)
- **Recent missed** — Missed questions from ALL modes (queries `attempts` where latest is incorrect)
- **Stats cards** — Include ALL attempts including ad-hoc (Total answered, Overall accuracy, 7-day metrics)

### History Page
- **Sessions tab** — All completed Tutor/Exam sessions with pagination
- **Missed Questions tab** — All missed questions with client-side difficulty/tag filters + "Reattempt" button

### Quick Practice Page
- Shows one question at a time, no history, no log of previous attempts

---

## Browser Audit (Verified 2026-02-11)

**Environment:** Vercel preview `https://naltrexone-university-bx5q8fw7w-john-h-jungs-projects.vercel.app` (from `vercel ls`)  
**Screenshots (gitignored):** `audit-screenshots/spec-022-audit-2026-02-11T02-19-13-316Z/`

### 1) `/app/history?tab=missed` (current "Missed Questions" tab)

- **Tabs:** `Sessions`, `Missed Questions`
- **Filters:** `Difficulty` `<select name="difficulty">`, `Tag` `<select name="tag">`, `Apply` button, `Clear filters` link
- **Row layout:**
  - Title is a link to `/app/questions/[slug]?from=history`
  - Metadata line includes: `{Difficulty} • Missed {date} • {source}`, where `{source}` is `"Tutor session" | "Exam session" | "Ad-hoc practice"`
  - Action button: `Reattempt` (link with `aria-label="Reattempt question: …"`)

Screenshots:
- `01-history-missed.png`
- `08-history-missed-after-quick-practice.png`

### 2) `/app/history?tab=sessions` (sessions expand/collapse)

- Each session row has a `View breakdown` button that toggles to `Hide breakdown`.
- Breakdown renders inline under the session row.

Screenshots:
- `02-history-sessions.png`
- `03-history-sessions-expanded.png`

### 3) `/app/dashboard` (current behavior relevant to the gap)

- Sections: `Recent sessions` and `Recent missed`
- Both have `View all` links:
  - `/app/history?tab=sessions`
  - `/app/history?tab=missed`
- **Stats cards count ad-hoc attempts** (Quick Practice + question-detail reattempts). Verified by the Quick Practice flow below.

Screenshots:
- `04-dashboard.png`
- `07-dashboard-after-quick-practice.png`

### 4) `/app/practice/quick` (Quick Practice, answered correctly)

- Answered a question correctly in Quick Practice.
- Dashboard `Total answered` increased (example observed: `81 → 82`).
- The correctly answered Quick Practice question did **not** appear on `/app/history?tab=missed` (expected: this tab shows only missed).
- The Dashboard `Recent missed` list did not surface this correct attempt.

Screenshots:
- `05-quick-practice-start.png`
- `06-quick-practice-correct.png`

### 5) Question detail via History Reattempt (attempt becomes ad-hoc)

- Clicking `Reattempt` from History navigates to `/app/questions/[slug]?from=history` with subtitle `"Reviewing a question from your history."`
- After answering incorrectly and returning to History, at least one row was labeled **"Ad-hoc practice"**, confirming the attempt was stored with `practiceSessionId = null`.

Screenshots:
- `09-question-detail-from-history.png`
- `10-question-detail-incorrect.png`
- `11-history-missed-after-reattempt.png`

### 6) Difficulty + Tag filters + pagination param preservation

- Applying filters updates the URL (example):
  - `/app/history?tab=missed&limit=20&offset=0&difficulty=medium&tag=alcohol`
- The page shows `Showing 1–20 of 31`.
- The `Next` link exists and preserves filters in its `href` (example):
  - `/app/history?tab=missed&offset=20&limit=20&difficulty=medium&tag=alcohol`

Screenshots:
- `12-history-missed-filtered.png`
- `13-history-missed-filtered-next.png`

---

## Options Evaluated

### Option A: Add "Quick Practice" tab to History (3rd tab)
**Rejected.** Fragments attention across more surfaces. Duplicates missed ad-hoc questions that already appear in the second tab. A third tab adds nav complexity without proportional value.

### Option B: Evolve "Missed Questions" into a filterable "Questions" tab
**Recommended.** See detailed spec below.

### Option C: Add "Recent Quick Practice" card to Dashboard
**Rejected as standalone.** Doesn't solve the History page gap by itself. Fragments the Dashboard with a third card when the existing two are sufficient.

### Option D: Combine approaches
**Rejected.** Over-engineering. One well-designed surface beats three partial ones.

### Option E: Do nothing
**Rejected.** Quick Practice is the highest-frequency use case (5 minutes between patients), and its correctly-answered questions contributing to stats but being unreviewable erodes platform trust. Every competitive reference (UWorld, AMBOSS, Anki) provides a complete question ledger.

---

## Recommended Approach: Option B

### Summary

Evolve History's "Missed Questions" tab into a complete, filterable record of every question ever attempted. The current "Missed Questions" view becomes one filter preset of this more powerful surface. Also rename Dashboard's "Recent missed" → "Recent activity" to surface all modes.

### History Page Changes

**Tab rename:** "Missed Questions" → "Questions"

**New filters (added to existing Difficulty + Tag filters):**

| Filter | Values | Default |
|--------|--------|---------|
| Result | All / Correct / Incorrect | All |
| Source | All / Tutor / Exam / Ad-hoc practice | All |
| Difficulty | All difficulties / Easy / Medium / Hard | All (existing) |
| Tag | All tags / [specific tags] | All (existing) |

**Filter application:** Apply **Result + Source server-side** (pagination-aware). Keep Difficulty + Tag as **page-local client-side** filtering in v1 (matching the existing History missed-tab UX from SPEC-021).

**Row layout (per question, most recent attempt):**

| Field | Source | Notes |
|-------|--------|-------|
| Question stem preview | `stemMd` truncated | Already exists |
| Result badge | `isCorrect` | **NEW** — "Correct" (green) / "Incorrect" (red) |
| Difficulty badge | `difficulty` | Already exists |
| Source label | `sessionId` + `sessionMode` | Already exists — "Tutor session" / "Exam session" / "Ad-hoc practice" (Quick Practice + reattempts) |
| Date | `answeredAt` | Already exists |
| Action button | — | "Reattempt" for incorrect, "Review" for correct (links to `/app/questions/[slug]`) |

**Pagination:** Unchanged. Server-side limit/offset.

### Dashboard Changes

**Rename:** "Recent missed" → "Recent activity"

**Content:** Last 3 questions attempted across ALL modes (correct + incorrect), each with a small correct/incorrect indicator badge.

**"View all" link:** Points to History > Questions tab (no filters applied = shows everything).

### What We're NOT Doing

- No third History tab
- No separate Quick Practice history page
- No additional Dashboard card
- No "Unanswered" filter (question bank progress tracking is a separate future feature)
- No server-side filtering for difficulty/tag in v1 (keep the existing client-side pattern on the paginated set; can migrate later if needed)
- No new "attempt origin" column in v1 (we cannot precisely isolate Quick Practice from other ad-hoc attempts without a schema change)

---

## Backend Feasibility (Verified)

### Repository Layer (Low effort)

The existing `listMissedQuestionsByUserId` query in `drizzle-attempt-repository.ts` already does the hard work:
- Window function `row_number() OVER (PARTITION BY questionId ORDER BY answeredAt DESC)` gets latest attempt per question
- Joins to `practice_sessions` for `sessionMode`
- Applies pagination with `limit`/`offset`

**Change required:** Remove the `eq(latestAttemptRows.isCorrect, false)` WHERE clause. Add `isCorrect` to the returned columns. Rename method to `listAttemptedQuestionsByUserId`.

### Type Chain (Low effort)

```
MissedQuestionAttempt → rename to AttemptedQuestionSummary
  + add: isCorrect: boolean
  (rest unchanged: questionId, answeredAt, sessionId, sessionMode)
```

All downstream types (`GetMissedQuestionsOutput` rows, controller output, component props) gain the `isCorrect` field. Structural shape unchanged.

### Use Case Layer (Low effort)

Create a new `GetAttemptedQuestionsUseCase` (alongside the existing missed-only one) that:
- lists **latest attempt per question** regardless of correctness
- supports server-side filters for **result** (correct/incorrect) and **source** (tutor/exam/ad-hoc)

The enrichment pipeline (fetch attempts → fetch questions → join) works identically regardless of correctness filter.

### Count Query (Low effort)

`countMissedQuestionsByUserId` → `countAttemptedQuestionsByUserId`. Remove `isCorrect = false` filter.

### Dashboard "Recent Activity" (Medium effort)

No new query needed:
- `AttemptStatsReader.listRecentByUserId(userId, limit)` already exists
- `GetUserStatsUseCase` already returns `recentActivity` (attempt-level recency across all modes)

Dashboard can render `stats.recentActivity.slice(0, N)` with correct/incorrect indicators and a "View all" link to History > Questions.

### Test Impact (Medium effort)

- New unit tests for "all attempted" scenario + result/source filtering (`get-attempted-questions.test.ts`)
- `history/page.test.tsx` needs tab name updates
- Dashboard tests need "Recent activity" updates

---

## Open Questions for Spec Phase

1. **Default filter state:** Should the Questions tab default to "All" (complete picture, new behavior) or "Incorrect" (preserves current Missed Questions behavior for existing users)? Recommendation: default to "All" — this is the whole point of the change.

2. **Filter application:** Implement **server-side filtering for Result + Source** (pagination-aware). Keep Difficulty + Tag as **client-side** (page-local) in v1 (matches existing Missed tab behavior).

3. **"Review" action for correct questions:** Links to `/app/questions/[slug]` (question detail page). Note: explanation is only shown after submitting an answer (current behavior).

4. **Migration path for old URLs:** Preserve `?tab=missed` as an alias for `?tab=questions&result=incorrect` so old links and the `/app/review` redirect chain keep working.

5. **Empty state copy:** Current empty state says "No missed questions yet." Needs updating for the broader scope — "No questions attempted yet. Start practicing to build your history."

---

## Competitive Reference

| App | Approach | Notes |
|-----|----------|-------|
| **UWorld** | Full question performance log, filterable by subject, correctness, used/unused | Complete ledger, no black holes |
| **AMBOSS** | Session history as complete ledger | Every attempt visible |
| **Anki** | Browse mode shows every card with full review history | Per-card history, not just failures |
| **Duolingo** | Progress tree with mastery indicators per skill | Different model but no hidden work |

All competitive references provide complete visibility into practice activity. None have a mode where correctly-answered questions disappear.

---

## Status: SPECCED — Option B selected → SPEC-022 (Question Log)
