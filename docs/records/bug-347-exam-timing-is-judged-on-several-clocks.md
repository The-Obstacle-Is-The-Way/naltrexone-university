# BUG-347: An Exam's Timing Is Judged on Several Clocks, and Each Reader Decides Whether It Is Over

**Status:** Verifying — promotion of the server countdown and expiry guards to main; due 2026-10-19
**Priority:** P2
**Date:** 2026-10-17

---

## Summary

The server owns an exam's deadline: `startedAt` plus 72 seconds per question. Before step 2, the browser counted down on its own clock. A fast browser clock could trigger finalization before the server's deadline. Step 2 counts down from server remaining milliseconds, refreshes timing without finalizing, and gives premature expiry a typed, uncached result. Review and promotion remain.

At `72a1ef5b`, after step 1:

1. **At the browser's zero,** the page sends the on-screen answer as a final flush.
2. **The server refuses a flush** that arrives before its own deadline. Its CONFLICT carries no reason.
3. **The page treats a reasonless CONFLICT** as a cue to recover the summary. That fails, because the exam has not ended.
4. **The page then shows an error,** rotates its key and retries on later timer ticks after each failed request finishes, until the server accepts it.

Before step 1, a clock more than 15 seconds fast could end the exam up to (skew − 15) seconds early: past the grace window the page stopped sending the flush, and the server accepted a finalization without one. Step 1 removed that client check and forwarded the captured draft. With no question on screen at the browser's zero, it sent no flush and could still end the exam up to the full skew early. At `72a1ef5b`, the draft save before that finalization was not checked (`use-practice-session-page-model.ts:232`; timeouts return `{ ok: false }`, `question-flow-actions.ts:302-307`): if it failed, an older saved answer, or none, was graded. Step 2 marks every timer finalization as expiry-only, including requests with no draft.

SPEC-039's risk table accepted client clock skew as affecting the display only; it did not foresee the early flush.

An expired exam is not yet a finalized exam. Step 2 shares classification where expiry matters and pins each operation's response below.

This was found by reading the code; it was not reproduced in a browser. Use-case tests at `72a1ef5b` pin the server's half: an early flush is refused (`finalize-exam-answers-final-draft.test.ts:188`), and a finalization without one ends the exam early (`finalize-exam-answers-deadline.test.ts:96`).

## Evidence

**Two clocks before step 2 (`72a1ef5b` unless a different commit is named):**
- Server: `computeExamDeadline` (`src/domain/services/exam-timer.ts:11-17`) derives a deadline from persisted `startedAt`. The use cases compare it with their injected app clock (`save-exam-draft-answer.ts:64`; `finalize-exam-answers.ts:120`).
- Browser: `use-exam-timer.ts:18-20,59` computes the time left from `Date.now()`, with no server offset.
  - Before step 1, the page also decided whether to send the flush on the browser's clock (`use-practice-session-page-model.ts:242-276` at `92e56929`): `isFinalDraftFlushProvablyStale` dropped it more than 15 seconds past the deadline. Step 1 captures and forwards the draft (`:230-245`). The save's `{ ok: false }` result is still ignored at `:232`; a thrown error is caught at `:233`; finalization follows at `:245`.
- The server refuses an early flush: `src/application/use-cases/finalize-exam-answers.ts:331-340`, `CONFLICT`, "only allowed at exam expiry", with no reason in its details.
- The page recovers from a reasonless CONFLICT by reading the summary (`practice-session-page-logic.ts:325-372`). The summary refuses with "has not ended" (`get-practice-session-summary.ts:36`). The timer then clears its latch to retry (`use-exam-timer.ts:186-189`).
- **Tests.** Step 1 adds browser tests with clocks 5 and 20 seconds fast and a failed save. They assert that finalization receives the on-screen draft; the action boundary returns the server's early-flush refusal (`use-practice-session-page-model-timer.browser.spec.tsx:168`).
  - The lagging-clock cases (BUG-258) are covered at `use-practice-session-page-model-timer.browser.spec.tsx:324,362,401`.
  - The server's refusal of an early flush is pinned (`finalize-exam-answers-final-draft.test.ts:188`), and so is its acceptance of a finalization without one (`finalize-exam-answers-deadline.test.ts:96`).

**Before step 2, readers treat an expired exam nobody has finalized differently (`72a1ef5b`).** `ended_at` is written only when something finalizes, while the deadline is derived:
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
  - BUG-255 capped `ended_at` on the server for the Review & Submit screen, where the timer stops (`isTimerActive`, `use-practice-session-page-model.ts:268-274`).
- BUG-256: resuming an expired exam.
- BUG-251: the Abandon decision.
- SPEC-039 (archived; read it at `63a8f220324b`): the timer's design.

## Impact

Before step 2, a fast clock put the exam on an error screen until the server's deadline. Before step 1, a clock over 15 seconds fast could also end the exam early, and a failed last save could lose the on-screen answer. Frequency was not measured. P2: degraded; correcting the device clock avoids it.

## Options

1. **Take the browser's clock out of the decision, then count down from the server.**
   - First, delete the client's stale-flush check (built in step 1). The server already drops a late flush and still finalizes (`finalize-exam-answers-final-draft.test.ts:215`; business rule R7).
   - Session timing payloads carry the server's remaining time; the page counts down using monotonic elapsed time and resynchronizes on resume or visibility change. Server checks remain authoritative, including network delay and sleeping tabs.
   - An early flush receives a typed outcome, and the page retries at the server's expiry with the on-screen answer. Before the server's deadline, a failed draft save never leads to a finalization that drops that answer. Keep the bounded post-deadline flush and the server cutoff (R7).
   - Share active/expired/ended classification where expiry matters, but specify each operation's response: active access finalizes, draft saves enforce the cutoff, and summary/feedback require committed finalization. Decide the expired mark-for-review policy explicitly. Abandon remains discard. Different responses do not by themselves prove a defect.

   *Recommended.*
2. **Store `deadline_at` when the exam starts,** from the same clock as `started_at`. This makes the deadline independent of a later change to `EXAM_SECONDS_PER_QUESTION`. It reverses SPEC-039 NF5 (no migration; the deadline derived from `started_at`), so do it only if that constant changes.

## Resolution

Option 1, built in two steps. Step 1 removes the client stale-flush check. Step 2 adds:

- Server remaining milliseconds on answerable and unavailable question payloads (`get-next-question.ts:71,118`). A read-only timing use case returns the same timing without finalizing or touching drafts (`get-practice-session-timing.ts:27-35`). Its controller uses the existing entitlement and owned-session checks.
- A monotonic countdown (`use-exam-timer.ts:143`) refreshed on activation, focus and visibility return. A pending refresh does not block expiry from the last server sample. Display seconds round up; expiry uses milliseconds.
- Explicit expiry-only finalization, even without a draft (`use-practice-session-page-model.ts:245-248`). The server returns `exam_not_expired` before its deadline (`finalize-exam-answers.ts:150-162`). Idempotency does not cache that result. The page preserves its draft, stays ready, requests fresh timing and retries; it does not read a summary for this result (`practice-session-page-logic.ts:330-335`). Manual early submission still works.
- Shared active/expired/ended classification (`exam-timer.ts:25-37,52-54`). Active question access finalizes an expired exam. Draft saves and marks for review refuse it; marks do not finalize it (`set-practice-session-question-mark.ts:44-60`). Incomplete-session and draft-review reads remain observational. Summary and completed feedback still require committed `endedAt`. Abandon discards the unfinished exam.

Red-first receipts cover server milliseconds, browser clocks 5 and 20 seconds fast, wall-clock jumps, a pending timing refresh, premature finalization with no draft, and an early refusal followed by a successful flush of the retained answer. `practice-controller-finalize-idempotency-conflicts.test.ts` proves the real use case can retry the same key at the deadline. `expired-exam-read-policy.test.ts` pins the unchanged read and Abandon boundaries. `tests/e2e/exam-timing.spec.ts` exercises the production timing action and countdown with a fast browser clock; its run remains part of the gate.

BUG-251's Abandon decision and DEBT-437's accepted clock residual stand. Record the expired-exam rule in `docs/product/business-rules.md` beside R7 and R8; SPEC-039 is closed.

## Verification

- [x] The timer forwards the on-screen draft after a failed save with a fast clock or a late tab resume; the server applies its own cutoff.
- [x] With a fast browser clock, browser tests finish at the server's deadline without an error screen.
- [x] Expiry-sensitive operations use one domain classification; summary and completed feedback require committed finalization, and Abandon remains discard.
- [x] Before the server's deadline, a failed draft save never leads to timer finalization that drops the on-screen answer.
- [ ] Full gate, review and merge to dev.
- [ ] Owner promotes the fix to main; due 2026-10-19.

## Related

- BUG-346: the session summary's score label.
- BUG-345: the pooled lock and statement timeouts on the start's wait.
- BUG-251 and DEBT-437 (closed): the Abandon decision and the accepted `answered_at` residual.
