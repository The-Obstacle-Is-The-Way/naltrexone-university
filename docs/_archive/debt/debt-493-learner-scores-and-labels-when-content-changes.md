# DEBT-493: Learner Scores and Labels Do Not Reflect Content Changes

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Resolved — 2026-10-03 UTC; ADR-022, as amended by DEBT-494, is implemented on every surface and in production ([Verified closeout](#verified-closeout--2026-10-03-utc)). One tail is deferred: removing the replay mapping for outputs cached before the session summary's writer.
**Priority:** P1
**Date:** 2026-10-03
**Resolved:** 2026-10-03
**Verification receipts:** [Verified closeout](#verified-closeout--2026-10-03-utc)

---

## Summary

[ADR-022](../../adr/adr-022-learner-scores-and-labels-when-content-changes.md) decides how a learner's scores and labels follow content changes. Today they don't:
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

**Increment 2 revised: the amended scoring rule, 2026-10-03.** [DEBT-494](./debt-494-read-time-scores-owner-confirmation.md#decision--2026-10-03) amends Decision 3 ([ADR-022 Amendment](../../adr/adr-022-learner-scores-and-labels-when-content-changes.md#amendment--2026-10-03)). An item counts when the learner had a fair chance at it, recorded when its session ends, and its content is not now in doubt: withdrawn, under review or, from increment 4, key-corrected. Retired questions keep counting.
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

**Increment 2 revised, step 3: the session summary's writer, 2026-10-03.** The end, finalize and summary reads score a session by the amended rule, and send `totals.scored`.
- **Writer.** The summary reads each item's availability through `findByIdsForSession`, the path the availability contract already proves, so there is no new port. It counts an item when its recorded fair chance is not false and its content is not in doubt, with the domain's `computeSessionScore` and `countsTowardScore`, as History does. Answered stays every answer. An item whose question it cannot find is in doubt.
- **Reads.** End and finalize score the session as it ends, after recording each item's fair chance. The summary read scores it as the bank stands at the read, so a later withdrawal, hold or lift shows on reload. Within one page visit, the post-exam stage and its summary keep the snapshot taken at submission, so the header and the review rows beside it agree; a reload or a later visit reads the bank as it stands. End and the summary read now take the question repository; finalize already had it.
- **Cached outputs.** A summary cached before this writer is replayed with `scored = questionCount`, which is what its writer counted. The schema fills it in, so every type downstream carries a required `scored`. The reader that accepts the field (step 1 of the original plan) is in production, so a rollback to it reads this writer's rows. The mapping is removed one full 24-hour TTL after the last earlier writer left production.
- **Views.** The summary's Accuracy card and the post-exam header read "—" when nothing is scored and carry Pattern Registry F-13's disclosure. The header reads "X of scored correct".
- **Every surface agrees.** A real-Postgres case finalizes an exam over four items, with one question held before submission. The summary at submission, the summary read, History and the Dashboard score each step alike:
  - three items at submission;
  - two after a second question is held and a third retired;
  - three once both holds lift, since the item held before submission never had a fair chance.
- **Fixtures.** Existing summary fixtures carry `scored` equal to their question count: every item in them counts, as before. Two deliberately invalid fixtures keep one invalid field. The finalize cases whose question leaves the bank before submission give the session fake the same bank state, so the item is graded but not scored.

**Increment 2 revised, step 4: Review & Submit and the active notice (increment 3 and part E), 2026-10-03.** All three scores now follow the amended rule, so Decision 5's sentence is true where it is shown.
- **The prediction.** The domain's `countsIfEndedNow` says whether an active session's item would count if the session ended now: the fair chance its end would record, and its content not in doubt.
- **Review & Submit.** The review output's `scoredUnansweredCount` counts the unanswered items that would count, and the submit warning names only those. An item that would not count is listed as "Won't be scored".
- **The active notice.** An item whose question became unavailable during the session comes back as `unavailable`, with its state and `countsIfEndedNow`, in place of the `withdrawn` marker, which misnamed a held or retired question. The notice names the state: withdrawn, placed under review, or retired from the bank, "after your session began". It adds "It won't count toward your score." unless the item still counts, as a tutor answer already given on a question retired since does.
- **Evidence.** Mutations across the review count, the row marker, the warning, the marker's state and prediction, the page logic, the page view and the notice; each fails a case. Three survived the first run: a warning with unanswered but no scored items, and the prediction carried through the page logic and the page view. Cases now cover each.

**Increment 4, steps a and b: a corrected answer key leaves every score, 2026-10-03.** ADR-022 Decision 4.
- **The key.** The domain's `answerKeyChanged` compares the correct choices' labels and text between the revision an answer was graded on and the current one. Moving or rewording the correct choice changes the key; rewording the stem or a distractor does not.
- **Questions.** A question read at a revision carries `answerKeyChanged`. The adapter derives it from the current revision it already loads, at no extra query; the fake derives it from its listed revisions. A third fake↔real contract, the answer key change, runs three scenarios on both.
- **Scores.** An answered item or attempt whose graded key was corrected since is in doubt, and leaves the summary, History and Dashboard accuracy. An unanswered or omitted one has no key to correct and keeps counting. `countsTowardScore` takes `keyCorrected`. Its SQL twin tests a row's graded revision against the set of the learner's superseded revisions whose key was corrected (see the cost entry below). F-13's "their answer was corrected" is now a reason a score can give.
- **Contracts.** The history score gains a key scenario (five in all) and the attempt score two (eight in all). The second separates a reworded correct choice from a reworded distractor, which the first run of mutations showed was missing.
- **Evidence.** Seventeen targeted mutations each fail a case, across the domain rule, the adapter, the fakes, the summary and the SQL twin. Two survived the first run, the key's text and its correct-only filter, until the second attempt scenario.
- **Not yet** (step c): the review notice for a key-corrected answer, and the Incorrect filter.

**Increment 4, step c: the notice and the Incorrect filter, 2026-10-03.** ADR-022 Decision 4 is complete.
- **Outputs.** The question view, the completed-session review rows and the active session's item carry `answerKeyChanged`. A review row or question view sets it only for an answered item on an available question: an unanswered or omitted item has no answer to correct, and an unavailable question shows F-11 only. The active session's item sets it whether or not it is answered yet, since any answer given there is graded on the earlier key.
- **The notice.** `QuestionUpdateNotice` takes `keyCorrected`, which replaces the generic update with a caution, in F-11's caution card. On review: "The answer to this question was corrected after you answered." "This attempt isn't scored." and the link "Practice the corrected question". In a session: "The answer to this question was corrected after your session began." "This session shows the earlier version, so your answer here won't be scored." Post-exam review, the standalone review page and the active session page pass it. Pattern Registry F-12 gains the variant.
- **The Incorrect filter.** It now also offers a question whose latest answer was graded on a revision whose key the current revision corrects, whatever its stored grade; the candidate listing and its count share the condition. The adapter joins the set of the learner's key-corrected revisions, as the scores do (below), on each latest answer's revision. The fake ignores status filters, as before, so this is proved on real Postgres in `question-repository-key-corrections.integration.test.ts`: a correct answer whose key moved since is offered, one whose stem was reworded is not, and a wrong answer still is. The twin's handling of key text and distractors is step b's, proved by the contracts.
- **Evidence.** Twelve targeted mutations across the notice, the three outputs, the controller, the three pages and the filter. Two survived the first run. Review rows marked unanswered items, until a case for an unanswered item on a key-corrected question; the filter's mutation was itself a no-op (a query fragment is truthy), and failed its cases once rewritten.

**Increment 4: the key check's cost, and the finalize summary, 2026-10-03.**
- **Cost.** ADR-022 asks for aggregate costs to be measured before shipping.
  - The data, on the local integration database: one learner with 2,000 answers over 300 questions, with 15 keys corrected and 15 stems reworded after answering, 30 questions retired and 10 withdrawn. A second learner has 50 tutor sessions of 20 items. Each figure is the median of 40 warm `EXPLAIN (ANALYZE)` runs.
  - **The first form** compared the two revisions' keys row by row. The dashboard's all-time read took 42.2 ms, against 3.07 ms without the key check. Postgres charged both key subqueries to every row, an estimate of 198,510, which crossed `jit_above_cost`; JIT compilation took 38.9 ms of the 42.2. The subqueries themselves ran only for the 180 rows graded on a superseded revision.
  - **The shipped form** builds the set of the learner's superseded revisions whose key was corrected once, and left-joins it on each row's graded revision. Grouping the set by id tells the planner the join adds no rows. The estimate is 14,580, with no JIT.
  - **Results.** The dashboard's all-time read takes 4.86 ms and its seven-day read 2.64 ms, against 1.22 ms without the key check. History's page takes 4.14 ms, against 2.04 ms.
  - Production's JIT setting cannot be read without querying production, so the read no longer depends on it.
  - **Evidence.** Eleven targeted mutations of the set and its three joins each fail a real-Postgres case.
- **The finalize summary.** CodeRabbit, on promotion #1350, found that since step 3 the summary was read after finalization committed, so a failed read returned an error for a finalization that had committed.
  - The client recovered on retry: it rotates the key, meets the completed-session conflict, and reads the summary.
  - Finalize now scores the summary inside its transaction, the one that records each item's fair chance, so a failed read rolls the finalization back.
  - A case proves the summary is read through the transaction; it was red first.

**Increment 5: bookmarks and History filters, 2026-10-03.** One label on every surface.
- **Bookmarks.** A bookmarked question no longer available names its state, withdrawn, under review or retired, with F-11's heading and label in the tonal row it already used. It shows no content, since a bookmark is not an answer (Decision 2). A question that no longer exists keeps "[Question no longer available]".
  - A bookmark binds no revision, so the use case reads availability by id. `QuestionRepository.findAvailabilityByIds` derives it as every other read does. The availability contract now reads each of its nine scenarios by id too, plus an unknown id, on the fake and on real Postgres.
  - The warning log now fires only for a bookmark whose question is missing. A withdrawn or retired question is an expected state, not a fault.
- **History filters.** A difficulty or tag filter matched only published questions, so a question no longer available vanished from History once a filter was applied, though it is listed unfiltered. Both the adapter and the fake now match the difficulty of the revision answered and the question's tags, whatever its state, and the difficulty sort places it by that difficulty. Difficulty and tags are not the content Decision 2 protects, so filtering by them reveals nothing it forbids.
- **Evidence.** Thirteen targeted mutations each fail a case, across the use case, the page, both repositories, the request cache and both filters. The page's first case checked text only and would have passed with the heading and the label swapped; it now checks each slot.


## Verification

- **Labels.** A withdrawn, a held and a retired question each show their own label and notice, a caution for the first two and a neutral notice for a retired one, on every surface a learner who answered them sees. When a hold lifts, a question the active release publishes is Available again.
- **Exposure.** An unanswered exam item that becomes unavailable reveals no content.
- **Scores.** Session accuracy, the post-exam header, history and dashboard accuracy count an item only when the learner had a fair chance at it, recorded when its session ends, and its content is not now in doubt: withdrawn, under review or, for an answered item, key-corrected (ADR-022 Amendment). Retiring a question changes no past score. A hold lifted after the session ends restores only an item that had a fair chance; a lift before the end gives the item its chance only if its question is available again when the session ends. Activity counts are unchanged.
- **The submit warning** counts only scored items.
- **Key corrections.** A key-corrected attempt shows the correction notice, is unscored, and its question appears in the Incorrect filter. A wording-only revision keeps F-12 and stays scored.
- **Real Postgres.** An integration case finalizes an exam containing a withdrawn item end to end; none exists today.
- **Mutations.** Removing each derivation or exclusion fails a case.

## Verified closeout — 2026-10-03 UTC

- **Decided** in #1326 (ADR-022). Decision 3 was amended under [DEBT-494](./debt-494-read-time-scores-owner-confirmation.md) (#1343).
- **Implemented** in twelve PRs, each merged on an exact-head CodeRabbit approval:
  - part A, content only to a learner who answered: #1330 (**5399533151** on `d7e3f148`; merged `52970d9d`);
  - part B, the availability value: #1333 (**5399789430** on `18d1e76a`; merged `8475778f`);
  - part C, labels and notices: #1334 (**5399950118** on `059b5e27`; merged `97aa3b24`), with the contract's hold-lift clock fix #1336 (**5400102185** on `6a0e9dfb`; merged `2efb2b59`);
  - increment 2, scores:
    - #1339 (**5400543476** on `14eb2813`; merged `a53c4ac5`);
    - #1341 (**5400759268** on `641bb9f3`; merged `40bf64e7`);
    - and, as revised for the amended rule, #1344 (**5401592073** on `e944799b`; merged `3a91c476`), #1346 (**5401855796** on `b7cad958`; merged `279f8d59`) and #1348 (**5402225342** on `808540f6`; merged `7b77d2e5`);
  - increment 3 and part E, Review & Submit and the active notice: #1349 (**5402382182** on `75a0c6b1`; merged `57b0a70d`);
  - increment 4, key corrections: #1351 (**5402602114** on `1593fd4d`; merged `3e56a7e1`);
  - increment 5, bookmarks and History filters: #1354 (**5403397503** on `e12c5a05`; merged `6373d13d`).
- **Released** through promotions #1331, #1337, #1340, #1342, #1347, #1350, #1352 and #1355.
  - Promotions #1335 and #1345 were closed unmerged, and their fixes were taken first (see Progress).
  - The last, #1355 (`e2981bea`): main CI **37162107658** `test` passed **23:46:32Z**; production assigned **23:46:33.856Z**; `main` and `dev` trees `3dc0ed23`; production health 200 (`{"ok":true,"db":true}`).
- **Verification**, as the record asks:
  - every surface a learner who answered sees, bookmarks included, gives a question's own label and notice;
  - no unavailable content reaches a learner who never answered it, proved on real Postgres through an exam finalized with a withdrawn item;
  - every score follows the amended rule, and one real-Postgres case checks the summary, History and the Dashboard agree through holds, a retirement and lifts;
  - the submit warning counts only scored items;
  - a key-corrected answer shows the correction notice, is unscored, and returns to the Incorrect filter, while a wording-only revision keeps F-12 and stays scored;
  - each step's targeted mutations fail a case (Progress).
- **Deferred.** End and finalize outputs cached before #1348's writer are replayed with `totals.scored = questionCount`, by the mapping in `src/adapters/controllers/practice-schemas.ts`. It can be removed once a full 24-hour TTL has passed since that writer reached production (promotion #1350, assigned 2026-10-03 20:02:33Z), provided production has not rolled back to an earlier deployment since. The register's Deferred table carries it. Done on 2026-10-04: see [Deferred tail done](#deferred-tail-done--2026-10-04-utc).


## Deferred tail done — 2026-10-04 UTC

The replay mapping is removed. `EndPracticeSessionOutputSchema` now requires `totals.scored` and no longer fills it in as the question count.

**Why it is safe.** A full 24-hour TTL has passed since the last writer without `scored` left production:
- #1350's writer was assigned to production at 2026-10-03 20:02:33Z.
- The change was made at 21:00Z on 2026-10-04.
- Every production deployment since then (#1352, #1355, #1357 and #1359) carries that writer.
- The production domains were served by #1359's deployment from 03:28:57Z, with no reassignment to an earlier deployment, as read from Vercel's deployment and alias APIs.

**Tests.** A case requires the count from both end and finalize outputs.

The register's Deferred row is closed.

## Related

- [ADR-022](../../adr/adr-022-learner-scores-and-labels-when-content-changes.md): the decisions.
- [ADR-021](../../adr/adr-021-question-revisions-and-content-releases.md): immutable revisions.
- [DEBT-484](./debt-484-question-rewrite-history-identity.md) and [BUG-317](../bugs/bug-317-content-release-documentation-overclaims.md): the deferred decisions this record executes.
- [DEBT-494](./debt-494-read-time-scores-owner-confirmation.md): the decision that amends Decision 3, so past scores change only when content validity changes.
