# DEBT-493: Learner Scores and Labels Do Not Reflect Content Changes

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** In Progress — increment 1's parts A (Decision 2), B (the availability value) and C (labels and notices), and increment 2's steps 1–2 (the scored-total reader, history scores), fixed in code 2026-10-03; increment 2 revised the same day for the amended rule (DEBT-494) ([Progress](#progress)); the rest open
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

- **A race in the contract's test, found by promotion CI (2026-10-03).** Promotion #1335 failed: the real-Postgres contract lifted its hold with the client clock (`new Date()`, millisecond precision). Within the placement's millisecond, the lift sorted before the database's microsecond `placed_at`, and `question_holds_lifted_after_placed_chk` refused it. It passed locally by chance. The test now takes the lift time from the row (`placed_at + interval '1 second'`). The fixed file passed fifteen consecutive local runs, and a one-off probe confirmed that a client-clock lift in the placement's millisecond is refused. Production code was unaffected: the hold command lifts with the database's clock. #1335 was closed unmerged, and the parts are promoted after the fix.

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

**Increment 2, step 1: the reader accepts a scored total, 2026-10-03.** Decision 3 changes a session's score to count only its scored items, so the end and finalize outputs gain `totals.scored`. Those outputs are cached by idempotency key for 24 hours under strict schemas, so the reader comes first (`docs/dev/deployment-procedure.md`, keyed-action output compatibility).
- `EndPracticeSessionOutputSchema`, and so `FinalizeExamAnswersOutputSchema`, accept an optional `scored`. When it is present, it is at most the question count, and `correct` is at most it.
- Both cached shapes parse, today's and the next writer's. Two targeted mutations, one per bound, each fail a case.
- **This step must be in production before the writer ships.** The writer's replay parser then reads a row cached without `scored` as every item counting, which is what the earlier writer computed.
- The plan for the remaining steps is: history scores, then dashboard accuracy, then the session summary's writer, then Review & Submit with Decision 5's sentence. That sentence is true only once all three scores exclude the item.

**Increment 2, step 2: history scores, 2026-10-03.** A completed session's history score counts only its scored items.
- **The rule.** In the domain, `countsTowardScore` (available, and from increment 4 an unchanged key) and `computeSessionScore`, shared by every score.
- **History.** The history summary returns `scored` (items whose question is published when read) and `scoredCorrect`, in place of `correct`. Accuracy is `correct / scored`.
  - History and the Dashboard's recent sessions show `correct/scored`, "—" when nothing is scored, and Pattern Registry F-13's disclosure when items are left out.
  - The singular form, "1 question isn't scored", was decided here; the ADR gives only the plural.
- **The second fake↔real contract.** `session-history-score-contract.ts` runs three scenarios against the fake and the adapter on real Postgres.
- **Cost.** On the local integration database, 50 completed sessions of 20 items, a 20-row page, median of five warm `EXPLAIN (ANALYZE)` runs: 1.075 ms before, 1.407 ms after.
- **Evidence.** Twelve targeted mutations each fail a case, across the adapter, the fake, the use case, the History and Dashboard views, the disclosure and the domain rule.

**Increment 2 revised: the amended scoring rule, 2026-10-03.** [DEBT-494](./debt-494-read-time-scores-owner-confirmation.md#decision--2026-10-03) amends Decision 3 ([ADR-022 Amendment](../adr/adr-022-learner-scores-and-labels-when-content-changes.md#amendment--2026-10-03)). An item counts when the learner had a fair chance at it, recorded when its session ends, and its content is not now in doubt: withdrawn, under review or, from increment 4, key-corrected. Retired questions keep counting.
- **What changes.** History scores, released in step 2, exclude retired questions; they will count them again. Dashboard accuracy and the session summary's writer were built on step 2's rule and were not shipped; they move to the amended rule first.
- **The revised steps:**
  1. **Record the fair chance when a session ends.** A nullable column on each session item, written by the statement that ends the session, for end and finalize alike. Sessions that already ended are recorded once, by the migration, from the bank as it stands when it runs. Nothing reads it yet.
  2. **History and dashboard on the amended rule.** The disclosure names the new reason: "N questions aren't scored: withdrawn, under review, removed mid-session, or their answer was corrected."
  3. **The session summary's writer** on the same rule, with the post-exam header.
  4. **Review & Submit and the active session's notice** (increment 3 and part E). "It won't count toward your score." shows only where it is true.
  5. Increment 4 adds key corrections to the in-doubt half.

**Increment 2 revised, step 1: the fair chance is recorded when a session ends, 2026-10-03.** Nothing reads it yet.
- **Domain.** `hadFairChanceAtEnd`: an item's question is available when the session ends or, in tutor mode, the learner had already answered it. Session items carry `fairChanceAtEnd`, null while the session is active, or for one ended in the deploy window before the writer served.
- **Storage.** Migration 0050 adds the nullable `practice_session_question_states.fair_chance_at_end`. An earlier session's past availability is not kept, so 0050 records sessions that already ended once, from the bank as it stands when it runs. Once scores read it, those sessions keep the scores they show, except that a tutor answer on a question retired before then counts again ([DEBT-494](./debt-494-read-time-scores-owner-confirmation.md#consequences-and-cost-verified--2026-10-03)). Null remains only while a session is active, or for one that ends in the window before the new code serves, and reads as a fair chance.
- **Writer.** The adapter ends a session and records every item in one statement, two data-modifying CTEs, so the record commits with the end whether `end` runs alone or inside finalize's transaction. The concurrency test that interleaves a competing end now hooks that statement.
- **Contract.** `session-end-fair-chance-contract.ts` runs a tutor and an exam scenario against the fake and the adapter on real Postgres: nothing is recorded while active, and the ended session and a fresh read agree.
- **Evidence.** Ten targeted mutations each fail a case, across the SQL, the row mapper, the fake and the domain rule. The backfill is a marked block executed against arranged rows, twice, in `session-fair-chance-backfill.integration.test.ts`.

**Increment 2 revised, step 2: history and dashboard on the amended rule, 2026-10-03.**
- **The rule.** The domain's `countsTowardScore` counts an item when its recorded fair chance is not false and its content is not in doubt (`contentInDoubt`: withdrawn or under review; a question that no longer exists, too). Its SQL twin, `countsTowardScoreSql`, is shared by both queries; it reads the hold and withdrawal overlay only for a question not published.
- **History** (released in step 2 under the earlier rule) counts a retired question again. It leaves out an item without a fair chance, even once its question returns.
- **Dashboard accuracy** ships for the first time, on the amended rule. Total answered, answered in seven days and the streak still count every answer. An attempt in a session reads its item's recorded fair chance; an attempt outside a session had one.
- **Disclosure.** "N questions aren't scored: withdrawn, under review, removed mid-session, or their answer was corrected." Retirement is no longer a reason.
- **Contracts.** The history score runs four scenarios and the attempt score six, on the fakes and real Postgres. Retired questions keep counting, withdrawn and held ones do not, a hold lifted before retirement leaves no doubt, and an item with no fair chance is left out even once its question returns. The fake session repository now takes each question's state (`availabilityByQuestionId`) in place of a set of unpublished ids, so a test can change the bank between a session's end and the read.
- **Cost.** On the local integration database, a learner with 2,000 answers over 300 questions, 20 of them retired and 10 withdrawn, median of 40 warm `EXPLAIN (ANALYZE)` runs: the dashboard's all-time read takes 2.31 ms and its seven-day read 0.73 ms, against 0.29 ms and 0.08 ms for the correct counts it replaces. It runs both once per load.
- **Evidence.** Seven targeted mutations of the SQL each fail a real-Postgres case: the withdrawal and hold checks, the lifted-hold filter, the fair-chance default, the history's fair-chance column, and the dashboard's join to its session item. Twelve more across the domain, the fakes and the use case each fail a unit case.

## Verification

- **Labels.** A withdrawn, a held and a retired question each show their own label and notice, a caution for the first two and a neutral notice for a retired one, on every surface a learner who answered them sees. When a hold lifts, a question the active release publishes is Available again.
- **Exposure.** An unanswered exam item that becomes unavailable reveals no content.
- **Scores.** Session accuracy, the post-exam header, history and dashboard accuracy count an item only when the learner had a fair chance at it, recorded when its session ends, and its content is not now in doubt: withdrawn, under review or, for an answered item, key-corrected (ADR-022 Amendment). Retiring a question changes no past score. A hold lifted after the session ends restores only an item that had a fair chance; a lift before the end gives the item its chance only if its question is available again when the session ends. Activity counts are unchanged.
- **The submit warning** counts only scored items.
- **Key corrections.** A key-corrected attempt shows the correction notice, is unscored, and its question appears in the Incorrect filter. A wording-only revision keeps F-12 and stays scored.
- **Real Postgres.** An integration case finalizes an exam containing a withdrawn item end to end; none exists today.
- **Mutations.** Removing each derivation or exclusion fails a case.

## Related

- [ADR-022](../adr/adr-022-learner-scores-and-labels-when-content-changes.md): the decisions.
- [ADR-021](../adr/adr-021-question-revisions-and-content-releases.md): immutable revisions.
- [DEBT-484](../_archive/debt/debt-484-question-rewrite-history-identity.md) and [BUG-317](../_archive/bugs/bug-317-content-release-documentation-overclaims.md): the deferred decisions this record executes.
- [DEBT-494](./debt-494-read-time-scores-owner-confirmation.md): the decision that amends Decision 3, so past scores change only when content validity changes.
