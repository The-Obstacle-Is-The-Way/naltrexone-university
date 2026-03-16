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

### P4 — Stale page always shows "Tutor Session" regardless of actual mode

When navigating back to a stale session page for an **exam** session, the header reads **"Tutor Session"** with **"Explanations shown after each answer"** — wrong on both counts.

**Code trace:** `practice-session-page-view.tsx:181` — `const mode = props.sessionInfo?.mode ?? 'tutor'`. On re-mount, `sessionInfo` is `null` (initial state), so the nullish coalescing defaults to `'tutor'`. The actual mode is never populated because the question-fetch either fails or returns null for an ended session.

### P5 — Exam stale state diverges from tutor: shows Review Questions instead of error

In tutor mode, the stale "End session" button calls `finalizeSessionSafely()` → hits the CONFLICT error → red error card.

In exam mode, the same button calls `loadReview()` instead (because `sessionMode` is null on re-mount, which matches the `input.sessionMode === null` branch in `use-practice-session-review-stage-state.ts:152`). `getPracticeSessionReview()` has **no `endedAt` guard** (`get-practice-session-review.ts:60-155`) — it returns review data for ended sessions. So the user sees a functional-looking Review Questions screen with a "Submit exam" button.

Clicking "Submit exam" → "Confirm submit" then hits the CONFLICT error (the backend's atomic `isNull(practiceSessions.endedAt)` WHERE clause at `drizzle-practice-session-repository.ts:271` prevents actual double-end). **No data corruption is possible**, but the UX path is misleading — the user sees a working UI for a completed session before hitting a wall.

### P6 — Exam summary truncates "Start another session" button

Exam mode shows 4 buttons (`Review your answers` + `Back to Dashboard` + `View in History` + `Start another session`), which overflow the viewport. The 4th button text is truncated. This is a direct consequence of P1's button count — D1/D2 reduce exam buttons to 3, which resolves this.

---

## Chrome Agent Audit (2026-03-16)

A Chrome browser agent independently walked both tutor and exam session-end flows. Its 10 findings were audited adversarially:

### Verified and added (3 genuinely new)

| # | Finding | Assessment | Added as |
|---|---------|------------|----------|
| 2 | Wrong mode label on stale page — always "Tutor Session" | **Verified.** `sessionInfo?.mode ?? 'tutor'` default. | P4 |
| 3/8 | Exam stale → Review Questions (inconsistent with tutor stale → error) | **Verified.** `loadReview()` has no `endedAt` guard. Backend prevents double-end atomically. | P5 |
| 6 | "Start another session" truncated in exam summary | **Verified.** 4 buttons overflow viewport. | P6 |

### Already documented in BS-054

| # | Finding | Maps to |
|---|---------|---------|
| 1 | Browser back breaks both flows | P2 |
| 8 | Inconsistent error recovery paths | P2 + P3 |
| 10 | "Try again" red text is alarming | D4 |

### False flags or misunderstood design (4 rejected)

| # | Claim | Why it's wrong |
|---|-------|---------------|
| 4 | "Next doesn't save answers in exam mode" — framed as major bug | **By design.** Exam mode uses per-question submission: "Submit" locks your answer, "Next" navigates. This mirrors real board exams where you skip questions and return later. If "Next" auto-saved, users couldn't skip without answering. The Submit/Next distinction IS the exam paradigm. |
| 5 | "Question navigator disappears after submit" | **By design.** After the last question is submitted, `isInReviewStage` becomes `true`, intentionally hiding the navigator and surfacing "Review answers" as the next step. This signals the transition from answering to reviewing. |
| 3 | "Allows re-submission of ended sessions" — framed as critical | **Overstated.** The backend has an atomic `isNull(endedAt)` WHERE clause (`drizzle-practice-session-repository.ts:271`) that prevents double-end. No data corruption is possible. The real issue (stale review UI) is captured as P5. |
| 7 | "No Finish button at end of tutor mode" | **Minor polish at best.** Tutor mode shows feedback inline after each answer — the "End session" header button is the natural completion action. Adding a redundant bottom CTA is a separate design discussion, not a session-end bug. |

### Reliability assessment

The Chrome agent was **accurate on observable facts** (button labels, navigation destinations, error messages, viewport overflow) but **unreliable on design intent** (misidentified intentional exam behavior as bugs). Consistent with prior Chrome agent audits: strong on pixel-level observation, weak on architectural reasoning.

---

## Root Cause Analysis

### P1 (button redundancy)
The button set was likely designed early when the app's information architecture was simpler. "Back to Dashboard" made sense when Dashboard was the only hub. Now that Practice is the natural "home" for session flow, the primary CTA should go there instead.

### P2 + P3 + P4 + P5 (stale state on back-navigation)
The practice session page (`/app/practice/[sessionId]`) is a **forward-only flow** — it was designed to be consumed once (question → answer → next question → end → summary). There is no mechanism to detect that a session has already been ended and show the summary on re-mount.

When the page re-mounts (via browser back), `usePracticeSession` refetches state:
- The session's question queue is exhausted → `question === null`
- `loadState` is `ready` (no error)
- `sessionInfo` is `null` (initial state) → mode defaults to `'tutor'` regardless of actual mode (P4)
- This matches the "No more questions found" conditional (`practice-view.tsx:234`)

The summary data is not re-fetched because `endSession()` is what populates it, and that function hasn't been called in this mount cycle.

**File:** `practice-session-page-logic.ts` — `endSession` (lines 166-218) is the only path that sets `summary` state. On a fresh mount, `summary` starts as `null`, so the summary view never renders even though the session is already ended server-side.

### P5 (exam path divergence)
`onEndSession` in `use-practice-session-review-stage-state.ts:150-160` branches on `sessionMode`. On a stale re-mount, `sessionMode` is `null`, which matches the `input.sessionMode === null` condition and routes to `loadReview()` instead of `finalizeSessionSafely()`. Since `getPracticeSessionReview()` has no `endedAt` guard, it returns data and the user sees a functional-looking review screen for a completed session. D3's `endedAt` check on mount would short-circuit before this branch is ever reached.

---

## Severity Assessment

| Issue | Severity | Frequency | User Segment |
|-------|----------|-----------|--------------|
| P1 — Button redundancy | Low (cosmetic/UX) | Every session end | All users |
| P2 — Stale "no more questions" on back | Medium (confusing) | Any user who clicks "View in History" then hits back | Exploratory users |
| P3 — "Already ended" error | Medium (alarming) | Subset of P2 who then click "End session" | Same as P2 |
| P4 — Wrong mode label on stale page | Low (cosmetic sub-bug of P2) | Any exam session that hits P2 | Exam users |
| P5 — Exam stale state shows Review Questions | Medium (misleading) | Exam users who hit P2 and click "End session" | Exam users |
| P6 — Exam summary button truncation | Low (viewport overflow) | Every exam session end on narrow viewports | Exam users |

P2, P3, and P5 are **production bugs**, not dev-environment artifacts. The back-navigation scenario is entirely normal user behavior — clicking a link, then hitting back. P4 and P6 are cosmetic sub-issues that get resolved by D3 and D1/D2 respectively.

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

## Decisions

### D1 — Button set (tutor mode): Simplify to two buttons

**Decision:** Replace the three buttons with two:

```
[ Back to Practice ]   [ View in History ]
```

- **"Back to Practice"** (filled, primary) replaces both "Back to Dashboard" and "Start another session"
- **"View in History"** (outline, secondary) stays

**Reasoning from first principles:**

Every major learning platform (Duolingo, Khan Academy, Anki, Quizlet) converges on the same post-session pattern: **one primary CTA** that takes you back to the hub where you'd start again, plus optionally one secondary action. The reason is simple — the session summary's job is to report results and get the user to their next action as fast as possible. Every additional button is a decision the user has to make while their brain is still processing how they performed.

The current set has three problems:
1. **Wrong primary CTA.** "Back to Dashboard" is the filled button, but Dashboard is the least likely post-practice destination. The user was practicing — their next intent is to practice again or review.
2. **Redundant navigation.** "Start another session" goes to `/app/practice`. "Back to Practice" would go to `/app/practice`. They're the same destination with different labels. Two buttons, one place.
3. **Dashboard access is already universal.** The top nav bar has a Dashboard link on every page. It doesn't need a dedicated CTA in the session summary — it's always one click away.

"View in History" earns its space because it serves a *different intent* (deep review of the session) that isn't reachable from Practice. It's a meaningful fork in the user's decision tree, not a redundant path.

### D2 — Button set (exam mode): Keep "Review your answers" as primary

**Decision:**

```
[ Review your answers ]   [ Back to Practice ]   [ View in History ]
```

Three buttons in exam mode. "Review your answers" stays as the primary filled CTA when at least one question is reviewable.

**Reasoning:**

After an exam, the user's dominant intent is to see what they got wrong — that's the entire pedagogical payoff of taking an exam in the first place. Every testing platform (board prep, certification, academic) makes "Review" the post-exam primary action because that's where learning happens. Removing it would break the learning loop.

Three buttons is acceptable here because exam mode has a genuinely different primary action ("Review") that tutor mode doesn't need (tutor already shows explanations inline). The three buttons map to three distinct user intents: learn from mistakes → practice more → check history. No redundancy.

### D3 — Back-navigation strategy: B2 (re-fetch and show summary)

**Decision:** When the page mounts and the session is already ended (`endedAt` is set), re-fetch the session summary data and render the `SessionSummaryView`.

**Reasoning:**

The browser back button is the single most instinctive navigation gesture on the web. When a user presses back, they expect to see *what they last saw* at that URL. The session summary is the last meaningful state of `/app/practice/{sessionId}` — showing anything else (empty state, error, redirect) violates that expectation.

Options considered:
- **B1 (redirect to Practice):** Violates back-button expectations. The user pressed back to return to something, not to be bounced somewhere else. Redirecting on back is a well-known UX anti-pattern.
- **B2 (re-fetch summary) — chosen:** Matches user expectation perfectly. The session data is immutable once ended — it's just stats and question IDs. A lightweight server action to retrieve it is straightforward.
- **B3 (friendly "ended" message):** Better than an error, but still makes the user take another action to get somewhere useful. The summary view already has navigation buttons — just show the summary.
- **C (replaceState):** Prevents back-navigation entirely, which is aggressive. Users should be able to go back to their results. This also wouldn't help if the user bookmarks the URL or opens it in a new tab later.

**Implementation note:** On page mount, check if the session's `endedAt` is set. If so, fetch summary data (answered, correct, accuracy, duration, question breakdown) via a new or existing server action and render `SessionSummaryView` directly — bypassing the question-loading flow entirely.

### D4 — Soften the CONFLICT error styling: Yes

**Decision:** Change the "Practice session already ended" error from destructive (red) styling to an informational/neutral treatment. Show the session summary if possible; if not, show a friendly message with navigation.

**Reasoning:**

Error styling (red border, destructive text) should be reserved for states where something went wrong that requires user attention — data loss risk, failed saves, broken state. "Session already ended" is none of these. The thing the user wanted to happen *already happened successfully*. Showing a red error for a benign idempotent state is like showing a fire alarm when someone tries to lock an already-locked door.

This matters even with D3 in place, because the CONFLICT error can still surface through:
- **Double-click on "End session"** — first request succeeds, second hits CONFLICT
- **Slow network** — user navigates away before response arrives, comes back, tries again
- **Multiple tabs** — user has the same session open in two tabs

In all these cases, the right response is "your session is complete, here are your results" — not a red error card.

**Proposed treatment:** When the end-session action returns CONFLICT, treat it as a success: fetch the summary data and show `SessionSummaryView`. The user's intent (end the session) was already fulfilled. Honor the intent, not the HTTP status.

### D5 — Exam review mode: Same fix applies

**Decision:** Yes, the same back-navigation issue affects exam review mode. Apply the same D3 pattern.

**Reasoning:**

The exam flow is: questions → "Review answers" (exam review stage) → "Submit exam" → session summary. If the user navigates away from the summary and hits back, the same re-mount problem occurs — the page enters the question-loading flow instead of showing the summary.

The fix is identical: on mount, check `endedAt`. If set, show the summary. The session entity is the same regardless of mode — `endedAt` is the universal signal that the session is complete. One guard covers both tutor and exam flows.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-16 | D1: Simplify tutor-mode buttons to `[ Back to Practice ] [ View in History ]` | Dashboard access is universal via nav; "Start another session" and "Back to Practice" are the same destination; 2 buttons > 3 for post-session cognitive load |
| 2026-03-16 | D2: Keep 3 buttons in exam mode with "Review your answers" as primary | Exam review is the dominant post-exam intent; three buttons map to three distinct intents with no redundancy |
| 2026-03-16 | D3: Re-fetch summary on back-navigation (B2) | Back button should show what was last seen; summary data is immutable once ended; redirect/error/message all violate back-button expectations |
| 2026-03-16 | D4: Soften CONFLICT error to informational; ideally show summary | "Already ended" is a success from the user's perspective; red error styling reserved for actual problems; defense in depth for double-click/race conditions |
| 2026-03-16 | D5: Same fix covers exam review mode | `endedAt` is the universal signal; one guard on mount covers both tutor and exam flows |
