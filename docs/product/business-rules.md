# Business Rules and Their Tests (Rule-to-Test Register)

Each rule below states, in plain language, something the system guarantees a learner or a subscriber. The lines under it name the tests that prove it. A clinician or the owner can read what the product promises without reading code, and a developer can see where each promise is pinned.

`tests/rule-to-test-register.test.ts` checks the register on every `pnpm test`.
- Every named file must exist and still declare a test with the named title that runs unconditionally. The file is parsed, and these do not count:
  - a test that is commented out, skipped, todo or skipped by its options;
  - a conditional test (`runIf`, `skipIf`);
  - a test declared under a condition: an `if` or ternary branch, after `&&`, `||` or `??`, in a `switch` case or in a `catch` block.

  A test in a loop, a `try` block or a `finally` block counts. Titles built at run time, and tests reached through renamed aliases of `it`, are outside what the check reads; write proofs as plain `it`, `test` or `.each` declarations.
- Every rule must name at least one test.
- A malformed heading or proof line, or a repeated rule number, is reported rather than skipped. Renaming or deleting a test that proves a rule fails the check until the register is updated in the same change.

This register replaces the Gherkin acceptance-test harness this file once proposed. That harness was considered and not adopted ([ADR-019's amendment](../adr/adr-019-test-quality-practices.md#amendment--2026-10-03), DEBT-465's decision). Its design is in this file's history up to commit `91a24f3e`.

## How to use it

- **A new business rule** gets a numbered `### R<n>.` heading and at least one proof line, in the same change that introduces it.
- **Prove a rule with the lowest test that can:**
  - a domain or use-case unit test for an application rule;
  - real Postgres (`tests/integration/`) for a rule that lives in storage or SQL;
  - end-to-end only for what nothing lower reaches.
- **Renaming a test that proves a rule** means updating its line here.
- **Format.** A proof line is ``- `path`: `exact test title` ``. Copy the title verbatim, including an `it.each` template such as `%s` or `$name`.
- **Numbering.** Rules keep their numbers. R1–R17 are the backlog this file listed before the decision, and R18–R23 were added with DEBT-493 and DEBT-465 Part 3, and R24 and R25 with BUG-343, and R31 with BUG-351.

## Practice sessions

### R1. An unfinished practice session blocks starting a new one until it is resumed or abandoned.

- `src/application/use-cases/start-practice-session.test.ts`: `throws CONFLICT when an incomplete session exists`
- `tests/integration/session-attempt-repository.integration.test.ts`: `maps the real duplicate-incomplete-session constraint to the resume-or-abandon conflict`
- `src/application/use-cases/discard-practice-session.test.ts`: `frees the incomplete-session slot so the user can start over`

### R4. Tutor mode shows the answer and explanation at once; an active exam reveals no correctness until it ends.

- `src/domain/value-objects/practice-mode.test.ts`: `returns true for tutor mode`
- `src/domain/value-objects/practice-mode.test.ts`: `returns false for exam mode when not ended`
- `src/application/use-cases/submit-answer-tutor.test.ts`: `grades a session answer against the revision the item was bound to`
- `src/application/use-cases/get-practice-session-review.test.ts`: `redacts correctness for active exam sessions`

### R5. During an active exam, answers are saved as drafts only; answering a question for grading is refused.

- `src/application/use-cases/submit-answer-exam.test.ts`: `rejects active exam sessions before inserting an attempt or recording an answer`
- `src/application/use-cases/save-exam-draft-answer.test.ts`: `saves a draft answer for an active exam session without changing latest answer fields`

### R6. Finalizing an exam grades each drafted answer and records each unanswered question as omitted and incorrect.

- `src/application/use-cases/finalize-exam-answers.test.ts`: `finalizes drafted answers and records omitted exam questions as incorrect attempts`
- `src/application/use-cases/get-practice-session-review.test.ts`: `marks ended exam terminal-null question states as omitted incorrect rows`

### R7. A final draft saved at the last second still counts within the grace window; one arriving later is dropped, and the exam still finalizes.

- `src/application/use-cases/finalize-exam-answers-final-draft.test.ts`: `applies the flush within the deadline grace window`
- `src/application/use-cases/finalize-exam-answers-final-draft.test.ts`: `drops a flush arriving after the grace window and still finalizes`

### R8. Only an unfinished exam can be discarded. A tutor session, whose answers are graded attempts, can only be ended, so its attempts are never deleted. Discarding a session that is already gone is a silent success.

- `src/application/use-cases/discard-practice-session.test.ts`: `rejects discarding a tutor session and leaves it intact`
- `src/application/use-cases/discard-practice-session.test.ts`: `is idempotent when the session is missing or already discarded`
- `src/application/use-cases/end-practice-session.test.ts`: `rejects generic end for an active exam session`

### R9. Marking a question for review exists only inside an active exam.

- `src/application/use-cases/set-practice-session-question-mark.test.ts`: `persists marked-for-review state for exam sessions`
- `src/application/use-cases/set-practice-session-question-mark.test.ts`: `throws CONFLICT for tutor sessions`
- `src/application/use-cases/set-practice-session-question-mark.test.ts`: `throws CONFLICT when session is already ended`

### R16. A learner always sees a question's choices in the same order, seeded by both the learner and the question.

- `src/application/shared/shuffled-choice-views.test.ts`: `returns deterministic output for the same user and question`
- `src/application/shared/shuffled-choice-views.test.ts`: `uses the userId in the shuffle seed`
- `src/domain/services/shuffle.test.ts`: `produces different seeds for different questionIds`

### R17. Repeating a start request with the same idempotency key starts exactly one session, even when the requests overlap.

- `src/adapters/controllers/practice-controller-session-lifecycle.test.ts`: `keeps successful starts idempotent when idempotencyKey is reused`
- `src/adapters/shared/with-idempotency.test.ts`: `waits for an in-progress request and returns the stored result`
- `tests/integration/start-session-idempotency.integration.test.ts`: `starts one session for two overlapping requests with one key, and both receive it`

### R23. A practice session holds 1 to 200 questions; the practice starter offers 1 to 100.

- `src/adapters/controllers/practice-schemas.test.ts`: `accepts a session of %i questions`
- `src/adapters/controllers/practice-schemas.test.ts`: `refuses a session of %i questions`
- `app/(app)/app/practice/practice-page-logic-session-handlers.test.ts`: `offers sessions of 1 to 100 questions, within what the server accepts`

## Scores and content changes

### R18. A question is in one of four states, derived when it is read from its status, its withdrawals and its unlifted holds: available, withdrawn, under review or retired.

- `src/domain/value-objects/question-availability.test.ts`: `derives a %s question with withdrawn=%s and underReview=%s as %s`
- `tests/shared/question-availability-contract.ts`: `$name, read through either revision`
- `tests/shared/question-availability-contract.ts`: `$name, read by id`

### R19. A question no longer available shows its content only to a learner who answered it, never on an omitted or unanswered item, whether it was withdrawn, is under review or was retired.

- `tests/integration/withdrawn-question-review.integration.test.ts`: `finalizes an exam with an unanswered item, then hides it from every review once withdrawn`
- `src/application/use-cases/get-previous-attempt.test.ts`: `reveals nothing for an omitted attempt on a question %s`
- `src/application/use-cases/get-previous-attempt.test.ts`: `still reveals the revision a learner answered on a question %s`

### R20. An item counts toward a score when the learner had a fair chance at it, recorded when its session ends, and its content is not now in doubt (withdrawn, under review, or key-corrected). A retired question keeps counting, and activity counts (total answered, the streak) count every answer.

- `src/domain/services/scoring.test.ts`: `with a fair chance %s, counts an item whose question is %s: %s`
- `tests/integration/scores-when-content-changes.integration.test.ts`: `agrees across the summary, History and the Dashboard as content changes during and after an exam`
- `src/application/use-cases/get-user-stats.test.ts`: `leaves a withdrawn question out of accuracy, not out of activity`

### R21. An answer graded on an answer key corrected since is left out of every score, says so on review, and returns to the Incorrect practice filter. A stored grade is never changed.

- `tests/shared/attempt-score-contract.ts`: `$name`
- `tests/integration/question-repository-key-corrections.integration.test.ts`: `includes a latest answer whose key was corrected since, but not one whose stem was reworded`
- `tests/integration/seed-revision-append.integration.test.ts`: `keeps a graded attempt on its revision and grade after a key correction`
- `components/question/question-update-notice.test.tsx`: `says the attempt is not scored and links to the corrected question`

### R26. A release built from unchanged content keeps the question's current revision, even when the same content was stored in an earlier revision.

- `tests/integration/content-release-revision-matching.integration.test.ts`: `keeps the live revision after a key regression and repair`
- `tests/integration/content-release-revision-matching.integration.test.ts`: `does not reuse a staged %s release that names an older identical revision`

### R22. An exam's submit warning counts only the unanswered questions that would be scored.

- `src/application/use-cases/get-practice-session-review-content-changes.test.ts`: `counts the scored items left unanswered in an active exam`
- `src/domain/services/scoring.test.ts`: `in %s mode, answered: %s, question %s: counts %s`
- `app/(app)/app/practice/[sessionId]/components/exam-review-view.browser.spec.tsx`: `omits the unanswered warning when no unanswered item will be scored`

### R27. Stage and activation previews name answer-key changes separately from other content changes. Activation refuses a reviewed plan if its key-change list has changed.

Bootstrap's reviewed plan also binds its frozen list of earlier revision candidates. That list is history metadata, never selectable content.

A changed key that matches earlier history needs an explicit return name, reason and authority. Earlier history means activated release items plus the frozen bootstrap list; later unpublished revisions do not count. The rule also applies to key-changing rollbacks and hold lifts. Activation binds the return list to its reviewed plan.

- `tests/integration/content-release-key-returns.integration.test.ts`: `names a stale-key return in both previews and records the named return and later repair decisions`
- `tests/integration/content-release-key-returns.integration.test.ts`: `does not treat a later %s-only stage as earlier publication`
- `tests/integration/content-release-key-returns.integration.test.ts`: `invalidates a preview when intervening activations turn its new key into a return`
- `tests/integration/content-release-key-returns.integration.test.ts`: `refuses an unnamed key-returning hold lift atomically and accepts its explicitly named decision`

- `tests/integration/content-release-bootstrap-candidates.integration.test.ts`: `refuses a bootstrap preview after only its historical candidate set changes`
- `tests/integration/content-release-bootstrap-candidates.integration.test.ts`: `never publishes historical candidates when activating or rolling back the bootstrap`

- `tests/integration/content-release-key-preview.integration.test.ts`: `compares %s in both previews`
- `tests/integration/content-release-key-preview.integration.test.ts`: `prints each staging change by kind without publishing the preview`
- `tests/integration/content-release-key-preview.integration.test.ts`: `canonicalizes stored correct text as the seed does before comparing keys`
- `tests/integration/content-release-key-preview.integration.test.ts`: `refuses an old preview when lifting a hold changes the compared key`

### R31. After bootstrap, ordinary release commands admit only source commits at or after the highest admitted commit on the content repository's main first-parent history. Rollback preserves that watermark. The first release after the bootstrap starts from the commit the owner verified against live content, or a later one.

The first sourced stage names that verified baseline and initializes the watermark. Bootstrap still adopts the live bank and does not prove its source. Draft and permanent-archive dispositions remain explicit decisions bound to the activation plan. A source-free release can be activated by the ordinary command only if it was activated before.

- `scripts/content-release/content-source.test.ts`: `archives the selected main commit and ignores dirty working files`
- `scripts/content-release/content-source.test.ts`: `refuses a merged side-branch commit and a rewritten main watermark`
- `tests/integration/content-release-source.integration.test.ts`: `starts the first release after the bootstrap only from the verified baseline or later`
- `scripts/content-release/content-source.test.ts`: `refuses a snapshot older than the verified baseline`
- `tests/integration/content-release-source.integration.test.ts`: `previews without a watermark write, then binds source identity and the activation plan`
- `tests/integration/content-release-source.integration.test.ts`: `re-reads the watermark after waiting for the release-pointer lock`
- `tests/integration/content-release-source.integration.test.ts`: `refuses a legacy unactivated release but rolls back a previously activated legacy release without lowering the watermark`
- `tests/integration/content-release-source.integration.test.ts`: `binds different dispositions of one commit to distinct manifests and activation plans`

## Subscription and billing

### R2. Without an entitled subscription, practice, bookmarks and statistics are refused as unsubscribed.

- `src/adapters/controllers/require-entitled-user-id.test.ts`: `throws UNSUBSCRIBED when the user is not entitled`
- `src/adapters/controllers/practice-controller-session-lifecycle.test.ts`: `returns UNSUBSCRIBED when not entitled`
- `src/adapters/controllers/bookmark-controller.test.ts`: `returns UNSUBSCRIBED when not entitled`
- `src/adapters/controllers/stats-controller.test.ts`: `returns UNSUBSCRIBED when not entitled`

### R3. Access ends the instant the paid period ends, whatever the subscription's status says.

- `src/domain/services/entitlement.test.ts`: `returns false for active with expired period`
- `src/domain/services/entitlement.test.ts`: `returns false when currentPeriodEnd is exactly now`
- `src/domain/services/entitlement.test.ts`: `returns false for pastDue with expired period`

### R10. A first checkout carries a 7-day trial; anyone who has had a subscription gets none; a subscription still current refuses a second checkout.

- `src/application/use-cases/create-checkout-session.test.ts`: `passes a 7-day trial to the gateway for a first-time user`
- `src/application/use-cases/create-checkout-session.test.ts`: `does not pass a trial to the gateway for a user with an existing subscription row`
- `src/application/use-cases/create-checkout-session.test.ts`: `returns ALREADY_SUBSCRIBED when a subscription is still current`

### R11. A scheduled cancellation keeps access until the paid period ends, and stops renewal notices.

- `src/domain/services/entitlement.test.ts`: `keeps access until the period ends when cancellation is scheduled`
- `tests/integration/send-renewal-notices-job.integration.test.ts`: `selects only active, renewing annual subscriptions in the supplied window`
- `tests/integration/send-renewal-notices-job.integration.test.ts`: `lists active, renewing monthly subscriptions in id order, after a cursor`
- `tests/e2e/stripe-hosted-portal-cancellation.spec.ts`: `a paid subscriber cancels without obstruction; renewal stops and access continues to the period end`

### R12. A repeated or out-of-order billing event never applies twice and never moves a subscription back to an older state.

- `tests/integration/stripe-event-repository.integration.test.ts`: `claims an event once without overwriting its type or processed state on replay`
- `src/adapters/controllers/stripe-webhook-controller.test.ts`: `does not reprocess an event completed between peek and lock`
- `tests/integration/bug-regression-subscription-observation-version-fence.integration.test.ts`: `rejects the reverse-commit webhook observation and retries with current state`

### R24. A checkout never hands back a Session once the customer holds a live subscription, including one that started while the checkout request ran: it expires that Session and refuses. A Session handed back before another Checkout completes stays completable until R25's sweep reaches it (BUG-343).

- `src/adapters/gateways/stripe/stripe-checkout-sessions-completed-in-flight.test.ts`: `refuses %s with ALREADY_SUBSCRIBED and leaves no open Session when the first Checkout completes after the subscription check`
- `src/adapters/gateways/stripe/stripe-checkout-sessions-completed-in-flight.test.ts`: `refuses with ALREADY_SUBSCRIBED when the Session it expires for another plan completed first`
- `src/adapters/gateways/stripe/stripe-checkout-sessions-completed-in-flight.test.ts`: `refuses with ALREADY_SUBSCRIBED when the Session it could not inspect completed before its expire`
- `src/adapters/gateways/stripe/stripe-checkout-sessions-completed-in-flight.test.ts`: `refuses with ALREADY_SUBSCRIBED instead of reusing an open Session when another completed after the subscription check`

### R25. When the webhook stores a completed subscription Checkout's subscription, it ends the customer's other open subscription Checkout pages created before that event. If one stays open, the event fails, and Stripe sends it again. A page completed before the sweep reaches it is logged as a second subscription, which BUG-343's option 4 will correct.

- `src/adapters/gateways/stripe/stripe-checkout-sessions-completion-sweep.test.ts`: `expires the customer's other open subscription Sessions and keeps the completed one`
- `src/adapters/gateways/stripe/stripe-checkout-sessions-completion-sweep.test.ts`: `throws when an open Session cannot be expired, so the webhook is retried`
- `src/adapters/controllers/stripe-webhook-controller-completion-sweep.test.ts`: `asks the gateway to expire the customer's other open Checkout Sessions created before the event, after storing the subscription`
- `src/adapters/controllers/stripe-webhook-controller-completion-sweep.test.ts`: `fails the delivery when the sweep fails, and sweeps again when Stripe sends the event again`
- `src/adapters/gateways/stripe/stripe-checkout-sessions-completion-sweep.test.ts`: `keeps a Session created after the completion's event, which belongs to a later checkout`
- `src/adapters/gateways/stripe/stripe-checkout-sessions-completion-sweep.test.ts`: `logs an error, and goes on, when another Session completed too`

## Account

### R13. Deleting an account removes the learner's data and their Stripe customer; billing events that arrive later are acknowledged, not used to recreate anything.

- `src/adapters/controllers/clerk-webhook-controller-deletion.test.ts`: `deletes the Stripe customer and local user when receiving user.deleted`
- `tests/integration/controllers-webhooks.integration.test.ts`: `deletes the user and cascades stripe data on user.deleted`
- `tests/integration/bug-regression-post-deletion-webhook-fk.integration.test.ts`: `returns 200, warns, and records a non-failed event when the local user was deleted`

## Feedback and bookmarks

### R14. Feedback on a question attaches only to the learner's own attempt or session, and only when it contains that question.

- `src/application/use-cases/validate-feedback-context.test.ts`: `rejects an attempt owned by another user with NOT_FOUND`
- `src/application/use-cases/validate-feedback-context.test.ts`: `rejects a session that does not contain the question with VALIDATION_ERROR`
- `src/application/use-cases/validate-feedback-context.test.ts`: `rejects an attempt for a different question with VALIDATION_ERROR`

### R15. Only an available question can be newly bookmarked, and removing a bookmark twice is harmless. An existing bookmark survives the question becoming unavailable, and names its state.

- `src/application/use-cases/set-bookmark.test.ts`: `throws NOT_FOUND when adding an unpublished question`
- `src/application/use-cases/set-bookmark.test.ts`: `returns bookmarked=false when removing an already absent bookmark`
- `src/application/use-cases/get-bookmarks.test.ts`: `labels a bookmarked question that is %s`
