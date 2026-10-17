# BUG-347: An Exam's Timing Is Judged on Several Clocks, and Each Reader Decides Whether It Is Over

**Status:** Open — count down from the server's remaining time and give an early flush a typed outcome, red first with a fast browser clock
**Priority:** P2
**Date:** 2026-10-17

---

## Summary

The server owns an exam's deadline: `startedAt` plus 72 seconds per question. The browser counts down to that deadline on its own clock. When the browser's clock runs fast, the two disagree, and finalization fails.

1. **At the browser's zero,** the page sends the on-screen answer as a final flush.
2. **The server refuses a flush** that arrives before its own deadline. Its CONFLICT carries no reason.
3. **The page treats a reasonless CONFLICT** as a cue to recover the summary. That fails, because the exam has not ended.
4. **The page then shows an error,** rotates its key and retries on later timer ticks after each failed request finishes, until the server accepts it.

A clock more than 15 seconds fast ends the exam up to (skew − 15) seconds early: past the grace window the page stops sending the flush, and the server accepts a finalization without one. With no question on screen at the browser's zero, no flush is sent and the exam can end up to the full skew early. The draft save before that finalization is not checked (`:256`; timeouts return `{ ok: false }`, `question-flow-actions.ts:302-307`): if it fails, an older saved answer, or none, is graded.

SPEC-039's risk table accepted client clock skew as affecting the display only; it did not foresee the early flush.

Separately, once an exam's deadline passes and nothing has finalized it, each reader decides for itself what that means.

This was found by reading the code; it was not reproduced in a browser. Use-case tests pin the server's half: an early flush is refused (`finalize-exam-answers-final-draft.test.ts:188`), and a finalization without one ends the exam early (`finalize-exam-answers-deadline.test.ts:96`).

## Evidence

**Two clocks:**
- Server: `computeExamDeadline` (`src/domain/services/exam-timer.ts:11-17`) derives a deadline from persisted `startedAt`. The use cases compare it with their injected app clock (`save-exam-draft-answer.ts:64`; `finalize-exam-answers.ts:120`).
- Browser: `use-exam-timer.ts:18-20,59` computes the time left from `Date.now()`, with no server offset.
  - The page decides whether to send the flush on the browser's clock too (`use-practice-session-page-model.ts:242-276`): `isFinalDraftFlushProvablyStale` (`:73-83`, applied at `:247-254`) drops it more than 15 seconds past the deadline. The save's `{ ok: false }` result is ignored at `:256`; a thrown error is caught at `:257`; finalization follows at `:268`.
- The server refuses an early flush: `src/application/use-cases/finalize-exam-answers.ts:331-340`, `CONFLICT`, "only allowed at exam expiry", with no reason in its details.
- The page recovers from a reasonless CONFLICT by reading the summary (`practice-session-page-logic.ts:325-372`). The summary refuses with "has not ended" (`get-practice-session-summary.ts:36`). The timer then clears its latch to retry (`use-exam-timer.ts:186-189`).
- **Tests.** No test runs the browser clock ahead of the server's.
  - The lagging-clock cases (BUG-258) are covered at `use-practice-session-page-model-timer.browser.spec.tsx:280,318,357`.
  - The server's refusal of an early flush is pinned (`finalize-exam-answers-final-draft.test.ts:188`), and so is its acceptance of a finalization without one (`finalize-exam-answers-deadline.test.ts:96`).

**Readers disagree about an expired exam nobody has finalized.** `ended_at` is written only when something finalizes, while the deadline is derived:
- Opening the next question finalizes it (`get-next-question.ts:213-221`).
- Saving a draft refuses it (`save-exam-draft-answer.ts:64`).
- Marking for review allows it (`set-practice-session-question-mark.ts:37`).
- Review hides correctness as if the exam were running (`get-practice-session-review.ts:140`).
- The summary refuses it as not ended.
- The practice page offers Resume or Abandon. Abandon deletes the exam and its drafts. That is the owner's BUG-251 decision (2026-06-18): Abandon means discard, and auto-finalizing on Abandon was rejected. BUG-251 did not address expired exams; SPEC-039's "Expired active reads" finalizes on the next active access, which Abandon is not.

**Other clocks in the same lifecycle (minor):**
- `practice_sessions.started_at` is the database's `now()`, which is the transaction's start (`db/schema.ts:1053-1055`).
  - The insert is followed, in the same transaction, by `FOR SHARE` question locks (`drizzle-practice-session-repository.ts:612-639`). A wait on a content activation therefore shortens the exam.
  - That lock wait is intended and tested, but its production duration was not measured. BUG-345's migration 0052 sets a 5-second timeout per lock acquisition through the pooler; it is not an end-to-end bound for the transaction. BUG-345 retains the production verification.
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

A clock a few seconds fast ends each exam on an error screen until the server's deadline. Over 15 seconds fast, the exam ends early, and a failed last save loses the on-screen answer. Frequency was not measured. P2: degraded; correcting the device clock avoids it.

## Options

1. **Take the browser's clock out of the decision, then count down from the server.**
   - First, delete the client's stale-flush check (`:73-83`, `:247-254`). The server already drops a late flush and still finalizes (`finalize-exam-answers-final-draft.test.ts:215`; business rule R7).
   - Session timing payloads carry the server's remaining time; the page counts down using monotonic elapsed time and resynchronizes on resume or visibility change. Server checks remain authoritative, including network delay and sleeping tabs.
   - An early flush receives a typed outcome, and the page retries at the server's expiry with the on-screen answer. Before the server's deadline, a failed draft save never leads to a finalization that drops that answer. Keep the bounded post-deadline flush and the server cutoff (R7).
   - Share active/expired/ended classification where expiry matters, but specify each operation's response: active access finalizes, draft saves enforce the cutoff, and summary/feedback require committed finalization. Decide the expired mark-for-review policy explicitly. Abandon remains discard. Different responses do not by themselves prove a defect.

   *Recommended.*
2. **Store `deadline_at` when the exam starts,** from the same clock as `started_at`. This makes the deadline independent of a later change to `EXAM_SECONDS_PER_QUESTION`. It reverses SPEC-039 NF5 (no migration; the deadline derived from `started_at`), so do it only if that constant changes.

## Resolution (proposed)

Option 1, red first:
- a client test with the browser clock 5 seconds and 20 seconds fast;
- a failed last draft save, with the on-screen answer still graded;
- operation-specific tests for an expired, unfinalized exam, preserving summary/feedback integrity and Abandon.

BUG-251's Abandon decision and DEBT-437's accepted clock residual stand. Record the expired-exam rule in `docs/product/business-rules.md` beside R7 and R8; SPEC-039 is closed.

## Verification

- [ ] With a fast browser clock, the exam ends at the server's deadline without an error screen.
- [ ] Every reader except Abandon classifies an expired, unfinalized exam with one domain function.
- [ ] Before the server's deadline, a failed draft save never leads to a finalization that drops the on-screen answer.

## Related

- BUG-346: the session summary's score label.
- BUG-345: the pooled lock and statement timeouts on the start's wait.
- BUG-251 and DEBT-437 (closed): the Abandon decision and the accepted `answered_at` residual.
