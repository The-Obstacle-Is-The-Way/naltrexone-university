# BS-054: Session End UX — Button Simplification and Back-Navigation Bugs

**Date:** 2026-03-16
**Triggered by:** Manual walkthrough of tutor/exam session end flow; browser back button from "View in History" lands on stale "No more questions found" screen, double-end produces "Practice session already ended" error
**Scope:** Session summary action buttons are redundant and back-navigation after session end exposes broken states
**Related:** [BS-009](../_archive/brainstorming/bs-009-session-review-navigation-gap.md), [BS-004](../_archive/brainstorming/bs-004-review-page-flow-audit.md)

---

## The Problem

Three distinct issues surfaced during a manual walkthrough of the session end flow:

### P1 — Session summary buttons are redundant and misdirected

The current session summary view (`session-summary-view.tsx:103-126`) presents three navigation buttons after a session ends:

```
[ Back to Dashboard ]  [ View in History ]  [ Start another session ]
```

(Exam mode adds a fourth: `Review your answers`.)

**Issues:**

- **"Back to Dashboard"** is the primary (filled) CTA, but the user just finished practicing — they almost certainly want to return to the **Practice** page, not the Dashboard. The Practice page is where they'd start another session anyway.
- **"Start another session"** navigates to `/app/practice` — the exact same destination "Back to Practice" would go to. Having both is redundant.
- **"View in History"** is fine as a secondary action, but most users want to either review their answers or start fresh. It's unclear whether this button earns its space.

**Current button destinations:**

| Button | Route | Primary user intent? |
|--------|-------|---------------------|
| Back to Dashboard | `/app/dashboard` | Unlikely — user was practicing |
| View in History | `/app/history` | Occasionally — nice-to-have |
| Start another session | `/app/practice` | Yes — this is the main "next" action |

### P2 — Browser back from "View in History" hits a stale session page

**Repro steps:**
1. Complete a practice session → arrive at Session Summary
2. Click **"View in History"** → navigate to `/app/history`
3. Press **browser back** → return to `/app/practice/{sessionId}`

**Expected:** Session Summary (the last meaningful state of this page)

**Actual:** The page shows **"No more questions found."** with an **"End session"** button. This is a stale intermediate state — the session has already been ended and the summary was already shown. The page re-mounts and re-fetches the next question, gets `null` (session exhausted), and renders this empty state instead of recognizing the session is already finalized.

### P3 — Double-end produces "Practice session already ended" error

Continuing from P2:

4. Click **"End session"** on the stale "No more questions found" screen
5. Server returns `CONFLICT: Practice session already ended`

**What the user sees:** A red error card with "Practice session already ended" and buttons "Try again" / "Return to dashboard".

**Code trace:**
- `drizzle-practice-session-repository.ts:260` — throws `ApplicationError('CONFLICT', 'Practice session already ended')` when `existing.endedAt` is truthy
- `practice-session-page-logic.ts:166-218` — catches the error and sets load state to error
- `practice-view.tsx:192-208` — renders `ErrorCard` with the CONFLICT message

This is technically correct error handling, but the user should never reach this state through normal navigation. It's a UX dead end.

---

## Root Cause Analysis

### P1 (button redundancy)
The button set was likely designed early when the app's information architecture was simpler. "Back to Dashboard" made sense when Dashboard was the only hub. Now that Practice is the natural "home" for session flow, the primary CTA should go there instead.

### P2 + P3 (stale state on back-navigation)
The practice session page (`/app/practice/[sessionId]`) is a **forward-only flow** — it was designed to be consumed once (question → answer → next question → end → summary). There is no mechanism to detect that a session has already been ended and show the summary on re-mount.

When the page re-mounts (via browser back), `usePracticeSession` refetches state:
- The session's question queue is exhausted → `question === null`
- `loadState` is `ready` (no error)
- This matches the "No more questions found" conditional (`practice-view.tsx:234`)

The summary data is not re-fetched because `endSession()` is what populates it, and that function hasn't been called in this mount cycle.

**File:** `practice-session-page-logic.ts` — `endSession` (lines 166-218) is the only path that sets `summary` state. On a fresh mount, `summary` starts as `null`, so the summary view never renders even though the session is already ended server-side.

---

## Severity Assessment

| Issue | Severity | Frequency | User Segment |
|-------|----------|-----------|--------------|
| P1 — Button redundancy | Low (cosmetic/UX) | Every session end | All users |
| P2 — Stale "no more questions" on back | Medium (confusing) | Any user who clicks "View in History" then hits back | Exploratory users |
| P3 — "Already ended" error | Medium (alarming) | Subset of P2 who then click "End session" | Same as P2 |

P2 and P3 are **production bugs**, not dev-environment artifacts. The back-navigation scenario is entirely normal user behavior — clicking a link, then hitting back. This will happen in production.

---

## Proposed Fix (Sketch)

### Option A — Minimal: Fix buttons only (P1)

Replace the three buttons with a simplified set:

**Tutor mode:**
```
[ Back to Practice ]   [ View in History ]
```

**Exam mode:**
```
[ Review your answers ]   [ Back to Practice ]   [ View in History ]
```

- **"Back to Practice"** replaces both "Back to Dashboard" and "Start another session" (same destination: `/app/practice`, which is where you start a new session)
- **"View in History"** stays as an outline/secondary button for users who want the detailed history view
- **"Back to Dashboard"** is removed — Dashboard is one click away from Practice anyway
- Primary CTA is "Back to Practice" (or "Review your answers" in exam mode)

### Option B — Minimal + back-navigation guard (P1 + P2 + P3)

Everything in Option A, plus:

On page mount, check if the session is already ended (the server already knows `endedAt`). If it is:
- **Option B1:** Redirect to `/app/practice` automatically (session is over, nothing to show)
- **Option B2:** Re-fetch the summary data and show the Session Summary view (user sees their results again)
- **Option B3:** Show a simple "This session has ended" message with a "Back to Practice" link (no error styling, no "End session" button)

### Option C — Full: Replace history.pushState with replaceState

Use `router.replace()` instead of `router.push()` when navigating away from the session summary. This removes the session page from the browser history stack entirely, so back-navigation skips it. Combined with Option A for button cleanup.

**Trade-off:** This changes browser history behavior and may feel unexpected if the user genuinely wants to go back to see their summary.

---

## Open Questions

1. **Button set for tutor mode:** Is `[ Back to Practice ] [ View in History ]` the right simplification, or should "View in History" also be dropped for maximum simplicity? (Two buttons vs. one.)

2. **Button set for exam mode:** Should "Review your answers" remain as the primary CTA, or is reviewing redundant once the session is over? (It's currently only shown when at least one question is reviewable.)

3. **Back-navigation strategy:** Which option for P2/P3?
   - B1 (redirect to Practice) — simplest, but user loses access to summary on back
   - B2 (re-fetch and show summary) — best UX, but requires a new server action to retrieve ended-session summary
   - B3 (friendly "session ended" message) — middle ground, no error styling
   - C (replaceState) — prevents the problem entirely but changes history behavior

4. **Should the error card for "Practice session already ended" (`CONFLICT`) be softened regardless?** Even if we fix the navigation, the error could still surface via race conditions (double-click, slow network). The red error styling feels too alarming for what's essentially an idempotent "already done" state.

5. **Does this apply to exam review mode too?** After submitting an exam and viewing the summary, does browser back also land on a stale review state?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
