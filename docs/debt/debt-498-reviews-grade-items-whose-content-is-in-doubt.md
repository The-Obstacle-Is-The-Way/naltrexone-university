# DEBT-498: Reviews Grade Items Whose Content Is in Doubt

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — the answer views are ungraded (increment 1, 2026-10-05); the lists follow ([Progress](#progress))
**Priority:** P1
**Date:** 2026-10-05
**Resolved:** —
**Verification receipts:** —

---

## Summary

[ADR-022](../adr/adr-022-learner-scores-and-labels-when-content-changes.md) leaves an item out of every score when its content is in doubt: its answer key was corrected after the learner answered, it was withdrawn, or it is under review. The reason given is that such an item "should neither penalize nor credit the learner". The pages that show the attempt still grade it.

The review of a key-corrected attempt shows the caution first: "The answer to this question was corrected after you answered. This attempt isn't scored." Below it, the page grades the attempt against the superseded key:
- the old keyed choice is highlighted green;
- a green "Correct" badge is shown;
- the superseded explanation argues for the old answer.

A learner who skims past the caution re-learns the superseded answer from the strongest signals on the page. The page also contradicts itself: "This attempt isn't scored." sits above "Correct". A learner who chose what is now the right answer is told "Incorrect", in red.

## Evidence

Investigated on 2026-10-05 against `main` at `25c4748b`. The screenshots come from DEBT-496's spec, `tests/e2e/content-change-notices.spec.ts`, run locally on 2026-10-05.

- **Standalone review** (`app/(app)/app/questions/[slug]/question-page-client.tsx`). After the notice, the page renders:
  - `QuestionCard` with the graded revision's `correctChoiceId`, styled as correct;
  - `Feedback` with the stored `isCorrect`, which renders the "Correct" or "Incorrect" badge and the graded revision's explanation.

  The `key-corrected-review` screenshot shows the old key, "Choice B", in green, the "Correct" badge and "Explanation" under the caution.
- **Withdrawn and under-review reviews.** These follow the same path. The caution says "Its answer or explanation may change, so don't rely on them until it returns.", and a green "Correct" follows it (`under-review-review` screenshot). The withdrawn caution says the answer "may be inaccurate or outdated", with the same grade below.
- **Post-exam review.** `post-exam-review-view.tsx` passes the stored grade to `Feedback`. Its navigator, `exam-review-view.tsx`, gives every row a Correct or Incorrect badge (`ReviewCorrectnessBadge`), including rows in doubt. A withdrawn or held row adds its state to its accessible name; a key-corrected row carries only its stored Correct or Incorrect badge, with no marker of the correction.
- **History** (`history-questions-tab.tsx`, `getResultBadge`). Each row shows its latest stored grade in green or red, and a key-corrected attempt carries no marker. The Correct result filter lists a key-corrected attempt as correct, because `buildAttemptedQuestionsConditions` in `drizzle-attempt-repository.ts` filters on the stored `isCorrect`.
- **Active tutor session** (`practice-view.tsx`). After a key correction made during the session, the caution says the session shows the earlier version and the answer won't be scored. The feedback then grades the answer against the earlier key.
- **Why it was missed.** ADR-022 Decision 4 lists two remedies for a key-corrected attempt: a distinct notice, and inclusion in the Incorrect practice filter. Pattern Registry F-12 names the risk, "Without the notice, a review would present the old key as correct", and answers it with the notice alone. No decision covered the grade the page still renders under the notice. DEBT-496's screenshots made it visible.

## Impact

A learner preparing for a clinical board examination can re-learn an answer the bank has corrected, or rely on content the bank has withdrawn or put under review. The page's own copy says not to do either. The cost is clinical. The likelihood grows with every key correction, withdrawal and hold once content is live.

## Options

1. **Keep the caution alone** (today's behavior). Rejected: color and the outcome badge are the strongest signals on the page, and they contradict the copy beside them.
2. **Hide an in-doubt attempt's content,** as Decision 2 does for an item the learner never answered. Rejected:
   - it erases the learner's own record, which Decision 2 deliberately keeps for answered items;
   - it departs from the erratum principle ADR-022 adopts: mark the record, don't erase it.
3. **Show the corrected answer on the old review.** Rejected:
   - the two revisions' choices differ, so the learner's choice may not exist in the current revision;
   - mixing revisions on one page breaks ADR-021's binding of an attempt to its revision;
   - it hands over the corrected answer, where Decision 4 has the learner re-practice it (the link and the Incorrect filter).
4. **Do not grade what is not scored.** Wherever an item's content is in doubt, by the same predicate the score uses, the page shows the record ungraded. Recommended.

## Resolution (decided)

Option 4, under the owner's delegation of 2026-09-28. A score and a page then say the same thing about an item: what the score leaves out, the page does not grade.

1. **The outcome reads "Not scored"** in place of Correct or Incorrect, in a neutral tone, on every surface above:
   - the review's `Feedback`;
   - the post-exam navigator;
   - History's row badge;
   - an active tutor session's feedback.
2. **Choices keep the learner's selection** and lose the success and destructive styling. The choice keyed in the revision answered gets a neutral label.
3. **Key-corrected attempts:**
   - the old key is labelled "Answer before the correction";
   - the superseded explanation is not shown, since it argues for that answer;
   - the caution's link, "Practice the corrected question", remains the way to the corrected answer.
4. **Withdrawn and under-review attempts** keep their keyed answer and explanation, labelled, under the existing caution. This preserves Decision 2, which shows content to the learner who answered.
5. **History's result filters** match what each row shows: an item in doubt appears under neither Correct nor Incorrect. Re-practice of a key-corrected item stays with the Incorrect practice filter (Decision 4).
6. **Order of work:** ADR-022 gains an amendment, and Pattern Registry F-11, F-12 and the outcome badge record the ungraded form, before the code changes ("never invent UI patterns"). History rows gain the key-correction flag, which the attempt repository already computes for the Incorrect filter.

## Progress

**Correction to the Evidence, 2026-10-05.** As filed, the Evidence also said an omitted item in doubt reads "No answer selected. This question was scored incorrect." It does not. An item the learner did not answer shows only its state's label once it is no longer available (Decision 2: `GetCompletedSessionQuestionsWithFeedback` returns it unavailable). So the omitted-item card appears only for a question still available, which is scored. The claim and its resolution item are removed.

**Increment 1: the answer views, 2026-10-05.** The design records came first:
- ADR-022 gains its 2026-10-05 Amendment;
- Pattern Registry adds:
  - F-1's Not scored pill;
  - I-3's ungraded choice state;
  - F-5's ungraded forms and F-8's neutral chips for them;
  - notes in F-11 and F-12.

The code:
- **The rule.** `ungradedReason` in `src/domain/services/scoring.ts` returns `key_corrected` for an answer graded on a key corrected since, `in_doubt` for a withdrawn or held question, and null otherwise. It reuses the score's `contentInDoubt`.
- **Components:**
  - `ChoiceButton` gains the `ungraded` state and a `note`;
  - `QuestionCard` gains `ungraded`, and names "Your answer" and the key;
  - `Feedback` hands an ungraded answer to `UngradedFeedback` (`components/question/feedback-ungraded.tsx`). The Reference block moves to `feedback-reference.tsx`, which both use.
- **Surfaces:**
  - the standalone review, through `QuestionSurfaceBody`, which passes the feedback's reason to the card;
  - post-exam review;
  - a tutor answer given after its key was corrected mid-session.

  A retired question keeps its grade.
- **Evidence:**
  - every case was red first;
  - ten targeted mutations each fail a test, one per wiring point, including the domain rule's two branches;
  - DEBT-496's spec asserts the ungraded key-corrected and held reviews on real pages;
  - the screenshots were viewed: "Not scored", no verdict color, "Your answer · Answer before the correction", and no superseded explanation.
- **Not done in this increment:** the post-exam navigator, the session breakdown, the Dashboard's recent activity, History's rows and its result filters.

## Verification

Criteria to meet before closing; none is met yet.

- [ ] Each surface above shows "Not scored", and no success or destructive grading, for a key-corrected, withdrawn or under-review item.
- [ ] Every scored item still shows its grade as before.
- [ ] Both are proven by red-first component tests.
- [ ] A key-corrected review shows neither the superseded explanation nor a green key.
- [ ] DEBT-496's spec asserts the ungraded review, and the History row's "Not scored".
- [ ] Removing the in-doubt check from each surface fails a test.
- [ ] Screenshots of each surface are viewed.

## Related

- [ADR-022](../adr/adr-022-learner-scores-and-labels-when-content-changes.md), Decisions 2 and 4: what a learner sees, and key corrections.
- [DEBT-493](../_archive/debt/debt-493-learner-scores-and-labels-when-content-changes.md): the notices and scores.
- [DEBT-496](../_archive/debt/debt-496-content-change-notices-route-level-proof.md): the end-to-end screenshots that showed this.
- `docs/frontend/pattern-registry.md`: F-11, F-12 and F-13.
