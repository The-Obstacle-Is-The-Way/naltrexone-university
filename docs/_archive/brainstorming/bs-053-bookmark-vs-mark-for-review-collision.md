# BS-053: Bookmark vs Mark-for-Review Collision in Exam Mode

**Date:** 2026-03-16
**Status:** Implemented
**Triggered by:** Visual audit of exam session action bar — "Bookmark" and "Mark for review" appear side-by-side as identically-styled pills, creating a confusing dual-action that maps to fundamentally different mental models.
**Scope:** Bookmark presence in active sessions (especially exam mode) creates UX confusion when combined with the exam-only "Mark for review" action.
**Related:** [BS-052](./bs-052-bookmark-icon-toggle-replacement.md) (bookmark icon toggle), [DEBT-316](../_archive/debt/debt-316-exam-post-submit-review-flow.md) (exam post-submit review flow), [bookmark-surface-policy.md](../frontend/bookmark-surface-policy.md) (bookmark availability registry)

---

## The Problem

This doc was opened to resolve two intertwined issues that existed at audit time. BS-053 is now implemented; the problem framing below is preserved as the decision record.

At audit time, there were two intertwined issues:

1. **Collision** — In exam mode, "Bookmark" and "Mark for review" sit side-by-side as identical pills, creating confusion.
2. **Missing bookmark on review** — The question review page (`/app/questions/[slug]?mode=review`) — the ideal place to bookmark — had no bookmark action at all.

### Problem 1: Exam action bar collision (pre-fix)

Before BS-053, the exam-mode bottom action bar presented four actions:

```
[ Submit ]  [ Next ]  [ Bookmark ]  [ Mark for review ]
```

**"Bookmark" and "Mark for review" are visually identical pills that do very different things:**

| Aspect | Bookmark | Mark for Review |
|--------|----------|-----------------|
| **Scope** | Global — persists permanently across sessions | Session-scoped — lives and dies with this exam |
| **Storage** | Dedicated `bookmarks` table | JSON field inside `practice_sessions.question_states` |
| **Purpose** | "I want to study this question later" | "I want to revisit this question before I submit the exam" |
| **Available pre-BS-053** | Tutor sessions, exam sessions, quick practice, bookmarks page remove flow; **missing from question review** | Exam mode only |
| **Visible after session** | Yes — bookmarks page, history | No — mark data is meaningless after exam submission |

A test-taker in exam mode is in **assessment mindset**: "Which questions do I need to revisit before I submit?" The bookmark action intrudes with a completely different intent: "I want to save this for future study." These are fundamentally different cognitive operations, but they look the same and sit next to each other.

At audit time, feedback was also uneven:

- Bookmark does emit transient success/error toasts in `PracticeView`, so it is **not** a silent text-swap-only control
- Mark-for-review gets the stronger persistent affordance: the session navigator shows a dot for marked questions
- Bookmark state gets **no** navigator badge anywhere in the active session flow

### Concrete confusion scenarios

1. **User wants to flag a question for review before submitting** → sees two similar-looking actions, has to parse the difference mid-exam. Mental overhead at the worst possible time.

2. **User bookmarks when they meant to mark for review** → proceeds through the exam thinking they've flagged the question → arrives at the review stage → question is not marked → they've lost track of which questions they wanted to revisit.

3. **User marks for review when they meant to bookmark** → finishes exam → mark data is gone → they've lost the question they wanted to study later.

4. **User does both** → now has two overlapping indicators on the same question, for different temporal scopes, with no visual distinction between their purposes.

### Problem 2: Bookmark missing from the question review page (pre-fix)

The question review page (`/app/questions/[slug]?mode=review`) is the destination when users click into review from history, session summaries, bookmarks, or dashboard surfaces. It is always a long-form question detail page, and when a prior attempt exists it also shows feedback content (explanation, reference, and any clinical-pearl callouts embedded in the markdown) — exactly the moment when a user thinks "I should save this for later study."

**Pre-fix review-page bottom bar:** it only rendered combinations of `Previous`, `Submit`, `Practice Again` / `Try Again`, `Next`, and an origin-aware back link. There was **no bookmark action** in any variant.

Representative examples:

```
Standalone bookmark review:
[ Practice Again ]  Back to Bookmarks

History/session review:
[ Previous ]  [ Practice Again ]  [ Next ]  Back to History
```

This is the surface where bookmarking makes the *most* sense, and it's absent.

**Pre-fix bookmark availability audit:**

| Surface | Route | Bookmark Available | Should Be |
|---------|-------|--------------------|-----------|
| Practice (Tutor) | `/app/practice/[sessionId]` | **YES** | **YES** — keep (no collision; inline explanations make mid-session bookmarking natural) |
| Practice (Exam) | `/app/practice/[sessionId]` | **YES** | **NO** — remove (collision with Mark for Review; assessment mindset) |
| Quick Practice | `/app/practice/quick` | **YES** | **YES** — keep (no collision; inline explanations make mid-session bookmarking natural) |
| Exam Review (pre-submit) | `/app/practice/[sessionId]` (review state) | NO | NO (assessment mode) |
| Session Summary | `/app/practice/[sessionId]` (summary state) | NO | Acceptable |
| **Question Review** | **`/app/questions/[slug]?mode=review`** | **NO** | **YES — this is the gap** |
| History Questions tab | `/app/history?tab=questions` | NO (list view) | Acceptable (click-through to review) |
| History Sessions breakdown | `/app/history?tab=sessions` | NO | Acceptable (click-through to review) |
| Dashboard Recent Sessions | `/app/dashboard` | NO | Acceptable (click-through to review) |
| Dashboard Recent Activity | `/app/dashboard` | NO | Acceptable (click-through to review) |
| Bookmarks Page | `/app/bookmarks` | Remove only | Acceptable |

The question review page is a shared destination used by multiple entry points:

- `?from=history` from History Questions
- `?from=history&sessionId=...` from History Sessions and the Session Summary CTA
- `?from=bookmarks` from Bookmarks
- `?from=dashboard` from Dashboard Recent Sessions / Recent Activity

`QuestionOrigin` still supports `from=practice` in the route contract, and `QuestionView` still has matching back-link behavior for it, but current production callers do **not** emit that origin.

---

## Root Cause Analysis

### Why does this happen?

Bookmarking was designed as a universal feature — "save any question for later study." It was built before exam mode existed and naturally appeared across the active practice question flows.

Mark-for-review was designed as an exam-specific feature — "flag this question to revisit during the exam." It was correctly scoped to exam mode only.

When exam mode launched, bookmark wasn't reconsidered. It was simply carried forward from tutor mode. The result: two "flag this question" actions with different semantics sharing the same visual space.

### The mental model clash

**Tutor mode** = learning mode. Bookmarking makes perfect sense here. You're studying, you see a hard question, you bookmark it. There's no "mark for review" because there's no deferred review stage — you see feedback immediately.

**Exam mode** = assessment mode. The primary "flag" action should be mark-for-review. Bookmarking is a secondary concern that belongs to the study lifecycle, not the assessment lifecycle.

### Why is bookmark missing from the review page?

The question review page (`app/(app)/app/questions/[slug]/question-page-client.tsx`) was built as a review-oriented question surface with navigation and reattempt support. Its `QuestionView` component (lines ~343-429) rendered bottom-bar navigation/submit/reattempt/back controls but never wired up bookmark state. The `useQuestionPageController` hook did not fetch or manage bookmark state for the current question.

This is likely an oversight from when the review page was first built — bookmark was already available in the active practice flows, so nobody noticed it was missing from the post-session review path. But the practice session is the *wrong* place for bookmarking (you're busy answering), and the review page is the *right* place (you're reflecting on the explanation).

### Implementation traces

**Exam collision resolved** — `app/(app)/app/practice/components/practice-view.tsx`:
- Bookmark now renders only when `!isExamMode`
- Mark for review remains conditionally rendered for exam mode only
- Bookmark feedback still routes through `useNotification()` (`Question bookmarked.`, `Bookmark removed.`, or error toast)
- The session navigator still only tracks `markedForReview`, not bookmark state

**Review-page bookmark added** — `app/(app)/app/questions/[slug]/question-page-client.tsx` + `use-question-page-controller.ts`:
- `QuestionView` now renders a bookmark button in the review-mode action bar once bookmark state is hydrated
- `useQuestionPageController` now exposes `bookmarkStatus`, `isBookmarkHydrated`, `isBookmarked`, and `onToggleBookmark`
- Shared toggle logic was extracted into `app/(app)/app/shared/bookmark-toggle.ts`, so the review page no longer depends on the practice route module
- The review navigator still carries no bookmark badge; bookmark lives in the detail action bar, not navigator chrome

---

## Severity Assessment

**Severity: Medium** — Not a blocker, but creates real cognitive friction in a high-stakes moment (mid-exam).

**Who is affected:** Every user taking an exam. The confusion is worst for:
- First-time exam takers who haven't built a mental model of the two features
- Users under time pressure who need to make quick decisions
- Users who are already anxious about exam performance

**How often (at audit time):** Every exam session. The buttons were always visible together.

**Risk of wrong action:** Moderate. Bookmarking when you meant to mark-for-review is a silent failure — the question won't appear in the exam review stage, and the user may not notice until it's too late.

---

## Options

All options below address **both** problems (exam collision + missing bookmark on review). The question review page bookmark addition is a prerequisite for any option that removes bookmark from sessions — without it, users have no natural place to bookmark after finishing a session.

### Option A: Remove bookmark from exam sessions + add to question review page

**What changes:**
- Exam mode action bar: `[ Submit ] [ Next ] [ Mark for review ]`
- Tutor mode action bar: `[ Submit ] [ Next ] [ Bookmark ]` (unchanged)
- Question review page action bar example: `[ Practice Again ] [ Bookmark ] [ Next ] Back to History`
- Bookmarking available in: **question review page**, bookmarks page, tutor mode, quick practice

**Pros:**
- Clean separation: exam mode = mark for review, tutor mode = bookmark
- Removes the confusing side-by-side presentation entirely
- The review page — where users are reading explanations and reflecting — becomes the natural bookmarking surface
- Users can still bookmark exam questions after the fact via history → review

**Cons:**
- Users lose the ability to bookmark mid-exam (must do it post-session)
- If a user wants to save an exam question for future study, they need to remember to do it later

**Mental model:** "In an exam, you mark for review. After the exam, bookmark from your review."

### Option B: Remove bookmark from ALL active sessions + add to question review page

**What changes:**
- Exam mode action bar: `[ Submit ] [ Next ] [ Mark for review ]`
- Tutor mode action bar: `[ Submit ] [ Next ]`
- Quick practice action bar: `[ Submit ] [ Next ]`
- Question review page action bar example: `[ Practice Again ] [ Bookmark ] [ Next ] Back to History`
- Bookmarking available in: **question review page**, bookmarks page only

**Pros:**
- One consistent rule: "You bookmark during review, not during sessions"
- Further simplifies the action bar across all modes
- Encourages a natural workflow: learn first, curate later
- The review page becomes the single bookmarking surface (alongside the bookmarks page itself)

**Cons:**
- Tutor mode users lose mid-session bookmarking — but tutor mode shows explanations inline, so the "reflect and bookmark" moment happens naturally mid-session
- Tutor mode doesn't have the same collision problem (no mark-for-review button), so removing bookmark there is solving a problem that doesn't exist
- May feel like a regression for users who've built a habit of bookmarking mid-tutor-session

**Mental model:** "Sessions are for answering. Review is for curating."

### Option C: Keep both in sessions (visually differentiated) + add to question review page

**What changes:**
- Mark for review stays as a pill/button in the primary action bar (exam only)
- Bookmark becomes an icon-only toggle (filled/unfilled bookmark icon) placed separately — e.g., top-right of the question card or in the question header
- Question review page gets the same bookmark icon toggle
- Visual separation makes it clear these are different features

**Pros:**
- No functionality loss — both actions remain available mid-exam
- Visual differentiation reduces confusion
- Aligns with BS-052 (bookmark icon toggle replacement) which is already planned
- Review page gets bookmark too

**Cons:**
- Still two "flag" concepts on the same screen in exam mode
- Relies on users understanding icon semantics without labels
- More design work required to find the right placement

**Mental model:** "The bookmark icon saves for later. The 'Mark for review' button is for this exam."

### Option D: Merge concepts — mark-for-review auto-bookmarks + add to review page

**What changes:**
- Remove the bookmark button from exam mode
- "Mark for review" both flags for exam review AND bookmarks the question
- After the exam, marked questions appear in bookmarks
- Question review page gets a standard bookmark toggle

**Pros:**
- Single action in exam mode, no confusion
- Users who mark questions for review probably want to study them later anyway
- Simplest mental model for exam mode

**Cons:**
- Conflates two intentionally separate concepts
- Users may not want every mark-for-review to become a permanent bookmark
- Adds bookmark churn — questions get bookmarked that the user only wanted to flag temporarily
- Harder to undo — user would need to manually un-bookmark after the exam

---

## Resolved Questions

1. **Do we have any analytics on mid-exam bookmark usage?**
   **Resolved: Analytics are not required to make the structural decision, but they are still worth collecting after rollout.** The mental model argument is sufficient to remove bookmark from the exam screen: exam mode is assessment mindset, not curation mindset. Users have not seen the explanation yet, so permanent saving is premature compared with post-session review. But once shipped, we should still watch whether exam users actually convert into review-page bookmarking or whether the new path needs reinforcement.

2. **Tutor mode: does bookmark belong in-session?**
   **Resolved: Yes, keep it.** Tutor mode shows explanations inline immediately after answering. The reflection moment — reading the explanation, seeing the clinical pearl — happens right there mid-session. There is no collision with mark-for-review, and no reason to remove a feature that is aligned with the user’s current task. The resulting asymmetry with exam mode is acceptable because the two modes already have intentionally different rules, feedback timing, and navigation patterns. Same logic applies to quick practice.

3. **Does BS-052 (bookmark icon toggle) resolve enough of the exam collision?**
   **Resolved: No, it's orthogonal.** Even with a distinct icon, you'd still have two "flag this question" concepts on the same screen during an exam. BS-052 improves bookmark's visual treatment everywhere (and should still proceed), but it doesn't eliminate the cognitive overload of having both actions during assessment. Option A (remove bookmark from exam) is the right first move regardless of BS-052's status.

4. **Question review page: where should the bookmark button go?**
   **Resolved: In the action bar.** The review page already has an action bar with `Practice Again / Next / Back to History`. Adding a bookmark button there is the simplest, most consistent, and most discoverable placement. No new UI zones needed. When BS-052 lands later, the text button can evolve into an icon toggle — but that's a future refinement, not a blocker.

5. **What about the exam review stage (pre-submit)?**
   **Resolved: No bookmark there.** The exam review stage is still assessment mode — the user is deciding whether to revisit questions before submitting, not curating study material. Adding bookmark here would partially re-introduce the collision problem (bookmark next to marked-for-review indicators). The clean path is: finish exam → review in history → bookmark from the review page.

6. **Is the post-session bookmark path for exam users too many clicks?**
   **Resolved: Acceptable as the primary path, but worth monitoring.** The new flow is deliberate rather than buried: finish exam → session summary → review answers → bookmark on the question detail page. That is a reasonable number of steps for a durable study action, especially because the user now has the explanation in front of them. The risk is not click count alone; the real risk is abandonment after summary. If this proves material in practice, the next improvement should be a stronger handoff into review (for example, starting with marked/incorrect questions), not restoring bookmark to the exam action bar.

7. **Should bookmark also be added directly to list surfaces like History Questions?**
   **Resolved: Not as the primary save affordance.** List views are optimized for scan, filter, and navigation. The full question review page is still the better moment for a permanent curation decision because the user has the stem, answer context, and explanation in front of them. That said, History Questions lacking bookmark filter/indicator is a genuine discoverability gap and should be tracked separately from BS-053 rather than used to overturn Option A.

---

## Decision: Option A

**Option A is adopted: remove bookmark from exam sessions + add bookmark to the question review page.**

### What changes

| Surface | Before | After |
|---------|--------|-------|
| Exam mode action bar | `[ Submit ] [ Next ] [ Bookmark ] [ Mark for review ]` | `[ Submit ] [ Next ] [ Mark for review ]` |
| Tutor mode action bar | `[ Submit ] [ Next ] [ Bookmark ]` | No change |
| Quick practice action bar | `[ Submit ] [ Next ] [ Bookmark ]` | No change |
| Question review page action bar | `[ Practice Again ] [ Next ] Back to History` | `[ Practice Again ] [ Bookmark ] [ Next ] Back to History` |
| Bookmarks page | Remove only | No change |

### Why Option A

1. **Respects mental models.** Exam = assessment (mark for review). Tutor/review = learning (bookmark). Each mode gets only the action that belongs to its mindset. This mode-specific asymmetry is a feature, not a bug.

2. **Fixes the collision without over-correcting.** Option B (remove from all sessions) would strip bookmark from tutor mode — solving a problem that doesn't exist there. Tutor mode shows explanations inline, so the reflect-and-bookmark moment is natural mid-session. No reason to remove it.

3. **Fills the primary gap.** The question review page is the highest-intent bookmarking surface in the app — users are reading explanations, clinical pearls, and references. Every entry point (history, bookmarks, dashboard, session summary) funnels here. Adding bookmark to this one surface covers all post-session flows without cluttering scan-oriented list views.

4. **Smallest change, biggest impact.** Two implementation pieces:
   - **Remove:** Wrap the bookmark button in `practice-view.tsx` (lines 345-354) with `!isExamMode` — `isExamMode` already exists at line 91
   - **Add:** Wire bookmark state into `useQuestionPageController` or a companion hook, add a bookmark button to the `QuestionView` action bar (lines 343-429)

5. **Leaves room for BS-052.** When the bookmark icon toggle work lands, the text-based bookmark button can evolve into a filled/unfilled icon across all surfaces. That's a visual refinement that can happen independently of this structural change.

### Why not the other options

- **Option B** removes bookmark from tutor mode unnecessarily — no collision exists there, and the mid-session reflection moment is natural
- **Option C** keeps both actions on the exam screen, even if visually differentiated — still two "flag" concepts during assessment
- **Option D** conflates intentionally separate domain concepts (permanent curation vs session-scoped flagging) and adds bookmark churn

### Post-session bookmark path for exam users

After this change, exam users bookmark via:
```
Finish exam → Session Summary → "Review your answers" → Question Review page → Bookmark
                                                          ↑
History → Questions tab → Click question ────────────────┘
```

This is a natural study workflow: take the exam first, then reflect and curate.

**See also:** [bookmark-surface-policy.md](../frontend/bookmark-surface-policy.md) for the full surface registry and decision tree.

### Implementation follow-through

The implemented shape stays aligned with the decision:

- Exam mode action bar now removes bookmark entirely and keeps only the exam-scoped mark-for-review affordance
- Tutor mode and quick practice keep bookmark unchanged
- Question review now owns bookmark state explicitly instead of collapsing unknown/loading/saving into a single boolean
- Shared bookmark toggle logic lives in a route-agnostic module and persists idempotency keys before the request, preventing retry double-toggle hazards

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-16 | BS-053 opened | Exam action bar shows Bookmark + Mark for review side-by-side, creating cognitive collision |
| 2026-03-16 | Scope expanded to include missing bookmark on question review page | Visual audit revealed the review page (`/app/questions/[slug]?mode=review`) — the ideal bookmarking surface — has no bookmark action |
| 2026-03-16 | Created [bookmark-surface-policy.md](../frontend/bookmark-surface-policy.md) | Registry of where bookmark should/shouldn't appear and why, to prevent future surface drift |
| 2026-03-16 | First-principles review reconfirmed Option A | Confusion is real for first-time exam users; mode-specific asymmetry is acceptable; post-session review is the right primary bookmark surface; list-surface discoverability remains a separate follow-up concern |
| 2026-03-16 | Implemented Option A | Removed bookmark from exam-mode `PracticeView`, added bookmark state + action to question review, and extracted shared toggle logic into `app/(app)/app/shared/bookmark-toggle.ts` |
| 2026-03-16 | Hardened the shared toggle helper after review | Persisted request idempotency keys before dispatch and made review-page bookmark hydration/saving state explicit |
