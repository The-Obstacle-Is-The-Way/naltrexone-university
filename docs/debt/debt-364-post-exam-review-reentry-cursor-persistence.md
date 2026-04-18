---
id: DEBT-364
title: Post-exam review re-entry cursor persistence — "missing Next button" after Review Answers
status: Open (decision-locked 2026-04-17, implementation-ready)
priority: P2
created: 2026-04-17
area: practice / exam / post-exam review
promoted_from: docs/_archive/brainstorming/bs-063-exam-review-reentry-state-confusion.md
related: DEBT-350, DEBT-359, DEBT-316, DEBT-326, DEBT-363, DEBT-365
---

# DEBT-364: Post-exam review re-entry cursor persistence

**Priority:** P2
**Status:** Open — decision-locked and implementation-ready; no implementation started
**Created:** 2026-04-17
**Affected surface:** `PostExamReviewView` (re-entry from Session Summary via `Review Answers`)
**Adjacent unchanged surfaces:** `ExamReviewView` (pre-submit), initial post-submit entry (still lands on Q1)
**Discovered via:** Manual walkthrough on 2026-04-17 — user submitted a 3-question exam, reached the Session Summary ("final splash screen") via `Finish review`, clicked `Review Answers`, and reported the `Next` button was missing. Clicking a navigator pill restored it.

---

## The user-observed problem — in one paragraph

After you finish an exam and land on the Session Summary, clicking `Review Answers` takes you back to the post-exam review — but **not at Question 1**. It puts you back on whatever question you last had selected before leaving. Since the only way to leave the post-exam review is either `View Summary` (top-right button, cursor preserved wherever you were) or `Finish review` (only visible on the *last* question), the common case is that re-entry lands on the last question. The last question has no `Next` button by design — only `Previous` and `Finish review`. The user reads this as "the Next button is missing." It is not missing; the cursor is on the last question. Clicking any other question in the navigator moves the cursor and `Next` reappears.

This is not a visual-regression bug, not a test gap, and not new in PR #280. It has been shipped behavior since DEBT-350 introduced the Summary ↔ post-exam-review loop on 2026-04-08.

---

## Exact reproduction steps

Verified on `main` @ commit `d5705b74` (2026-04-17):

1. Start an exam with ≥ 2 questions.
2. Answer every question, reach the last question.
3. Click `Review & Submit` → `ExamReviewView`.
4. Click `Submit exam` → confirmation dialog → `Confirm submit`.
5. `PostExamReviewView` opens at Question 1. Navigator pills for Q1/Q2/Q3 are all clickable; `Next` is visible.
6. Walk `Next → Next` until you reach the last question. The footer now shows `Previous` + `Finish review` (no `Next`).
7. Click `Finish review`. Session Summary appears.
8. Click `Review Answers` on the summary.
9. **Observed:** post-exam review reopens, but on the *last* question. Footer shows `Previous` + `Finish review`, no `Next`. Navigator pills still clickable; clicking Q1 or Q2 moves the cursor and `Next` reappears.

What this is **not**:
- Not a broken render — the component renders correctly given its props.
- Not a navigator bug — pills stay clickable and functional.
- Not an E2E-flaky scroll problem — reproduces on a short 3-question exam with no scrolling.

---

## Root cause — traced through the actual code path

### The re-entry handler preserves the cursor by design

`app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.ts:192-223` — `onReenterPostExamReview(questionId?: string)`:

```ts
const onReenterPostExamReview = useCallback(
  (questionId?: string) => {
    const nextSummary = pendingExamSummary ?? input.summary;
    if (!nextSummary) return;

    if (postExamReview) {
      setPendingExamSummary(nextSummary);
      setPostExamReviewCurrentQuestionId(
        resolvePostExamReviewCurrentQuestionId(postExamReview, {
          requestedQuestionId: questionId ?? null,
          persistedQuestionId: postExamReviewCurrentQuestionId,  // ← always the last cursor
        }),
      );
      setExamResultsSubstage('post_exam_review');
      return;
    }
    if (postExamReviewLoadState.status === 'loading') return;
    void loadPostExamReview(nextSummary, {
      requestedQuestionId: questionId ?? null,
      persistedQuestionId: postExamReviewCurrentQuestionId,  // ← same story
      nextSubstageOnSuccess: 'post_exam_review',
    });
  },
  [...],
);
```

Both branches (cached payload, fetch-on-demand) pass `postExamReviewCurrentQuestionId` as the fallback cursor. The Session Summary's `Review Answers` button calls this handler **without** a `questionId`, so `requestedQuestionId` is `null` and `persistedQuestionId` wins.

### The cursor resolver uses persisted-first when nothing is requested

`resolvePostExamReviewCurrentQuestionId()` resolves in this order:

1. `requestedQuestionId` if present and available
2. `persistedQuestionId` if present and available
3. First available row
4. First row

So when `Review Answers` fires with no `questionId`, the cursor lands on whatever `postExamReviewCurrentQuestionId` was at the moment you left review.

### `onViewSummary()` does not reset the cursor

`app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.ts:185-190`:

```ts
const onViewSummary = useCallback(() => {
  const nextSummary = pendingExamSummary ?? input.summary;
  if (!nextSummary) return;
  setPendingExamSummary(nextSummary);
  setSummary(nextSummary);
}, [input.summary, pendingExamSummary, setSummary]);
```

It flips the substage back to summary but never touches `postExamReviewCurrentQuestionId`.

### The view reads that cursor and derives footer buttons from it

`app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:40-52`:

```ts
const currentRow =
  review.rows.find((row) => row.questionId === currentQuestionId) ??
  review.rows[0] ??
  null;
const currentIndex = currentRow
  ? review.rows.findIndex((row) => row.questionId === currentRow.questionId)
  : -1;
const previousRow =
  currentIndex > 0 ? (review.rows[currentIndex - 1] ?? null) : null;
const nextRow =
  currentIndex >= 0 && currentIndex < review.rows.length - 1
    ? (review.rows[currentIndex + 1] ?? null)
    : null;
```

And the footer at `post-exam-review-view.tsx:170-186`:

```tsx
{nextRow ? (
  <Button onClick={...}>Next</Button>
) : (
  <Button onClick={onViewSummary}>Finish review</Button>
)}
```

`PostExamReviewView` receives no entry-context signal. It has no way to know whether this is the initial post-submit entry or a `Review Answers` re-entry. Footer labels are pure functions of the cursor, so the "missing Next button" is a direct consequence of the cursor having stayed where the user last left it.

### Why clicking a navigator pill "fixes" it

`post-exam-review-view.tsx:55-58`:

```ts
const navigateToQuestion = (questionId: string) => {
  shouldRestorePanelRef.current = true;
  onNavigateQuestion(questionId);
};
```

Clicking a pill calls `onNavigatePostExamReviewQuestion(questionId)` (`use-practice-session-exam-results-continuity.ts:168-171`), which updates `postExamReviewCurrentQuestionId` directly. That moves the cursor to a non-last row, `nextRow` becomes defined, `Next` renders again. So the user's experience — "Next disappeared, then came back when I clicked around" — is fully explained by the cursor mechanics, not by any rendering glitch.

---

## Is it in the user's head?

**No.** The behavior is real, reproducible, and traceable to specific lines of code. It has been shipped since DEBT-350 (2026-04-08) and was documented in `docs/_archive/brainstorming/bs-063-exam-review-reentry-state-confusion.md` on 2026-04-11. This debt item promotes that brainstorm to a formal decision doc so it can be scheduled and shipped.

---

## Why it reads as a bug even though the code is consistent

Three compounding factors:

1. **"Review Answers" sells a fresh pass.** The CTA wording does not say "Resume review." A student who has just been told "exam complete, score 67%" and clicks `Review Answers` expects to start walking from Q1, not land in the middle of the list.
2. **The cursor is invisible.** There is no UI marker that persists between Summary and re-entry to say "you are about to re-enter at Q3." The navigator pill highlights the current row, but only after the view has already rendered.
3. **`Finish review` is a terminal-looking label.** It signals completion. When you click `Finish review` and then return via `Review Answers`, it feels contradictory to land on the question you already "finished."

The current behavior is defensible as "resume where you left off" — it just is not what the CTA promises.

---

## Proposed decision (recommended)

**Decision: reset the cursor on untargeted `Review Answers` re-entry.**

Concrete shape of the change:

- In `onReenterPostExamReview(questionId?)`, when `questionId` is not supplied, pass `persistedQuestionId: null` (or simply do not pass it) so `resolvePostExamReviewCurrentQuestionId` falls through to "first available row."
- Keep the targeted path unchanged: clicking a specific breakdown row in the summary should still land on that row. That path is already wired today through `renderPracticeSessionExamResults()` → `SessionSummaryView` → `SessionBreakdownList` (`app/(app)/app/practice/[sessionId]/components/practice-session-exam-results-renderer.tsx:52-63`, `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx:104-112`, `app/(app)/app/shared/components/session-breakdown-list.tsx:38-49`).
- No change to `PostExamReviewView` labels.
- No change to `onViewSummary()` — leaving review to go see the summary does not need to reset the cursor; only the re-entry path does.

### Why this and not "add an entry-source prop and change labels"

BS-063 suggested two alternatives: reset the cursor, or thread an `entrySource` prop through `PostExamReviewView` and change labels on re-entry (`Finish review` → `Back to Summary`, etc.). Resetting the cursor is strictly smaller:

- One hook change, no view-layer prop plumbing.
- No new label copy decisions, no DEBT-359 coordination.
- Restores Q1-first semantics for "Review Answers," which is the common case.
- If product later wants contextual labels too, that is an additive follow-up, not blocked by this change.

The entry-source alternative is still a valid future move if label ambiguity turns out to be a separate complaint. It should not be bundled here.

### Behavior change assessment

Yes, this is a behavior change. Users who relied on "resume where I left off" from `Review Answers` will now always start at Q1 on untargeted re-entry. Given the CTA wording and the fact that the targeted (breakdown-row) path is unchanged, this is the intended semantics, not a regression.

---

## Implementation scope

- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.ts` — both branches of `onReenterPostExamReview` (cached-payload branch and fetch-on-demand branch) must stop passing `postExamReviewCurrentQuestionId` as `persistedQuestionId` when `questionId` is undefined.
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.browser.spec.tsx` — re-entry cursor contract needs updated expectations (several tests currently assert "re-entry keeps `q2`" per the preserved-cursor behavior). These assertions will flip.
- `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.test.tsx` — add targeted unit coverage for "untargeted re-entry resets to first available row" and "targeted (with questionId) re-entry still honors the requested row."
- `tests/e2e/practice.spec.ts` — add an E2E scenario that walks Submit → Finish review → Review Answers and asserts the footer shows `Next` (not `Finish review`) on re-entry, confirming Q1 cursor.
- `docs/practice-engine/interaction-contracts.md` — section on re-entry behavior needs updating so the shipped contract matches the new Q1-reset semantics.
- `docs/_archive/brainstorming/bs-063-exam-review-reentry-state-confusion.md` — add a pointer to DEBT-364 as the promoted debt item.

---

## Paths deliberately not taken

- **Always reset on `onViewSummary()`.** Resetting when the user clicks `View Summary` would feel punitive — they are leaving for a second and expect to resume where they were if they tap `Review Answers` again. Scope the reset to the re-entry handler only.
- **Reset on both targeted and untargeted re-entry.** Targeted breakdown-row clicks are explicit — the user picked a question. Overriding that to Q1 is worse than the current behavior. Keep targeted re-entry honoring `requestedQuestionId`.
- **Change `Finish review` to `Back to Summary` on re-entry.** Legitimate label-clarity fix, but that is a DEBT-359-adjacent copy question. Do not bundle with the state fix.
- **Add a persisted-across-refresh cursor.** Out of scope. This debt is about the in-session loop, not session-restore from cold boot.

---

## Adjacency list (load-bearing before merging)

- **Focus restoration on re-entry.** The existing `useEffect` in `PostExamReviewView` calls `focusElementWithoutScroll(panel)` + `panel.scrollIntoView({ block: 'start' })` when `shouldRestorePanelRef.current` is true. Navigating on re-entry currently does not set `shouldRestorePanelRef` — it only gets set by explicit navigator clicks. Verify that resetting the cursor to Q1 on re-entry still lands the user at the top of the panel (initial entry already does this correctly; this change should behave the same way).
- **`postExamReviewCurrentQuestionId` consumers downstream.** The hook exports this value to the page view. Grep for its consumers to confirm no downstream code treats it as "last viewed" in a way that breaks when it resets to first available on re-entry.
- **Summary breakdown row re-entry.** Must continue to honor the clicked row — this path already passes `questionId` explicitly, so the untargeted-reset change should not affect it. Add a regression test anyway.
- **Browser back-forward restoration.** Pressing browser back from Summary to post-exam review should not be affected by this change (that path goes through router, not `onReenterPostExamReview`). Verify during manual walk.

---

## Relationship to prior work

### DEBT-350 (archived)
Introduced the Summary ↔ post-exam-review loop with `examResultsSubstage` and the preserved `postExamReview` payload. The cursor-preservation behavior is a side effect of that design, not an explicit decision. DEBT-364 corrects the cursor semantics without undoing DEBT-350's substage model.

### DEBT-316 (archived)
Added the `Review Answers` CTA to Session Summary. That work established the entry point but did not specify cursor behavior on re-entry. This debt item fills that gap.

### DEBT-359 (archived)
Renamed `Review your answers` → `Review Answers` and `Back to Practice` → `New Session`. This debt item assumes those labels are stable. If product later wants `Finish review` → `Back to Summary` on re-entry, that is a DEBT-359 follow-up, not part of this work.

### DEBT-326 (archived)
Established focus management on post-exam review mount/navigation. Verify the focus contract still holds after the cursor reset; no code change to the focus effect is expected.

### DEBT-363 (open, Concern 2)
Unrelated. DEBT-363 is about `Finish exam` + `Review & Submit` dual CTAs during the active exam stage. DEBT-364 is about the post-submit review re-entry cursor. Different surfaces, different problem.

---

## Severity rationale

**P2** — user-trust erosion in a primary flow.

- Flow is functionally recoverable (navigator pills work).
- But the review surface looks broken on re-entry, which compounds with DEBT-363 Concern 2 to make the whole exam flow feel less intentional than it is.
- Not P1 (no data loss, no blocker).
- Not P3 (more than cosmetic — affects perceived correctness of the review flow).

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | BS-063 brainstorm drafted | Initial audit of the Summary ↔ post-exam-review cursor semantics and label staticness. |
| 2026-04-17 | Reproduced on `main` @ `d5705b74` during manual walkthrough | User reported "missing Next button" on the last screenshot — traced to sticky cursor on re-entry, not a rendering bug. |
| 2026-04-17 | Promoted BS-063 to DEBT-364 | Decision warranted a formal debt item so it shows up in the register and stops getting lost in `docs/brainstorming/`. |
| 2026-04-17 | Leaning "reset to Q1 on untargeted re-entry" | CTA wording (`Review Answers`) sells a fresh pass; preserving cursor contradicts that promise. Targeted breakdown-row re-entry keeps `requestedQuestionId` semantics. Decision not yet locked — see "Open decisions." |
| 2026-04-17 | **Locked: reset cursor to first available row on untargeted re-entry** | Independent Chrome-agent UX audit on 2026-04-17 confirmed Finding B (re-entry lands on last-viewed question, Next appears missing). Reset is the smallest fix that matches the CTA's promise. Ship independently from DEBT-363 Concern 2 with both hook-unit and E2E coverage. |

---

## Open decisions

| # | Decision | Status |
|---|----------|--------|
| 1 | Reset cursor on untargeted re-entry vs preserve | **Locked 2026-04-17 → Reset to first available row on untargeted re-entry** |
| 2 | Ship with an E2E regression test or unit-level only? | **Locked 2026-04-17 → E2E + unit. Hook-level unit test for the resolver branch; E2E test for the full Summary → Review Answers loop.** |
| 3 | Bundle with any DEBT-363 Concern 2 work, or ship independently? | **Locked 2026-04-17 → Ship independently. DEBT-363 Concern 2 (drop header button) and DEBT-364 (cursor reset) touch different files and different concepts; bundling creates review burden without coherence benefit.** |

### Locked decision — Reset cursor to first available row on untargeted re-entry

Concrete implementation shape:

- In `onReenterPostExamReview(questionId?)` — both branches (cached payload and fetch-on-demand) — when `questionId` is undefined, pass `persistedQuestionId: null` instead of `postExamReviewCurrentQuestionId`.
- Targeted re-entry (breakdown-row click from Session Summary, which passes an explicit `questionId`) remains unchanged.
- No new `entrySource` prop threaded into `PostExamReviewView`. No label changes. Strictly a cursor-semantics fix.
- Add one hook unit test: "untargeted re-entry resets to first available row, targeted re-entry honors requested row."
- Add one E2E test: "Submit → Finish review → View Summary → Review Answers lands on Q1 with Next visible in the footer."

**Rationale:** `Review Answers` CTA wording sells a fresh pass, not "resume review." Independent Chrome-agent UX audit on 2026-04-17 confirmed the sticky-cursor re-entry pattern produces the false "missing Next button" perception (Finding B). Reset is the smallest possible fix — one hook change, no view-layer prop plumbing, no new copy decisions.

**Concern status: implementation-ready.** Code path is fully understood, decisions are locked, tests are scoped.

---

## Sources consulted

- `docs/_archive/brainstorming/bs-063-exam-review-reentry-state-confusion.md` (2026-04-11) — original audit
- `docs/practice-engine/interaction-contracts.md:282` — shipped re-entry contract
- `docs/_archive/debt/debt-350-exam-results-session-continuity.md` — origin of the Summary ↔ review loop
- `docs/_archive/debt/debt-316-exam-post-submit-review-flow.md` — origin of the `Review Answers` CTA
