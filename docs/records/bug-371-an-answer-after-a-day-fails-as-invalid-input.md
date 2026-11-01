# BUG-371: An Answer Submitted a Day After Its Question Loaded Fails as Invalid Input

**Status:** Open
**Priority:** P4
**Date:** 2026-11-01

---

## Summary

The browser reports how long a learner spent on a question by subtracting when the question loaded from the time of submission. It does not cap that number. The server's submit-answer schema rejects anything over a day (`MAX_TIME_SPENT_SECONDS`, 86,400 seconds), so an answer submitted more than 24 hours after its question loaded is refused as `VALIDATION_ERROR`. The learner sees "Invalid input", the answer is not recorded, and pressing **Try again** reloads the question without the chosen answer.

The use case was meant to settle this case another way. BUG-108 (2026-02-08) made `SubmitAnswerUseCase` the authority for the bound and had it cap the time at a day. That cap is unreachable from the app, because the controller rejects the same values before the use case runs.

## Evidence

- **Seen in the owner's billing QA.** On the dev preview at `5c8c9f2b` (2026-10-29, about 22:55Z), a tutor-mode question had been open about 27 hours. **Submit** showed "Invalid input". The subscription had ended the day before, so BUG-365's redirect to Pricing was expected and did not happen. **Try again**, which loads a question without sending a time, then redirected to Pricing as intended.
- **The browser does not cap the time.**
  - `buildTimeSpentSeconds` (`app/(app)/app/practice/shared/question-flow-actions.ts:101-108`) returns `Math.max(0, Math.floor((now - loadedAt) / 1000))`, with no upper bound. Practice sessions and Quick Practice use it.
  - The single-question page computes the same value inline (`app/(app)/app/questions/[slug]/question-page-logic.ts:255-263`).
- **The schema rejects more than a day.** `SubmitAnswerInputSchema` (`src/adapters/controllers/question-controller.ts:90-95`) declares `timeSpentSeconds` as `z.number().int().min(0).max(MAX_TIME_SPENT_SECONDS).optional()`. `createAction` (`create-action.ts:46-51`) parses it before `execute` calls `requireEntitledUserId`, and returns any failure through `handleError`.
  - `handleError` uses `toIdempotencyPublicError`, which maps a `ZodError` to `VALIDATION_ERROR` with the message "Invalid input".
  - `question-controller.test.ts` pins the rejection: "returns VALIDATION_ERROR when timeSpentSeconds exceeds 24 hours", with 86,401.
- **The use case caps instead.** `submit-answer.ts:198-203` computes `Math.min(SUBMIT_ANSWER_MAX_TIME_SPENT_SECONDS, Math.max(0, raw))`, and `submit-answer-standalone.test.ts` proves that 999,999 is stored as 86,400. BUG-108's record calls the use case "the authoritative business logic layer" and kept the controller's limit only as an earlier check. Nobody weighed a real browser sending a larger value.
- **Exam drafts are not affected.** Their schema has the same kind of limit (`cumulativeMs` up to a day, in `practice-schemas.ts`), but an exam allots 72 seconds a question and holds at most 200 questions. Its deadline therefore comes at most 4 hours after it starts, and `SaveExamDraftAnswerUseCase` refuses a draft once the exam has expired ("Exam time has expired"), whatever its time.

## Impact

- **Who:** a learner who submits an answer more than 24 hours after its question loaded, for example from a tab left open overnight and then some. Practice sessions, Quick Practice and the single-question page are all affected.
- **Effect:**
  - The answer is refused with a message that does not say why.
  - **Try again** reloads the question and drops the selected choice, so the learner has to answer again.
  - No stored data is lost: the learner can answer again, and the time would have been stored as a day anyway.
- **It hides BUG-365's redirect.** Because the schema check runs before the entitlement check, a learner whose subscription ended while the tab was open gets "Invalid input" instead of being sent to Pricing. The next action, **Try again**, does redirect.
- **Not measured:** how often it happens. This record did not query production logs.
- **No security effect.** The value only feeds the learner's own time statistics.

## Options

1. **Cap the time in the browser.** Both computations would cap at the use case's constant, and the single-question page would share `buildTimeSpentSeconds`. The server would stay as it is. But a tab loaded before the fix ships keeps the old code, and those long-open tabs are exactly the ones this bug hits, so they would still fail. The bound would also live in three places.
2. **Let the use case decide, as BUG-108 intended.** The schema accepts any non-negative integer, and the use case caps it at a day, which it already does and already tests. Every browser is fixed as soon as the server ships, including tabs opened before. A negative or fractional value is still refused: the browser never sends one, so refusing it costs a learner nothing.
3. **Both.** Changing the browser adds nothing to option 2, because the server already records the capped value.

## Resolution (decided)

Option 2. How long a question was open is the browser's measurement. The rule for storing it ("at most a day") belongs to the use case, as BUG-108 decided. The schema checks only the shape. With the limit gone from the schema, `MAX_TIME_SPENT_SECONDS` has no other user, so it is removed and the use case's constant stays the single bound. The exam-draft limit stays as it is: the exam deadline already refuses any draft that could exceed it.

## Verification

- [ ] Red first: `submitAnswer` accepts a time over a day and records 86,400. It replaces the controller test that pinned the rejection.
- [ ] A negative or fractional time is still refused as `VALIDATION_ERROR`.
- [ ] The use case's existing cap tests still pass.

## Related

- BUG-108: the use-case cap this record makes reachable.
- BUG-365: the redirect to Pricing that this failure hid.
