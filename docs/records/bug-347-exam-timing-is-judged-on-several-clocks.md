# BUG-347: An Exam's Timing Is Judged on Several Clocks, and Each Reader Decides Whether It Is Over

**Status:** Open — count down from the server's remaining time and give an early flush a typed outcome, red first with a fast browser clock
**Priority:** P3
**Date:** 2026-10-17

---

## Summary

The server owns an exam's deadline: `startedAt` plus 72 seconds per question. The browser counts down to that deadline on its own clock. When the browser's clock runs fast, the two disagree, and finalization fails.

1. **At the browser's zero,** the page sends the on-screen answer as a final flush.
2. **The server refuses a flush** that arrives before its own deadline. Its CONFLICT carries no reason.
3. **The page treats a reasonless CONFLICT** as a cue to recover the summary. That fails, because the exam has not ended.
4. **The page then shows an error,** rotates its key and retries every second until the server's clock catches up.

A skew over 15 seconds ends the exam (skew − 15) seconds early: past the grace window, the page stops sending the flush, and the server accepts the finalization. Nothing is lost, because the draft save just before it succeeds.

SPEC-039's risk table accepted client clock skew as affecting the display only; it did not foresee the early flush.

Separately, once an exam's deadline passes and nothing has finalized it, each reader decides for itself what that means.

I found this by reading the code; I did not reproduce it in a browser.

## Evidence

**Two clocks:**
- Server: `computeExamDeadline` (`src/domain/services/exam-timer.ts:11-17`) runs on the app server's clock.
- Browser: `use-exam-timer.ts:18-20,59` computes the time left from `Date.now()`, with no server offset.
  - The page decides whether to send the flush on the browser's clock too (`use-practice-session-page-model.ts:242-276`; the staleness check is at :249).
- The server refuses an early flush: `src/application/use-cases/finalize-exam-answers.ts:331-340`, `CONFLICT`, "only allowed at exam expiry", with no reason in its details.
- The page recovers from a reasonless CONFLICT by reading the summary (`practice-session-page-logic.ts:325-372`). The summary refuses with "has not ended" (`get-practice-session-summary.ts:36`). The timer then clears its latch to retry (`use-exam-timer.ts:186-189`).
- **Tests.** No test runs the browser clock ahead of the server's.
  - The lagging-clock cases (BUG-258) are covered at `use-practice-session-page-model-timer.browser.spec.tsx:280,318,357`.
  - Only the server's refusal of an early flush is pinned (`finalize-exam-answers-final-draft.test.ts:187`).

**Readers disagree about an expired exam nobody has finalized.** `ended_at` is written only when something finalizes, while the deadline is derived:
- Opening the next question finalizes it (`get-next-question.ts:213-221`).
- Saving a draft refuses it (`save-exam-draft-answer.ts:64`).
- Marking for review allows it (`set-practice-session-question-mark.ts:37`).
- Review hides correctness as if the exam were running (`get-practice-session-review.ts:140`).
- The summary refuses it as not ended.
- The practice page offers Resume or Abandon. Abandon deletes the exam and its drafts. That is the owner's BUG-251 decision (2026-06-18): Abandon means discard, and auto-finalizing on Abandon was rejected. It sits in tension with SPEC-039's "Expired active reads", which says an expired exam is closed by the finalize path.

**Other clocks in the same lifecycle (minor):**
- `practice_sessions.started_at` is the database's `now()`, which is the transaction's start (`db/schema.ts:1053-1055`).
  - The insert is followed, in the same transaction, by `FOR SHARE` question locks (`drizzle-practice-session-repository.ts:612-639`). A wait on a content activation therefore shortens the exam.
  - That wait is intended and tested, and it lasts seconds against 72 seconds per question. If BUG-345 holds, the lock timeout does not apply through the pooler, so the wait has no bound.
- `ended_at` comes from the app clock (`drizzle-practice-session-repository.ts:845`). The code concedes that `answered_at`, from the database clock, can be later (`:853-856`; DEBT-437 accepted this).
- `attempts.answered_at` is the database default on submit, and the app clock or the deadline on exam finalize (`finalize-exam-answers.ts:208,238`). "Latest attempt" ranks across both.

**History:**
- BUG-254, BUG-255, BUG-258 and BUG-277: the end split between browser and server.
  - BUG-277 was this same reasonless CONFLICT abort, on the late side of the grace window.
  - BUG-258 was the browser clock running slow.
  - BUG-255 capped `ended_at` on the server for the Review & Submit screen, where the timer stops (`isTimerActive`, `use-practice-session-page-model.ts:293-297`).
- BUG-256: resuming an expired exam.
- BUG-251: the Abandon decision.
- SPEC-039 (archived; read it at `63a8f220324b`): the timer's design.

## Impact

A learner whose device clock runs a few seconds fast sees an error screen at the end of an exam until the server's clock catches up. A skew over 15 seconds ends the exam early. Phones and laptops usually sync their clocks, so this is P3.

## Options

1. **Count down from the server.**
   - Each payload carries the server's time remaining, and the page counts down from a monotonic offset.
   - An early flush becomes an ordinary draft save, or is refused with a typed reason the page handles.
   - One domain function, `examPhase(session, now)`, returns active, expired or ended, and every reader except Abandon uses it.

   *Recommended.*
2. **Store `deadline_at` when the exam starts,** from the same clock as `started_at`. This makes the deadline independent of a later change to `EXAM_SECONDS_PER_QUESTION`. It reverses SPEC-039 NF5 (no migration; the deadline derived from `started_at`), so do it only if that constant changes.

## Resolution (proposed)

Option 1, red first:
- a client test with the browser clock 5 seconds and 20 seconds fast;
- a use-case test for each reader of an expired, unfinalized exam.

BUG-251's Abandon decision stands. Whether SPEC-039's "Expired active reads" should be corrected to match it is a documentation fix.

## Verification

- [ ] With a fast browser clock, the exam ends at the server's deadline without an error screen.
- [ ] Every reader except Abandon classifies an expired, unfinalized exam the same way.

## Related

- BUG-346: the session summary's score label.
- BUG-345: pooled lock waits.
- BUG-251 and DEBT-437 (closed): the Abandon decision and the accepted `answered_at` residual.
