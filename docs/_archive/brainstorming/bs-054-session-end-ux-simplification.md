# BS-054: Session End UX -- Button Simplification and Ended-Session Reopen Bugs

**Date:** 2026-03-16
**Triggered by:** Manual walkthrough of tutor/exam session-end flow; browser back from "View in History" lands on a stale session runner, and re-ending can produce "Practice session already ended"
**Scope:** Session summary action buttons are redundant/misdirected, and reopening an ended session URL exposes broken runner states instead of the durable summary
**Related:** [BS-009](./bs-009-session-review-navigation-gap.md), [BS-004](./bs-004-review-page-flow-audit.md), [BS-002](./bs-002-practice-engine-state-audit.md)
**Verification note:** All code traces and file references in this doc were re-checked against the current `bs-054-session-end-ux` branch on 2026-03-16.
**Resolution note:** Resolved by PR #229 on 2026-03-17. D1-D5 were implemented and the verification matrix passed before archival.

---

## The Problem

Six distinct issues exist in the current session-end flow.

### P1 -- Session summary buttons are redundant and misdirected

The current session summary view (`session-summary-view.tsx:103-126`) presents:

```
[ Back to Dashboard ]  [ View in History ]  [ Start another session ]
```

Exam mode adds a fourth button: `Review your answers`.

**Issues:**

- **"Back to Dashboard"** is the filled primary CTA, but the user just finished practicing. The most natural next destination is **Practice**, not Dashboard.
- **"Start another session"** goes to `/app/practice`, which is the same destination a `Back to Practice` button would use.
- **"View in History"** is a legitimate secondary path, but it should compete with one primary next step, not two overlapping ones.

**Current button destinations:**

| Button | Route | Likely primary intent? |
|--------|-------|------------------------|
| Back to Dashboard | `/app/dashboard` | No |
| View in History | `/app/history` | Sometimes |
| Start another session | `/app/practice` | Yes |

### P2 -- Reopening an ended session URL lands in stale runner states

**Observed repro:**
1. Complete a practice session and reach Session Summary
2. Click **"View in History"**
3. Press browser back to return to `/app/practice/{sessionId}`

**Expected:** Session Summary, because that is the last meaningful state for that URL

**Actual:** The page remounts the session runner instead of restoring the summary

There are currently two stale outcomes:

- **If no unanswered questions remain**, the mount-time question fetch returns `null`, and the page renders **"No more questions found."** with an **"End session"** or **"Review answers"** button.
- **If the session was ended early with unanswered questions remaining**, the mount-time fetch can return a real question because `GetNextQuestionUseCase` does **not** guard on `endedAt`. That means an already-ended session can reopen looking active.

This is not a dev-only artifact. It affects normal browser back behavior, direct URL entry, bookmarks, new tabs, and multi-tab reopen of ended sessions.

**Code trace:**

- `app/(app)/app/practice/[sessionId]/page.tsx:17-35` and `practice-session-page-client.tsx:15-37` do not hydrate ended-session summary data; they just hand `sessionId` to the client controller.
- `use-practice-session-question-flow.ts:138-139` always starts the page by calling `onTryAgain()` on mount.
- `practice-session-page-logic.ts:29-75` runs `loadNextQuestion()` and only sets `sessionInfo` if a question payload comes back.
- `get-next-question.ts:146-190` reads the session but does not reject ended sessions; it only returns `null` when there is no target unanswered question.
- `practice-session-page-view.tsx:116-123` only renders `SessionSummaryView` when `summary` exists in local client state.

### P3 -- Re-ending a stale tutor session produces a destructive CONFLICT error

Starting from the stale tutor runner state in P2:

1. User sees **"No more questions found."**
2. User clicks **"End session"**
3. The page eventually surfaces a red error card: **"Practice session already ended"**

**Important current trace:** the stale tutor path does **not** go straight to `finalizeSessionSafely()`

What actually happens:

- `use-practice-session-review-stage-state.ts:150-160` branches `onEndSession()` to `loadReview()` whenever `sessionMode === null`
- On a stale remount, `sessionMode` is still `null`
- `getPracticeSessionReview()` returns tutor review data for the ended session
- `use-practice-session-review-stage-state.ts:108-114` sees `mode !== 'exam'` and then calls `finalizeSessionSafely()`
- `practice-session-page-logic.ts:166-218` calls `endPracticeSession`
- `drizzle-practice-session-repository.ts:259-285` throws `CONFLICT` because `endedAt` is already set
- `practice-view.tsx:192-208` renders the red `ErrorCard`

The observed user-facing result is real, but the old "tutor goes directly to finalize" trace was inaccurate.

### P4 -- Stale ended-session runner defaults to "Tutor Session"

When the stale runner renders without `sessionInfo`, the page header defaults to tutor copy:

- title: **"Tutor Session"**
- subtitle: **"Explanations shown after each answer."**

This is wrong for ended exam sessions.

**Code trace:** `practice-session-page-view.tsx:181-190`

```ts
const mode = props.sessionInfo?.mode ?? 'tutor';
```

If no question payload has populated `sessionInfo`, the UI falls back to tutor copy even for exam sessions.

### P5 -- Stale ended exam session reopens into Review Questions

The stale exam path diverges from the stale tutor path:

- `onEndSession()` still routes to `loadReview()` because `sessionMode === null`
- `getPracticeSessionReview()` has no `endedAt` guard and intentionally returns ended-session review data (`get-practice-session-review.ts:60-155`)
- `use-practice-session-review-stage-state.ts:117-123` sets `review`, marks `isInReviewStage = true`, and resets question state
- The user sees a functional-looking **Review Questions** screen with a working **Submit exam** confirmation flow

Only when the user confirms **Submit exam** does the backend reject the second end attempt:

- `drizzle-practice-session-repository.ts:264-274` updates only where `endedAt IS NULL`
- `drizzle-practice-session-repository.ts:276-285` falls back to `CONFLICT` if the row is already ended

No data corruption occurs, but the UX is misleading: an already-ended exam should never reopen into a live review-stage UI.

### P6 -- Exam summary action row truncates on narrower viewports

Exam summaries currently render four buttons:

```
[ Review your answers ] [ Back to Dashboard ] [ View in History ] [ Start another session ]
```

That four-button row can overflow and truncate the fourth label. Reducing the action count resolves this without additional layout complexity.

---

## Chrome Agent Audit (2026-03-16)

A Chrome browser agent independently walked the tutor and exam session-end flows. Its findings break down as follows.

### Verified and added

| # | Finding | Assessment | Maps to |
|---|---------|------------|---------|
| 2 | Wrong mode label on stale page | Verified: `sessionInfo?.mode ?? 'tutor'` default | P4 |
| 3/8 | Ended exam can reopen into Review Questions instead of a durable ended state | Verified: `loadReview()` + no ended guard | P5 |
| 6 | "Start another session" truncates in exam summary | Verified: four-button overflow | P6 |

### Already documented by BS-054

| # | Finding | Maps to |
|---|---------|---------|
| 1 | Browser back breaks both flows | P2 |
| 8 | Inconsistent stale-state recovery paths | P3 + P5 |
| 10 | Red destructive styling is too alarming for an already-ended state | D4 |

### Rejected, but with corrected rationale

| # | Claim | Correct assessment |
|---|-------|--------------------|
| 4 | "Next doesn't save answers in exam mode" | Not a BS-054 session-end bug. Current code deliberately persists only on `Submit`; `Next` is navigation. The UX concern is still real enough to have prior documentation in BS-002, but it is out of scope for this session-end fix. |
| 5 | "Question navigator disappears after submit" | The prior rejection rationale was wrong. `isInReviewStage` does **not** become `true` on submit. During active answering, the navigator remains in the session runner. After the last exam answer, the bottom bar now exposes `Review answers`; the navigator only disappears once review stage is explicitly entered. |
| 3 | "Allows re-submission of ended sessions" framed as critical | Overstated. The UX is broken, but the backend's `endedAt IS NULL` CAS guard prevents double-end data corruption. The real product issue is stale ended-session UI, not write integrity. |
| 7 | "Tutor mode needs a bottom Finish CTA" | Reasonable polish discussion, but separate from the ended-session reopen bug. Keep it out of BS-054 scope unless we explicitly choose to redesign tutor completion affordances. |

### Reliability assessment

The Chrome agent was strong on observable UI facts and weak on intent/scope boundaries. It helped identify real stale-state behavior, but its design interpretations need code/spec review before being promoted to product bugs.

---

## Root Cause Analysis

### P1 (button redundancy)

The summary action set reflects an older hub-and-spoke mental model where Dashboard was the default destination. The current IA makes Practice the natural next step after a session, so the summary is carrying too many actions and the wrong primary one.

### P2 + P3 + P4 + P5 (ended session reopen bug)

The core bug is architectural:

- `/app/practice/[sessionId]` is a client-orchestrated runner page
- The durable ended-state summary is **not** loaded from the server on mount
- The only way `summary` becomes non-null today is by successfully calling `endPracticeSession()` during the current mount cycle

**Current flow shape:**

- `page.tsx` does not load session state or summary server-side
- `PracticeSessionPageClient` mounts
- `usePracticeSessionQuestionFlow` immediately calls `loadNextQuestion()`
- `GetNextQuestionUseCase` does not reject ended sessions
- If `summary` is still `null`, `PracticeSessionPageView` stays in runner mode

That creates a stale-ended-session gap:

- **Exhausted ended session:** `loadNextQuestion()` returns `null` -> runner renders "No more questions found."
- **Early-ended session with unanswered questions left:** `loadNextQuestion()` returns a real question -> ended session looks active

Because `sessionInfo` starts as `null`, stale renders also inherit the `?? 'tutor'` fallback, producing the wrong header copy for exam sessions.

### P3 (tutor stale path specifics)

The stale tutor path is:

1. Stale runner renders with `sessionMode === null`
2. User clicks **End session**
3. `onEndSession()` routes to `loadReview()`
4. Review payload comes back with `mode: 'tutor'`
5. Hook treats that as "not an exam review stage" and immediately calls `finalizeSessionSafely()`
6. `endPracticeSession()` hits repo-level `CONFLICT`
7. Runner shows destructive error card

So the tutor path is "stale runner -> review fetch -> finalize -> conflict", not "stale runner -> finalize immediately".

### P5 (exam stale path specifics)

The stale exam path is:

1. Stale runner renders with `sessionMode === null`
2. User clicks **Review answers** or **End session** equivalent
3. `onEndSession()` routes to `loadReview()`
4. Review payload comes back with `mode: 'exam'`
5. Hook enters review stage
6. User sees a valid-looking Review Questions UI for an already-ended session
7. Only on final submit does the backend reject the duplicate end

This is why P5 feels worse than the tutor path: the stale exam branch looks more legitimate before it fails.

---

## Severity Assessment

| Issue | Severity | Frequency | User segment |
|-------|----------|-----------|--------------|
| P1 -- Button redundancy | Low | Every session end | All users |
| P2 -- Ended session URL reopens into stale runner states | Medium | Browser back, bookmarks, copied URLs, new tabs, multi-tab reopen | Users who revisit session URLs |
| P3 -- Stale tutor path ends in destructive CONFLICT card | Medium | Subset of P2 tutor users | Tutor users |
| P4 -- Stale runner defaults to tutor copy | Low | Subset of P2 exam users | Exam users |
| P5 -- Stale exam path reopens Review Questions | Medium | Subset of P2 exam users | Exam users |
| P6 -- Exam summary button truncation | Low | Narrower viewports on exam summary | Exam users |

P2 through P5 are production bugs, not temporary dev-environment weirdness.

---

## Proposed Fix Options

### Option A -- Fix buttons only

**Tutor mode**

```
[ Back to Practice ]   [ View in History ]
```

**Exam mode**

```
[ Review your answers ]   [ Back to Practice ]   [ View in History ]
```

This resolves P1 and P6 only.

### Option B -- Fix buttons and ended-session bootstrap

Everything in Option A, plus:

- Detect ended sessions when `/app/practice/[sessionId]` loads
- Render a durable ended-state summary instead of remounting the runner

Sub-options:

- **B1:** redirect to `/app/practice`
- **B2:** fetch summary and render `SessionSummaryView`
- **B3:** show a friendly "This session has ended" screen

### Option C -- Remove session page from browser history

Use `router.replace()` when leaving the summary so browser back skips the session URL.

This does **not** solve direct URL entry, bookmarks, copied links, or new tabs. It is not sufficient on its own.

---

## Decisions

### D1 -- Tutor summary should simplify to two actions

**Decision:**

```
[ Back to Practice ]   [ View in History ]
```

**Why:**

- `Back to Dashboard` is the wrong primary next step
- `Start another session` duplicates the `/app/practice` destination
- `View in History` is a meaningful secondary branch and can stay

### D2 -- Exam summary should keep Review as the primary action

**Decision:**

```
[ Review your answers ]   [ Back to Practice ]   [ View in History ]
```

**Why:**

- Post-exam review is a distinct, valuable user intent
- Exam mode has one genuinely extra action that tutor mode does not need
- Three buttons is acceptable here because each serves a different job

### D3 -- Ended session URLs must bootstrap into summary, not runner

**Decision:** Choose Option B2.

When `/app/practice/[sessionId]` loads, the app must first determine whether the session is already ended. If it is, the page must fetch ended-session summary data and render `SessionSummaryView` instead of entering the question runner.

**Why:**

- Browser back should show what the user last saw at that URL
- Direct URL access to an ended session should also be durable
- Redirecting away or showing a generic message is weaker than showing the actual results

**Implementation requirements:**

1. Add a read-side server action/use case for ended session summary retrieval.
   Recommended shape: `getPracticeSessionSummary({ sessionId })`.

2. Reuse shared projection logic instead of duplicating summary math.
   Today, summary projection lives implicitly inside `EndPracticeSessionUseCase`. Extract the summary-building logic so both:
   - `EndPracticeSessionUseCase`
   - the new read-side summary use case
   produce the same `EndPracticeSessionOutput` shape.

3. Keep using existing `getPracticeSessionReview()` for:
   - summary breakdown rows
   - `Review your answers` CTA slug lookup

4. Do **not** run "ended summary bootstrap" and `loadNextQuestion()` in parallel.
   If both fire at mount, a late question response can overwrite the ended summary state or reintroduce stale runner UI. The bootstrap must be serialized or server-hydrated so the page decides **first** whether it is ended or active.

5. Recommended defense in depth: reject ended sessions in `GetNextQuestionUseCase`.
   The normal session page should not rely on that error path for rendering, but ended sessions also should never be able to return live question payloads to any caller.

**Edge cases:**

- Ended session with **0 answered** questions: valid summary, totals stay stable
- Ended session with **unanswered questions remaining**: must still show summary, never runner
- Session with **0 questions**: summary math is still stable (`accuracy = 0`, duration clamped, view already handles empty-answer tutor summaries)

### D4 -- Treat "already ended" as an idempotent success state

**Decision:** If `endPracticeSession()` returns `CONFLICT: Practice session already ended`, do not surface it as a destructive red error during normal session-end UX.

Preferred handling:

- Fetch ended-session summary via the D3 read path
- Render `SessionSummaryView`
- If summary fetch fails, show a neutral informational ended-state message with navigation

**Why:**

- The user's intent was already fulfilled
- This can still happen via double-clicks, slow networks, stale tabs, or multiple tabs
- Red destructive treatment is misleading for a benign idempotent state

### D5 -- The same ended-session bootstrap fixes tutor and exam

**Decision:** D3 is the universal fix for both modes.

**Why:**

- Tutor stale path and exam stale path are just different consequences of the same missing ended-session bootstrap
- `endedAt` is the canonical "this session is complete" signal
- One correct mount-time decision removes P2, P3, P4, and P5 together

---

## Implementation Requirements (SSOT)

Any fix for BS-054 must satisfy all of the following:

1. Summary buttons change to:
   - tutor: `Back to Practice`, `View in History`
   - exam: `Review your answers`, `Back to Practice`, `View in History`

2. Reopening an ended session URL never renders:
   - an active question
   - `No more questions found.`
   - Review Questions for an already-ended exam

3. Browser back from History to an ended session URL shows the durable summary.

4. Direct URL access to `/app/practice/{sessionId}` for an ended session also shows the durable summary.

5. Ending an already-ended session is handled idempotently in the UI.

6. The fix is not allowed to rely solely on `router.replace()` history tricks.

7. The fix must not duplicate summary projection logic in multiple use cases.

8. The fix must explicitly handle mount-time race conditions between ended-summary bootstrap and question loading.

---

## Required Verification Matrix

Before closing BS-054, verify all of these:

1. Tutor session -> Summary -> View in History -> browser back -> Summary
2. Exam session -> Summary -> View in History -> browser back -> Summary
3. Direct URL to ended tutor session -> Summary
4. Direct URL to ended exam session -> Summary
5. End a session early with unanswered questions remaining -> reopen URL -> Summary, not question runner
6. Double-end from a stale tab or second click -> Summary or neutral ended-state message, not destructive red error
7. Exam summary buttons do not truncate on narrow viewport
8. Tutor summary has exactly 2 primary actions
9. Exam summary has exactly 3 primary actions
10. Summary breakdown still loads and exam `Review your answers` still resolves through existing review data

---

## Out of Scope for BS-054

These are real or arguable UX topics, but they are not the session-end bug being fixed here:

- Persisting unsubmitted exam selections when users navigate with `Next`
- Adding a tutor-only bottom "Finish" CTA
- Broader review-mode IA changes outside the session summary and ended-session bootstrap

The "Next loses unsubmitted selection" concern remains documented separately in [BS-002](./bs-002-practice-engine-state-audit.md).

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-16 | D1: Simplify tutor summary actions to `[ Back to Practice ] [ View in History ]` | Dashboard is not the natural post-session destination; "Start another session" duplicates Practice |
| 2026-03-16 | D2: Keep `[ Review your answers ] [ Back to Practice ] [ View in History ]` for exam summaries | Exam review is the main post-exam intent; three actions are distinct and non-redundant |
| 2026-03-16 | D3: Bootstrap ended session URLs into summary (Option B2) | Durable URL behavior must work for browser back, direct URL entry, bookmarks, and new tabs |
| 2026-03-16 | D4: Treat already-ended as idempotent success in UI | "Already ended" is not a destructive failure from the user's perspective |
| 2026-03-16 | D5: One ended-session bootstrap covers tutor and exam | `endedAt` is the universal completion signal |
