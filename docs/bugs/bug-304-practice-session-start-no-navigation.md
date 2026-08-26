# BUG-304: Practice Session Start Can Click Without Navigation or Error

**Status:** Open
**Severity:** P3
**Date:** 2026-08-25
**Confirmed:** 2026-08-25 (original required-E2E failure on this clone; promotion CI then reproduced a separate navigation-observation race in the diagnostic helper)
**Component:** Practice / session starter / required E2E diagnostics

---

## Summary

At 2026-08-25 03:15Z, the required Playwright case
`tests/e2e/practice.spec.ts:378` ("resets the active question viewport after
next and previous navigation") failed inside
[`startSession()`](../../tests/e2e/helpers/session.ts) while waiting for the
practice-session URL after clicking **Start session**. The page remained on the
starter form, the clicked button was active, the configuration controls were
enabled, and the rendered alert was empty. The retry passed, and a later clean
full run passed 42/42.

This is a real required-lane defect even though the retry recovered. The test's
15-second navigation bound equals the client mutation's own 15-second bound,
so the test can fail before a server-action timeout is rendered. It then reports
only a predicate timeout and discards the most useful causal evidence: whether
the action was sent and what error the page rendered.

## Incident Evidence

- Observed at 2026-08-25 03:15Z in
  `tests/e2e/practice.spec.ts:378`, case "resets the active question viewport
  after next and previous navigation".
- Failure site: `tests/e2e/helpers/session.ts:175`,
  `waitForUrl(/\/app\/practice\/[^/]+$/, 15_000)`, after
  `startSessionButton.click()`.
- The saved `error-context.md` snapshot showed the starter form intact,
  **Start session** `[active]`, configuration controls not disabled, and an
  empty `role="alert"`. The absent loading state means the UI had not published
  `sessionStartStatus = 'loading'` by snapshot time.
- The automatic retry passed. A subsequent clean full E2E run passed 42/42.
- Original diagnostic paths:
  `test-results/practice-practice-resets-t-81c89-ext-and-previous-navigation-chromium/error-context.md`
  and `playwright-report/index.html`.
- Those original artifacts are no longer present in the working tree: the
  subsequent passing run replaced `test-results/` with a passing
  `.last-run.json` and regenerated the HTML report. New characterization runs
  must preserve any failing `trace.zip`, `error-context.md`, and report before
  another E2E invocation.

## Relevant Code Path

[`practice-page-session-start.ts`](<../../app/(app)/app/practice/practice-page-session-start.ts>)
wraps `startPracticeSession` in
`withTimeout(..., STANDARD_MUTATION_TIMEOUT_MS)` at lines 115-126 and navigates
only after a successful result at lines 195-199.
[`timeout-tiers.ts`](<../../app/(app)/app/shared/timeout-tiers.ts>) defines
`STANDARD_MUTATION_TIMEOUT_MS` as 15 seconds. The E2E helper waits exactly
15 seconds for navigation, so an action timeout cannot reliably reach the
rendered alert before the helper fails.

The source also contains a concrete no-dispatch path that fits the snapshot:

1. Filling **Questions** synchronously rotates the start idempotency owner
   through `createSessionCountChangeHandler`.
2. React publishes the replacement `onStartSession` closure on the following
   render.
3. A handler captured by the prior render sees a superseded owner in
   [`use-practice-session-start.ts`](<../../app/(app)/app/practice/hooks/use-practice-session-start.ts>)
   and intentionally returns `Promise.resolve()` without calling the controller
   or changing UI state.
4. The E2E helper fills the count and clicks the already-enabled Start button
   without any barrier proving that the controlled input and handler render
   committed.

This establishes a reachable mechanism, not that it caused the 03:15Z
incident. Five fresh trace-on, retry-free runs did not reproduce the failure, so
no trace can separate that mechanism from the alternatives below.

## Hypotheses to Test

1. **Click did not dispatch the current React handler.** A hydration or render
   transition race, including the stale-handler path above, fits the active
   button, enabled controls, absent loading state, and empty alert.
2. **The action started, but loading did not render before the snapshot.** Trace
   and request evidence must show whether a server-action request left the page.
3. **The server action exceeded 15 seconds.** The client would render its timeout
   only after the test's equal 15-second navigation bound, so the current helper
   can hide this outcome.
4. **The E2E state reset raced the starter.** This is currently the weakest
   hypothesis: `practice.spec.ts` awaits `runE2EUserStateReset()` in
   `beforeEach`, and the reset verifies the deterministic baseline before it
   returns. It stays in the characterization until trace evidence rules it out.

## Characterization Result

The complete practice spec ran five times through the local E2E orchestrator
with Chromium, retries disabled, trace always on, and the line reporter. Each
run selected the global setup plus all nine practice cases:

| Run | Result | Wall time |
| --- | --- | --- |
| 1 | 10/10 passed | 86.15 s |
| 2 | 10/10 passed | 87.98 s |
| 3 | 10/10 passed | 87.70 s |
| 4 | 10/10 passed | 84.83 s |
| 5 | 10/10 passed | 84.39 s |

The target case passed in all five runs. No failing trace exists to answer
whether `startPracticeSession` was sent, whether a response arrived, or which
client transition occurred in the original incident. The original intermittent
cause therefore remains unproven and BUG-304 stays Open.

## Promotion Regression and Root Cause

PR #834 merged the first diagnostic fix to `dev` as `a083c3d5`.
Promotion PR #835 then exposed a branch-local regression on exact head
`a083c3d5` in CI run
`32903291145`: the practice summary case timed out at 120 seconds and the
review-mode audit timed out at 180 seconds. Both passed on retry, so Playwright
reported `2 flaky` / `40 passed` after an 8.9-minute run. The green aggregate
was rejected as evidence.

Both failure contexts show that navigation and session creation had succeeded:
the page was already on a session URL with the Tutor Session heading, question
navigator, progress marker, and answer choices. The thrown diagnostic instead
claimed that start produced neither navigation nor an alert. Its preserved
cause identifies the race:

1. `waitForSessionStartOutcome()` checked the pre-navigation URL.
2. It began `role="alert"` text collection while the successful navigation
   committed.
3. Playwright rejected that locator read because navigation destroyed its
   execution context.
4. The helper's catch block did not re-check the authoritative URL and converted
   the successful navigation into a test failure.

The CI artifact is `playwright-report` from run `32903291145`; its two preserved
failure snapshots are under the corresponding practice and review-mode
`test-results/**/error-context.md` paths. Because tracing was configured
`on-first-retry`, the attached traces describe the passing retries rather than
the two failed first attempts. This evidence proves the promotion regression's
root cause; it does not retroactively prove what caused the original 03:15Z
no-navigation incident.

## Diagnostic and Synchronization Fix

The implementation closed the diagnosis blind spot without retrying the click:

- `START_SESSION_NAVIGATION_TIMEOUT_MS` is 20 seconds, five seconds beyond the
  shared 15-second client mutation timeout;
- the helper blurs the controlled Questions input and observes its requested
  value before clicking Start, creating a render barrier for the count-change
  intent;
- outcome polling accepts only the expected session URL or a newly rendered,
  non-empty alert relative to the pre-click alert multiset;
- a rendered action error fails with redacted alert text, while an unchanged
  pre-existing alert is ignored; and
- a silent outcome reports the current URL, Start enabled state, and redacted
  alert inventory instead of Playwright's bare predicate timeout.

The red-first focused suite failed 5 of 11 cases before implementation: timeout
ordering, count-render synchronization, delayed rendered-error capture, silent
diagnostics, and provider-identifier redaction. All 11 passed after the helper
change. `pnpm typecheck` passed, and a post-change retry-free traced practice
run passed 10/10 in 87.72 seconds.

The promotion regression added a twelfth focused case. Before the follow-up
fix, it completed navigation during alert collection, threw the same execution-
context error as CI, and failed with the contradictory session-URL diagnostic
(1 failed / 11 passed). The minimum fix re-checks the session URL after a poll
exception; the helper then continues to require the Tutor/Exam heading, answer
choices, and requested question count. The focused suite passed 12/12 after the
change, so a URL transition cannot become a false success while a successful
navigation can no longer become a false failure.

PR #836 merged that first follow-up to `dev` as merge commit `0cb072a4`.
Promotion PR #835 then exposed a second ordering in exact-head CI run
`32912478032`: the exam-mode case timed out at 120 seconds, recovered on retry,
and produced an aggregate `1 flaky` / `41 passed`. Its saved failure context was
already on the completed **Session Summary**, with one question represented and
zero recorded answers. The preserved cause was again an alert-locator read
whose execution context navigation destroyed, but this time the catch's
immediate URL re-check ran before navigation committed. The catch then entered
the diagnostic path, whose second alert read consumed the remaining test bound;
the final diagnostic observed the session URL only after the test timed out.

The artifact is `playwright-report` (artifact `9587258477`) from run
`32912478032`. The preserved first-attempt snapshot is
`test-results/practice-practice-exam-mod-58ef3-without-showing-explanation-chromium/error-context.md`;
the available `trace.zip` belongs to the passing retry because CI traced only
the first retry.

A thirteenth focused case models that exact ordering: the first alert read loses
its execution context, the immediate catch-time URL check still sees the starter,
and navigation becomes visible on the following poll. It failed red with the
same contradictory session-URL diagnostic (1 failed / 12 passed). The minimal
fix treats only Playwright's navigation-destroyed execution-context error as an
in-progress poll outcome, so the next iteration observes the committed URL;
other errors still propagate. The focused suite then passed 13/13. Delayed
rendered alerts and the downstream Tutor/Exam heading, answer-choice, and
question-count assertions remain required.

The exact exam-mode case that failed in run `32912478032` then ran five times
through the local orchestrator with Chromium, retries disabled, and tracing on.
Each invocation selected only global setup plus that case and passed 2/2; wall
times were 33, 30, 31, 29, and 28 seconds. These runs verify the follow-up under
the real browser seam but do not erase the failed CI attempt or prove the cause
of the original 03:15Z no-navigation event.

The render barrier removes the concrete stale-count-handler window from the E2E
helper, but the five passing characterization runs cannot establish that this
window caused the 03:15Z incident. A future recurrence now has a longer bound,
the rendered application error, and an always-on trace with which to decide.

## Impact

The observed failure makes a required lane non-deterministic and teaches a
retry to erase evidence. The same silent stale-handler branch is reachable on a
production interaction seam, but no user-frequency or production incident is
established. The operation is recoverable by trying again and no committed
session corruption was observed, so P3 is proportionate.

## Resolution State

Open. The diagnostic/synchronization fix and both navigation-observation
follow-ups are promoted to `main` through PR #835, merge commit `47b31234`.
CodeRabbit approved exact head `92c35965`; PR run `32955114161` and post-merge
main run `32960005070` each passed required E2E 43/43 on the first attempt with
zero flaky results. Production deployment `6102157792` completed successfully,
`addictionboards.com` returned HTTP 200, and `/api/health` reported the app and
database healthy.

Those receipts close the diagnosed timeout/diagnostic blind spot and the two
navigation-observation races. They do not prove why the original 03:15Z click
left the starter visible with no loading state or alert. BUG-304 therefore
remains Open; a future recurrence must be adjudicated from the now-preserved
trace, request, rendered-alert, and URL evidence rather than retry recovery.

## Related

- [DEBT-411](../_archive/debt/debt-411-local-e2e-flakiness-and-error-masking.md)
  — five practice-flow failures were previously masked during local E2E work.
- [DEBT-323](../_archive/debt/debt-323-agent-browser-react-click-failures.md)
  — practice-flow primary buttons previously produced silent no-op clicks under
  `agent-browser`; this is historical similarity, not proof of the Playwright
  cause.
- PR #822 commits `a3b015c1` and `3a5dfcde` — the same helper previously
  reselected already-active status and mode controls, rotated request ownership,
  and clicked a stale handler; both paths were fixed by waiting on current
  intent rather than retrying the click.
