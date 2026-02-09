# Active Session View Layout Audit

**Date:** 2026-02-09
**Scope:** The practice session page at `/app/practice/[sessionId]` — what users see while actively answering questions in tutor or exam mode.
**Triggered by:** Visual review showing vestigial Quick Practice copy and scattered button layout in exam mode.

---

## Current State (Screenshot Analysis)

This is what a user sees on question 6 of a 20-question exam session:

```
┌─────────────────────────────────────────────────────────────────┐
│ Question navigator                                              │
│ [1] [2] [3] [4] [5] [●6] [7] [8] [9] [10]                    │
│ [11] [12] [13] [14] [15] [16] [17] [18] [19] [20]             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Practice                            Review answers              │
│ Answer one question at a time.      Back to Dashboard           │
│ Session: exam • 6/20                                            │
│                                                                 │
│                                     Mark for review             │
│                                     Bookmark                    │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ An addiction treatment program is designing a SAMHSA-funded │ │
│ │ contingency management intervention...                      │ │
│ │ Which of the following best describes...                    │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ A  [choice text]                                            │ │
│ │ B  [choice text]                                            │ │
│ │ C  [choice text]                                            │ │
│ │ D  [choice text]                                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [Submit]  Next Question                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Identified Problems

### Problem A: "Practice" / "Answer one question at a time" — Wrong Copy for Exam Mode

**File:** `app/(app)/app/practice/components/practice-view.tsx` (lines 78-79)

The heading says "Practice" and the subtitle says "Answer one question at a time." This is the default copy when no `title` or `description` props are provided. The parent component (`practice-session-page-view.tsx`) does NOT pass session-mode-aware title/description to `PracticeView`.

**What it should say:**
- **Tutor mode:** "Tutor Session" / "Explanations shown after each answer."
- **Exam mode:** "Exam Session" / "Explanations shown after you end the session."

The session mode is available in `sessionInfo.mode` and is already rendered in the small "Session: exam • 6/20" line — it just doesn't flow up to the heading.

### Problem B: Three-Zone Button Layout Is Disorienting

Actions are scattered across three vertical zones:

| Zone | Position | Buttons | Issue |
|------|----------|---------|-------|
| **Header right** | Top-right, beside title | "Review answers" / "End session", "Back to Dashboard" | Fine for navigation, but two exit actions side-by-side is confusing |
| **Above question** | Right-aligned, between header and question card | "Mark for review", "Bookmark" | Disconnected from the question they apply to |
| **Below question** | Bottom-left | "Submit", "Next Question" | Standard, no issue |

The "Mark for review" and "Bookmark" buttons floating above the question feel orphaned. They're question-level actions but are visually separate from both the question card and the Submit/Next buttons.

**Recommendation:** Move "Mark for review" and "Bookmark" to sit alongside or below "Submit" / "Next Question". All question-level actions should be in one zone.

### Problem C: "Review answers" vs "Back to Dashboard" — Redundant Exit Paths

In exam mode, the header shows:
- **"Review answers"** button → navigates to exam review view (question list pre-submit)
- **"Back to Dashboard"** link → navigates away entirely

Both are always visible. The user doesn't know which to click. In tutor mode, "Review answers" becomes "End session", and "Back to Dashboard" stays — same confusion.

**Recommendation:**
- In **exam mode**: Show "Review answers" prominently. Hide or de-emphasize "Back to Dashboard" (it's an escape hatch, not a primary action). Or replace "Back to Dashboard" with "End session" (which would show the summary) and keep "Review answers" for the pre-submit review.
- In **tutor mode**: Show "End session" as the primary action. "Back to Dashboard" is fine as a secondary link.

### Problem D: "Session: exam • 6/20" Is Tiny and Low-Contrast

**File:** `app/(app)/app/practice/components/practice-view.tsx` (lines 124-130)

This line uses `text-xs text-muted-foreground` — it's the smallest, lightest text on the page. For a session where progress tracking matters (especially a 20-question exam), the current question number should be more prominent.

**Recommendation:** The question navigator grid at the top already shows position. The text line could be slightly larger (`text-sm`) or incorporated into the heading area more naturally: "Exam Session — Question 6 of 20".

### Problem E: Question Navigator Could Be More Informative

**File:** `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` (lines 19-74)

The navigator grid shows numbered buttons. The current question is highlighted. Marked-for-review questions get a pink dot. But there's no color distinction between answered and unanswered questions in the grid — you can only see the current one.

**Recommendation (future):** Consider subtle visual treatment for answered vs unanswered in the navigator grid (e.g., filled background for answered, outline for unanswered). This is a lower-priority polish item.

---

## Root Cause Analysis

The `PracticeView` component was originally built as a generic question-answering view shared between Quick Practice and session-based practice. Its defaults ("Practice", "Answer one question at a time") make sense for Quick Practice but are wrong for sessions.

The session page (`practice-session-page-view.tsx`) adds session-specific UI around `PracticeView` (navigator, review, summary) but doesn't override the title/description props. This is the vestigial pattern — the container evolved, but the inner view still has Quick Practice defaults.

**Technical note:** `PracticeView` already accepts `title` and `description` props (lines 78-79). The fix is purely about passing the right values from the session page.

---

## Severity Assessment

| Problem | Severity | Effort | Status |
|---------|----------|--------|--------|
| A. Wrong copy for session mode | **High** — misleading text | Small — pass props | **DONE** |
| B. Scattered button zones | **Medium** — confusing layout | Medium — restructure JSX | **DONE** |
| C. Redundant exit paths | **Medium** — decision paralysis | Small — conditional rendering | **DONE** |
| D. Tiny session progress text | **Low** — cosmetic | Small — CSS change | **DONE** (solved by A) |
| E. Navigator answered/unanswered | **Low** — nice-to-have | Medium — state tracking | **DONE** |

All problems resolved.

---

## Implementation Summary

**Phase 1 (A+D):** `PracticeSessionPageView` now passes mode-aware `title` ("Tutor Session" / "Exam Session") and `description` ("Question X of Y — Explanations shown after...") to `PracticeView`. The separate tiny `Session: exam • 6/20` progress line was removed.

**Phase 2 (B+C):** Mark for Review and Bookmark buttons moved from floating zone above question to bottom action bar alongside Submit/Next Question. "Back to Dashboard" link hidden when session is active (only "End session" / "Review answers" shows).

**Phase 3 (E):** Navigator buttons use `secondary` variant for answered questions, `outline` for unanswered, `default` for current question.

---

## Files Involved

| File | What it does |
|------|-------------|
| `app/(app)/app/practice/components/practice-view.tsx` | The generic question view — has the vestigial defaults |
| `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` | The session wrapper — should pass mode-aware props to PracticeView |
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` | Pre-submit review — has the QuestionNavigator inline |

---

## Relationship to Other Work

- **NOT blocked by** `practice-recent-sessions-v2.md` — these are separate components
- **NOT blocked by** `review-consistency-audit.md` — different pages entirely
- **Shares `PracticeView`** with Quick Practice — any changes to that component must not break `/app/practice/quick`. The `title`/`description` props already support this (Quick Practice can pass its own values or keep defaults).
- **Could be done in parallel** with the Recent Sessions panel fixes
