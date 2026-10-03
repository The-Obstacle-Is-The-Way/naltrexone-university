# DEBT-493: Learner Scores and Labels Do Not Reflect Content Changes

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — increment 1's parts A (Decision 2), B (the availability value) and C (labels and notices) fixed in code 2026-10-03 ([Progress](#progress)); the rest open
**Priority:** P1
**Date:** 2026-10-03
**Resolved:** —
**Verification receipts:** —

---

## Summary

[ADR-022](../adr/adr-022-learner-scores-and-labels-when-content-changes.md) decides how a learner's scores and labels follow content changes. Today they don't:
- **Labels.** A question held for clinical review, one retired, and one withdrawn as unsafe all read "withdrawn".
- **Exams.** An exam item withdrawn mid-session is scored, even when the learner could not change or answer it.
- **Exposure.** An unanswered exam item that is later withdrawn reveals its possibly unsafe content.
- **Key corrections.** A corrected answer key leaves stored grades misleading, and they drive the "Incorrect" practice filter.

This record implements ADR-022's six decisions.

**Live.** Withdrawals happen in production today through the withdrawal command. Holds and release removals become possible with the production bootstrap.

## Evidence

Investigated read-only on 2026-10-03, against `main` at `94b3b87a`. The full findings are in ADR-022's Context. In brief:
- **Availability is a single test.** It is `questions.status !== 'published'`, in about eleven places (`get-question-for-view.ts`, `get-next-question.ts`, `get-practice-session-review.ts`, `get-completed-session-questions-with-feedback.ts`, `get-previous-attempt.ts`, `get-attempted-questions.ts`, `get-user-stats.ts`, `submit-answer.ts`, and others). No runtime code reads `question_withdrawals` or `question_holds`.
- **Finalization ignores availability.**
  - `finalize-exam-answers.ts` grades a saved draft against the bound revision.
  - It records an undrafted item as omitted and incorrect.
  - `practice-session-summary.ts` computes accuracy as `correct / questionCount` over every item.
- **Statistics ignore it too.** `drizzle-attempt-repository.ts` counts every attempt with no availability filter (`countWhere`, the streak query).
- **Grades are stored and never recomputed.** Every read path (reviews, summaries, history, dashboard, and the Incorrect filter in `drizzle-question-repository.ts`) uses the stored grade.
- **The update notice is undifferentiated.** F-12's `isCurrentRevision` flag fires for any revision change.
- **Inconsistencies found along the way:**
  - Review & Submit warns that withdrawn unanswered items "will be scored as incorrect".
  - The post-exam navigator labels a withdrawn item, but the standalone review navigator doesn't.
  - Bookmarks use a third wording.
  - The History attempted list drops unavailable questions once a difficulty or tag filter is applied.

## Impact

- **Learners are penalized** for flawed or unsafe content they could not change.
- **A learner who learned a wrong key is never prompted to re-learn it,** and one who was right is told they were wrong.
- **A held question looks permanently withdrawn,** and its label vanishes silently when the hold lifts.
- **Possibly unsafe content is revealed** to a learner who never answered it.

## Resolution

In increments, each test-first.

1. **Availability.**
   - Add a domain value `available | withdrawn | under_review | retired`, derived in the question repository from `status`, withdrawals and unlifted holds, with ADR-022's precedence. Mirror it in `FakeQuestionRepository` and its contract scenario.
   - Replace the boolean "withdrawn" in every use-case output and UI branch with the value, and apply ADR-022's labels and notices.
   - Reveal content only to a learner who answered (Decision 2).
   - Revise Pattern Registry F-11.
2. **Scoring.**
   - Apply Decision 3 to session accuracy, the post-exam header, history session scores, and dashboard accuracy (overall and seven-day).
   - Leave activity counts (total answered, streak) unchanged.
   - Add the disclosure line.
   - Measure the aggregate queries' cost before and after on the integration database.
3. **Exams.** Apply Decision 5: the active notice's added sentence, navigator and Review & Submit labels, and a submit warning that counts only scored items.
4. **Key corrections.**
   - Derive *key-corrected* by comparing the correct choice of the attempt's revision with the current revision's (Decision 4).
   - Exclude it from scores.
   - Show the distinct notice in place of F-12's.
   - Include the question in the Incorrect filter.
   - Revise Pattern Registry F-12.
5. **Consistency.** One label on every surface, bookmarks included, and unavailable attempted questions kept under History filters.

## Progress

**Increment 1, part A — Decision 2, 2026-10-03.** An unavailable question's content now shows only to a learner who answered it, using today's status-based availability. It needed no new type, and it closed a live exposure, so it shipped first.
- **The leak.** Six reads revealed an unavailable question's content on an omitted attempt (an exam item left unanswered and finalized as omitted):
  - `get-previous-attempt.ts` returned the key and explanation, with no availability check at all;
  - `get-question-for-view.ts` and `get-completed-session-questions-with-feedback.ts` counted any attempt as "attempted";
  - `get-practice-session-review.ts` counted the omitted item's recorded answer time;
  - History and the Dashboard listed the omitted attempt's stem.
- **The fix.** Each read now requires an answer: a selected choice. History's attempt listing reports `isOmitted` (adapter and fake, each tested). An omitted attempt on a question still published is unchanged.
- **Evidence.**
  - A red unit case per read, and cases that an answered attempt still reveals and that a published question stays visible.
  - A real-Postgres case finalizes an exam with an unanswered item, withdraws the question, and asserts that none of the six reads reveals its stem, key or explanation. It is the first integration case to finalize an exam containing a question withdrawn since.
  - Each read's fix was red first. Six further targeted mutations each fail a case, two of them only after the published-question cases were added.
- **Suites split.** The completed-feedback and History suites were at the 800-line limit, so their content-change and filter cases moved, unchanged, to their own files.

**Increment 1, part B: the availability value, 2026-10-03.** Additive: nothing reads it yet.
- **Domain.** `QuestionAvailability` (`available | withdrawn | under_review | retired`) and `deriveQuestionAvailability`, with ADR-022's precedence. Every `Question` carries `availability`.
- **Adapter.** `DrizzleQuestionRepository` reads the overlay only for bound questions that are not published, so a read of published questions costs no extra query. It reads withdrawals by their key, and unlifted holds through the question's revisions, since holds have no index that leads with the question.
- **Fake.** `FakeQuestionRepository` takes the overlay as the tables hold it: withdrawal rows, and holds with a `lifted` flag.
- **Contract.** There was no fake↔real contract for the question repository, only a dated waiver. `question-availability-contract.ts` now runs nine scenarios against both, the adapter on real Postgres, reading each question through both of its revisions. The register cites it.
- **Evidence.** The precedence table, and the contract on both sides. Five targeted mutations each fail a scenario: the adapter skipping the overlay, counting lifted holds or ignoring the overlay, and the fake counting lifted holds or ignoring withdrawals.

**Increment 1, part C: labels and notices, 2026-10-03.** The boolean "withdrawn" is replaced by availability on every review and list output, and each surface shows ADR-022's label and notice.
- **Outputs.** Rows from the completed-session feedback, the session review, History and the Dashboard, and the question view's DTO, carry `availability` in place of `withdrawn`.
  - A row that shows content carries the question's state.
  - A row that shows none (an item the learner never answered) carries the state for its label, or `null` when the question no longer exists.
  - Each read decides availability from that value, not from `status`.
- **Notice.** `QuestionAvailabilityNotice` owns the labels, headings and notices.
  - Withdrawn and under-review notices are cautions, in the warning-tinted inline status card the unanswered reveal already uses.
  - A retired question's notice is neutral.
  - An item never answered gets the heading alone.
- **Surfaces.**
  - The standalone review and post-exam review show the notice.
  - History, the Dashboard and the session breakdown show the label, or the heading for an item never answered.
  - The navigators and the Review & Submit list name the state.
  - History no longer capitalizes a label.
- **Not yet.** The active session's notice (part E, with Decision 5's sentence), Review & Submit's scoring warning (increment 3), and bookmarks (increment 5).
- **Evidence.** Cases for each state on each surface, and for the notice's tones and label-only form. The UI changes were written before their cases, so fifteen targeted mutations, reverting each UI and output change in turn, confirm that each case fails without its change. Pattern Registry F-11 is rewritten to match.

## Verification

- **Labels.** A withdrawn, a held and a retired question each show their own label and notice, a caution for the first two and a neutral notice for a retired one, on every surface a learner who answered them sees. When a hold lifts, a question the active release publishes is Available again.
- **Exposure.** An unanswered exam item that becomes unavailable reveals no content.
- **Scores.** Session accuracy, the post-exam header, history and dashboard accuracy exclude unavailable and key-corrected items, and include an item again when a hold lifts and its question is published, unless its key was corrected. Activity counts are unchanged.
- **The submit warning** counts only scored items.
- **Key corrections.** A key-corrected attempt shows the correction notice, is unscored, and its question appears in the Incorrect filter. A wording-only revision keeps F-12 and stays scored.
- **Real Postgres.** An integration case finalizes an exam containing a withdrawn item end to end; none exists today.
- **Mutations.** Removing each derivation or exclusion fails a case.

## Related

- [ADR-022](../adr/adr-022-learner-scores-and-labels-when-content-changes.md): the decisions.
- [ADR-021](../adr/adr-021-question-revisions-and-content-releases.md): immutable revisions.
- [DEBT-484](../_archive/debt/debt-484-question-rewrite-history-identity.md) and [BUG-317](../_archive/bugs/bug-317-content-release-documentation-overclaims.md): the deferred decisions this record executes.
