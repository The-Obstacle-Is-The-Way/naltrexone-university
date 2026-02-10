# Quick Practice History Gap — Brainstorming

**Date:** 2026-02-10
**Triggered by:** Visual review of Dashboard, Practice, and History pages after SPEC-021
**Scope:** The gap where correctly-answered Quick Practice (ad-hoc) questions are invisible in the entire review flow

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

---

## Current Data Model

```
attempts table:
  id, userId, questionId, practiceSessionId (nullable), selectedChoiceId, isCorrect, timeSpentSeconds, answeredAt

Quick Practice: practiceSessionId = NULL
Session-based:  practiceSessionId = UUID → links to practice_sessions table
```

- The `attempts` table already stores EVERY ad-hoc attempt (correct + incorrect)
- `listMissedQuestionsByUserId` filters to `isCorrect = false` on the most recent attempt per question
- No equivalent query exists for correct ad-hoc attempts or all ad-hoc attempts

---

## Current UI Surfaces

### Dashboard
- **Recent sessions** — Tutor/Exam sessions only (queries `practice_sessions`)
- **Recent missed** — Missed questions from ALL modes (queries `attempts` where latest is incorrect)

### History Page
- **Sessions tab** — All completed Tutor/Exam sessions with pagination
- **Missed Questions tab** — All missed questions with difficulty/tag filters + "Reattempt" button

### Quick Practice Page
- Shows one question at a time, no history, no log of previous attempts

---

## Design Options

### Option A: Add "Quick Practice" tab to History (3rd tab)

```
History
  [Sessions] [Missed Questions] [Quick Practice]
```

- Shows all ad-hoc attempts (correct + incorrect) sorted by `answeredAt DESC`
- Each row: question stem preview, difficulty, correct/incorrect badge, date
- "Reattempt" button for incorrect, "Review" link for correct
- Pagination like the other tabs
- Filters: difficulty, tag, correct/incorrect

**Pros:** Clean separation of concerns. Users who want to review their Quick Practice activity have a dedicated place.
**Cons:** Third tab adds nav complexity. Duplicates missed questions that already appear in "Missed Questions" tab.

### Option B: Expand "Missed Questions" to "Question Log" with filters

```
History
  [Sessions] [Question Log]
```

- Rename "Missed Questions" → "Question Log"
- Add status filter: All / Correct / Incorrect
- Add source filter: All / Session / Quick Practice
- Default view: Incorrect only (preserves current behavior)

**Pros:** No new tab. More powerful. Users discover correct ad-hoc history naturally by changing filter.
**Cons:** "Question Log" is less descriptive than "Missed Questions" for the primary use case. Changing defaults could confuse existing users.

### Option C: Add "Recent Quick Practice" card to Dashboard

```
Dashboard
  [Stats cards]
  [Recent sessions]  [Recent missed]
  [Recent Quick Practice]   ← NEW
```

- Shows last N Quick Practice attempts (correct + incorrect)
- "View all" links to History with appropriate filter

**Pros:** Makes Quick Practice activity visible at a glance. Consistent with existing dashboard pattern.
**Cons:** Doesn't solve the History page gap by itself — still need somewhere for the full list.

### Option D: Combine A + C (Recommended for evaluation)

- Add 3rd tab "Quick Practice" to History for the full log
- Add "Recent Quick Practice" card to Dashboard for at-a-glance
- "View all" on Dashboard card links to History > Quick Practice tab

**Pros:** Complete coverage. Consistent with Sessions pattern (Dashboard summary + History full list).
**Cons:** Most work. Need to evaluate if the additional surface area is worth it.

### Option E: Do nothing (accept the gap)

- Quick Practice is designed as ephemeral "drill and forget" — no review needed
- Users who want trackable progress should use Tutor/Exam sessions
- The missed questions already surface ad-hoc failures for reattempt

**Pros:** Zero effort. Keeps the UI simple.
**Cons:** Users lose visibility into correct ad-hoc work. Conflicts with "track your progress" value prop.

---

## Questions to Resolve

1. **Is Quick Practice intended to be ephemeral?** If so, Option E is valid. If users expect to track all practice activity, Options A-D are needed.
2. **Would a "Question Log" (Option B) confuse the "Missed Questions" mental model?** The current tab name is immediately clear — renaming it could hurt discoverability.
3. **How many ad-hoc attempts exist relative to session attempts?** If Quick Practice is rarely used, the gap is low-impact.
4. **Should the Dashboard show Quick Practice stats in the aggregate cards?** Currently "Total answered" and "Overall accuracy" — do these include ad-hoc? (Need to verify.)

---

## Status: OPEN — Awaiting UX evaluation
