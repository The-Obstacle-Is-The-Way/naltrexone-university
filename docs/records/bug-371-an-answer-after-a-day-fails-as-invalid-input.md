# BUG-371: An Answer Submitted a Day After Its Question Loaded Fails as Invalid Input

**Status:** Open
**Priority:** P4
**Date:** 2026-11-01

---

## Summary

The browser measures how long a learner spent on a question, from when it loaded until the answer is sent, and does not cap the result. Three server schemas reject a time over a day:

- **`submitAnswer`:** `timeSpentSeconds` over 86,400 seconds.
- **The exam draft save:** `cumulativeMs` over a day.
- **The exam finalize's final draft:** `cumulativeMs` over a day.

So an answer sent more than 24 hours after its question loaded fails as `VALIDATION_ERROR`, and the learner sees "Invalid input".

Each use case behind those schemas already caps the time at a day, and that cap is the rule. BUG-108 added the submit-answer cap as a backstop behind the schema's limit, and BUG-238 copied the pair for exam drafts. Neither weighed a browser that honestly measures more than a day. Because the schema rejects first, the caps are unreachable from the app.

## Evidence

- **Seen in the owner's billing QA.** On the dev preview at `5c8c9f2b` (2026-10-29, about 22:55Z), a tutor-mode question had been open about 27 hours. **Submit** showed "Invalid input".
  - The subscription had ended the day before, so BUG-365's redirect to Pricing was expected and did not happen.
  - **Try again**, which loads a question without sending a time, then redirected to Pricing as intended.
- **The browser does not cap the time.**
  - `buildTimeSpentSeconds` (`app/(app)/app/practice/shared/question-flow-actions.ts:101-108`) returns `Math.max(0, Math.floor((now - loadedAt) / 1000))`. Practice sessions and Quick Practice use it.
  - The single-question page computes the same value inline (`app/(app)/app/questions/[slug]/question-page-logic.ts:255-263`).
  - In an exam, `use-practice-session-question-flow.ts` adds `Date.now() - enteredAt` to the question's saved total, at lines 257-261 for a draft save and 333-336 for the final draft.
- **The schemas reject more than a day.**
  - `SubmitAnswerInputSchema` (`src/adapters/controllers/question-controller.ts:90-95`) declares `timeSpentSeconds` up to `.max(MAX_TIME_SPENT_SECONDS)`.
  - `practice-schemas.ts:64` (the finalize's final draft) and `:82` (the draft save) declare `cumulativeMs` up to `.max(MAX_DRAFT_CUMULATIVE_MS)`.
  - `createAction` (`create-action.ts:46-51`) parses the schema before `execute` runs. For a submission, that is before `requireEntitledUserId`.
  - `handleError` uses `toIdempotencyPublicError`, which maps a `ZodError` to `VALIDATION_ERROR` with "Invalid input".
  - Tests pin each rejection: `question-controller.test.ts` ("exceeds 24 hours"), `practice-schemas.test.ts`, `practice-controller-exam-draft.test.ts` and `tests/integration/bug-regression-exam-draft-bounds.integration.test.ts`.
- **The use cases cap instead.**
  - `submit-answer.ts:198-203` computes `Math.min(SUBMIT_ANSWER_MAX_TIME_SPENT_SECONDS, Math.max(0, raw))`; `submit-answer-standalone.test.ts` stores 999,999 as 86,400.
  - `save-exam-draft-answer.ts:99-104` and `finalize-exam-answers.ts:104-107` cap `cumulativeMs` at `SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS`. The database also checks `draft_cumulative_ms` between 0 and a day (`db/schema.ts:1197-1199`).
- **The exam deadline does not prevent it.** An exam allots 72 seconds a question, up to 200 questions, so it expires at most 4 hours after it starts. But the time a browser sends grows for as long as the device sleeps on one question.

## Impact

- **Who:** a learner whose answer, draft or exam finish is sent more than 24 hours after the question loaded. Examples: a tab left open overnight and then some, or a laptop asleep in the middle of an exam. Practice sessions, Quick Practice, the single-question page and exams are all affected.
- **Effect on an answer:** it is refused with a message that does not say why, and the selected choice is dropped. **Try again** reloads the question on the single-question page and in a session. In Quick Practice it loads the next question by the filters, and the order is reseeded each UTC day (`get-next-question.ts:339-348`), so after a day it is most likely a different question.
- **Effect on an exam:**
  - When the timer runs out, the finish sends the oversized final draft and gets "Invalid input". Without the schema's limit, the use case would drop the stale draft after the grace window (`finalize-exam-answers.ts:333-346`) and finish the exam.
  - By reading, not reproduced: the timer then re-reads the timing, which still succeeds for an expired exam that has not ended, and retries on the next one-second tick (`use-exam-timer.ts:193-210`). That would send about one failing finish a second until the page reloads.
  - **Next** or **End** fails the same way. The save returns `VALIDATION_ERROR` rather than the expiry conflict, so the expiry recovery in `question-flow-actions.ts:212-220` never runs.
  - Reloading recovers: the saved total is at most a day, and the clock restarts.
- **It hides BUG-365's redirect.** The schema check runs before the entitlement check, so a learner whose subscription ended while the tab was open gets "Invalid input" instead of Pricing.
- **Unobservable as built.** The server does not log a `ZodError` (`action-result.ts:54-57`), and the browser does not report a refused submission, so how often this happens cannot be measured.
- **No harm from the time itself.**
  - Nothing displays or aggregates `timeSpentSeconds`; it is only stored.
  - No idempotency fingerprint includes it (`submit-answer-request-key.ts:15-27`).
  - The caps protect the 32-bit column and the draft check.

## Options

1. **Cap the time in the browser.** Each of the four computations would cap at the use case's constant. But a tab loaded before the fix ships keeps the old code, and those long-open tabs are exactly the ones this bug hits. The bound would also live in a third place.
2. **Let the schemas check shape and the use cases own the cap.** All three schemas accept any non-negative integer, and each use case caps at a day, as it already does and already tests. Every browser is fixed as soon as the server ships, including tabs opened before.
   - Zod's `.int().min(0)` still refuses a negative, fractional, infinite or unsafe number. The browser never sends one, so refusing it costs a learner nothing.
   - This reverses the schema half of BUG-108 and of BUG-238, whose reason was a bound for callers that do not pass through the use case. The use cases still give them that bound.
3. **Both.** Changing the browser adds nothing to option 2, because the server already stores the capped value.

## Resolution (decided)

Option 2, for all three schemas. How long a question was open is the browser's measurement. The rule for storing it, at most a day, belongs to the use cases, which already enforce it before every write. A schema that rejects the same values only turns an honest measurement into a refused answer.

- `MAX_TIME_SPENT_SECONDS` and `MAX_DRAFT_CUMULATIVE_MS` lose their last production user and are removed, along with their test.
- The specification's submit-answer schema (`docs/product/specification.md:682`) changes with the code.
- The tests that pinned the rejections change to assert acceptance and the cap.

## Verification

- [ ] Red first, through the real use cases against Postgres: a submission with a time over a day stores 86,400 seconds. A draft save over a day stores a day. A finalize whose final draft is over a day finishes the exam. Each fails before the change with `VALIDATION_ERROR`.
- [ ] The controller and schema tests accept a time over a day and pass it to the use case, and still refuse a negative or fractional one.
- [ ] The use cases' existing cap tests still pass.

## Related

- BUG-108: the submit-answer cap this record makes reachable.
- BUG-238: the exam-draft bound whose schema half this record reverses.
- BUG-365: the redirect to Pricing that this failure hid.
