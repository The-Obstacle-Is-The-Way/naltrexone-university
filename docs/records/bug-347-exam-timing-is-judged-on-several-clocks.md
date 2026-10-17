# BUG-347: An Exam's Timing Is Judged on Several Clocks, and Each Reader Decides Whether It Is Over

**Status:** Open — make the server the only judge of an exam's phase, red first with a fast browser clock
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

The server owns an exam's deadline: `startedAt` plus 72 seconds per question. The browser counts down to that deadline on its own clock. When the browser's clock runs fast, the two disagree, and finalization fails.

At the browser's zero, the page sends the on-screen answer as a final flush. The server refuses a flush that arrives before its own deadline with a CONFLICT that carries no reason. The page treats a reasonless CONFLICT as a cue to recover the summary, which fails because the exam has not ended. It then shows an error, rotates its key and retries every second until the server's clock catches up.

Past the 15-second grace window, the page stops sending the flush, and the server closes the exam early. Nothing is lost, because the draft save just before it succeeds. SPEC-039 NF1 says the server is the sole authority on time.

There is a second problem in the same family. Once an exam's deadline passes and nothing has finalized it yet, each reader decides for itself what that means.

I found this by reading the code; I did not reproduce it in a browser.

## Evidence

**Two clocks:**
- Server: `computeExamDeadline` (`src/domain/services/exam-timer.ts:11-17`) on the app server's clock.
- Browser: `use-exam-timer.ts:18-20,59` computes the time left from `Date.now()`, with no server offset.
- The page decides whether to send the flush on the browser's clock too (`use-practice-session-page-model.ts:242-276`; the staleness check is at :249).
- The server refuses an early flush: `src/application/use-cases/finalize-exam-answers.ts:331-340`, `CONFLICT`, "only allowed at exam expiry", with no reason in its details.
- The page recovers from a reasonless CONFLICT by reading the summary (`practice-session-page-logic.ts:325-372`), and the timer clears its latch to retry (`use-exam-timer.ts:186-189`).
- The timer also depends on the screen: `isTimerActive` includes `!reviewStage.review` (`use-practice-session-page-model.ts:293-297`).

**Readers disagree about an expired exam nobody has finalized.** `ended_at` is written only when something finalizes, while the deadline is derived:
- Opening the next question finalizes it (`get-next-question.ts:213-221`).
- Saving a draft refuses it (`save-exam-draft-answer.ts:64`).
- Marking for review allows it (`set-practice-session-question-mark.ts:37`).
- Review hides correctness as if the exam were running (`get-practice-session-review.ts:140`).
- The summary refuses it as not ended.
- The practice page offers Resume or Abandon. Abandon discards it, deleting the exam and its drafts ungraded: `discard-practice-session.ts` checks only the mode.
- SPEC-039's "Expired active reads" says an expired exam is closed by the same finalize path.

**Other clocks in the same lifecycle:**
- `practice_sessions.started_at` is the database's `now()`, the transaction's start (`db/schema.ts:1053-1055`). The insert is followed in the same transaction by `FOR SHARE` question locks (`drizzle-practice-session-repository.ts:612-639`), so a wait on a content activation shortens the exam. BUG-345 removes the pooled lock bound that would have limited that wait.
- `ended_at` comes from the app clock (`drizzle-practice-session-repository.ts:845`). The code concedes that `answered_at`, from the database clock, can be later (`:853-856`; accepted in DEBT-437).
- `attempts.answered_at` is the database default on submit, and the app clock or the deadline on exam finalize (`finalize-exam-answers.ts:208,238`). "Latest attempt" ranks across both.
- The deadline is recomputed from the current `EXAM_SECONDS_PER_QUESTION` (`time-constants.ts:2`). Changing it would move every open exam's deadline.

**History:** BUG-254, BUG-255, BUG-256, BUG-258, BUG-272 and BUG-277 (the exam's end split between browser and server). BUG-277 was this same reasonless CONFLICT abort on the late side of the grace window. BUG-258 was the browser clock running slow. BUG-251 and BUG-257 concerned expired exams. Today's tests run with aligned clocks; only the server's refusal is pinned (`finalize-exam-answers-final-draft.test.ts:188`).

## Impact

A learner whose device clock runs a few seconds fast sees an error screen at the end of an exam until the server's clock catches up. A larger skew ends the exam early. Phones and laptops usually sync their clocks, so this is P3. The expired-exam disagreement is a dead end only for a learner who abandons an exam they let run out.

## Options

1. **Count down from the server.** Each payload carries the server's time remaining; the page counts down from a monotonic offset. Treat an early flush as an ordinary draft save, or refuse it with a typed reason the page handles. Add one domain function, `examPhase(session, now)`, returning active, expired or ended, which every reader uses; an expired exam routes to finalization, including from Abandon. *Recommended.*
2. **Store `deadline_at` when the exam starts,** taken from the same clock as `started_at`. This fixes the moving deadline and the lock wait, and leaves the browser skew to option 1.

Whether abandoning an expired exam should grade it instead of deleting it is a product decision for the owner.

## Resolution (proposed)

Option 1, then option 2 if the constant ever changes. Red first:
- a client test with the browser clock 5 seconds and 20 seconds fast;
- a use-case test for each reader of an expired, unfinalized exam.

## Verification

- [ ] With a fast browser clock, the exam ends at the server's deadline without an error screen.
- [ ] Every reader classifies an expired, unfinalized exam the same way.
- [ ] The owner has decided what Abandon does to an expired exam.

## Related

- BUG-345: pooled lock waits are unbounded, which lengthens a wait inside `started_at`'s transaction.
- BUG-346: the summary screen that reads the finalized exam.
- DEBT-437 (closed): the accepted `answered_at` after `ended_at` residual.
