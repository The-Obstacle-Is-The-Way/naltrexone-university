# DEBT-293: E2E Shared-State Structural Flakiness

**Priority:** P1
**Created:** 2026-03-09
**Status:** Resolved
**Resolved:** 2026-03-09
**Discovered during:** CI run on `main` (PR #186 merge commit `ab5f21c1`, run `22852148955`)
**Audited for accuracy:** 2026-03-09

---

## Audit Verdict

The suite has a real shared-state isolation problem, but the original DEBT-293 draft overstated and misattributed several causal claims.

The debt is now resolved in code:

- mutating authenticated E2E specs reset the shared user back to the deterministic baseline in `beforeEach`
- `tests/e2e/helpers/session.ts` verifies that the created session matches the requested count before returning
- `tests/e2e/session-review-navigation.spec.ts` derives navigator expectations from the review page's own progress indicator instead of assuming the requested count
- `docs/dev/testing-infrastructure.md` now points to the full reset helper as the primary shared-state mitigation pattern

**Verified:**

- All authenticated E2E specs share one Clerk user, one server-side database state, and one suite-level reset in `global.setup.ts`.
- Playwright retries restart the worker/browser process, but they do **not** reset server-side state.
- The spec immediately before `session-review-navigation.spec.ts` leaves an incomplete practice session behind.
- `session-review-navigation.spec.ts` attempt 1 can reach review and still fail because review navigation/count assumptions are stricter than the implementation guarantees.

**Disproven or corrected:**

- The failure is **not** explained by exhausting the two deterministic placeholder questions.
- `review-mode-audit.spec.ts` mutates both sessions and attempts; the original DEBT-293 table incorrectly marked it read-only.
- `subscribe-and-practice.spec.ts` mutates attempts, but it does **not** create sessions.
- `docs/dev/testing-infrastructure.md` already warns against `networkidle` and `waitForTimeout()` band-aids; DEBT-293 should not claim otherwise.
- A `navigatorButtons` count of `1` for a 2-question session is a **data/contract** issue, not a pure rendering-timing issue.

---

## Triggering Incident

PR #186 merged CSS-only changes (DEBT-290). CI then failed in `tests/e2e/session-review-navigation.spec.ts`:

- **Attempt 1** reached review mode and failed at line 93: expected 2 navigator buttons.
- **Retry 1** failed at line 23: `Question 1 of 2` was not found after `startSession(page, 'tutor', 2)`.
- **Retry 2** repeated the retry-1 failure.

The code change was visual-only, so the failure pattern points to test infrastructure or test-data assumptions, not product behavior regression.

---

## Verified Execution Order

`pnpm exec playwright test --list --project=chromium` currently yields this order:

1. `tests/e2e/global.setup.ts`
2. `tests/e2e/bookmarks.spec.ts`
3. `tests/e2e/core-app-pages.spec.ts`
4. `tests/e2e/cross-page-navigation.spec.ts`
5. `tests/e2e/dark-mode.spec.ts`
6. `tests/e2e/history.spec.ts`
7. `tests/e2e/marketing-contrast.spec.ts`
8. `tests/e2e/practice.spec.ts`
9. `tests/e2e/pricing-unauthenticated.spec.ts`
10. `tests/e2e/review-mode-audit.spec.ts`
11. `tests/e2e/session-continuation.spec.ts`
12. `tests/e2e/session-review-navigation.spec.ts`
13. `tests/e2e/smoke.spec.ts`
14. `tests/e2e/subscribe-and-practice.spec.ts`
15. `tests/e2e/subscribe.spec.ts`
16. `tests/e2e/theme-preference.spec.ts`

Within each file, tests run in declaration order.

### Suite-Level Baseline

`tests/e2e/global.setup.ts` does four things, once per suite run:

1. Verifies E2E credentials.
2. Seeds/ensures the shared user + active Stripe subscription.
3. Deletes all `idempotency_keys`, `attempts`, `bookmarks`, and `practice_sessions` for the shared E2E user.
4. Reseeds a deterministic baseline of:
   - 1 completed tutor session
   - 2 attempts
   - 1 bookmark

### Specs That Call `startSession()`

| Order before/at target | Spec / test | Sessions created | Questions answered | Cleanup hooks |
|---|---|---:|---:|---|
| 8.1 | `practice.spec.ts` tutor test | 1 completed | 1 | none |
| 8.3 | `practice.spec.ts` exam test | 1 completed | 1 | none |
| 10.3 | `review-mode-audit.spec.ts` session-breakdown test | 1 completed | 1 | none |
| 10.4 | `review-mode-audit.spec.ts` read-only/retry test | 1 completed | 1 | none |
| 11.1 | `session-continuation.spec.ts` | 1 incomplete | 0 | none |
| 12.1 | `session-review-navigation.spec.ts` first test | 1 completed | 2 | none |

### Earlier Specs That Dirty State Before `session-review-navigation.spec.ts`

By the time `session-review-navigation.spec.ts` starts, earlier specs have already added:

- **5 completed sessions** before the target file runs:
  - 1 baseline session from `global.setup.ts`
  - 2 from `practice.spec.ts`
  - 2 from `review-mode-audit.spec.ts`
- **1 incomplete session** from `session-continuation.spec.ts`
- **22 total attempts** before the target file's first assertion:
  - 2 baseline attempts
  - 20 more from earlier specs

The **immediately preceding spec absolutely dirties state**: `session-continuation.spec.ts` leaves an incomplete session behind. `tests/e2e/helpers/session.ts` then "abandons" it by calling `endPracticeSession`, which **ends** the session and leaves a completed row in history. It does **not** delete it.

---

## Question Exhaustion Math

### What the Reset Helper Actually Guarantees

`tests/e2e/helpers/reset-e2e-user-state.ts` hard-codes exactly **two required placeholder fixtures**:

- `placeholder-01-naltrexone-mechanism`
- `placeholder-02-buprenorphine-induction-timing`

It seeds:

- 1 completed tutor session containing both placeholder question IDs
- 1 correct in-session attempt on placeholder 01
- 1 incorrect ad hoc attempt on placeholder 02
- 1 bookmark on placeholder 01

So the deterministic placeholder baseline starts as:

| Placeholder subset only | Count |
|---|---:|
| `Unanswered` | 0 |
| `Incorrect` | 1 |
| `Bookmarked` | 1 |

### What CI Actually Seeds

CI runs:

```bash
pnpm db:seed
```

with:

```bash
SEED_INCLUDE_PLACEHOLDERS=true
```

The seed script reads **all** `content/questions/**/*.mdx`. On this repository snapshot, that is:

- **970** published MDX question files
- **10** published placeholder MDX files under `content/questions/placeholder/`

So the two reset-helper placeholders are a deterministic baseline subset, not the entire question pool available to `startSession()`.

### Exact Placeholder Statuses Before `session-review-navigation.spec.ts`

The placeholder-targeting specs before the target file mutate the two deterministic slugs in a fully traceable way:

- `core-app-pages.spec.ts`: placeholder 01 -> incorrect
- `cross-page-navigation.spec.ts`: placeholder 01 -> correct, then incorrect
- `history.spec.ts`: placeholder 01 -> incorrect, then correct
- `review-mode-audit.spec.ts`:
  - placeholder 01 -> correct
  - placeholder 02 -> incorrect
  - placeholder 01 -> correct
  - placeholder 01 -> incorrect

Immediately before `session-review-navigation.spec.ts`:

| Deterministic placeholder subset only | Count |
|---|---:|
| `Unanswered` | 0 |
| `Incorrect` | 2 |
| `Bookmarked` | 1 |

That means the original placeholder-exhaustion theory was backwards:

- the placeholder `Unanswered` pool is indeed exhausted
- but the placeholder `Incorrect` pool already contains **2** questions

So even if the helper had to fall back from `Unanswered`, the two deterministic placeholders alone still satisfy `count = 2` for `Incorrect`.

### Overall `Unanswered` Pool Before the Target Spec

Five earlier tests each answer exactly one previously unanswered non-placeholder question:

1. `practice.spec.ts` tutor test
2. `practice.spec.ts` quick-practice test
3. `practice.spec.ts` exam test
4. `review-mode-audit.spec.ts` session-breakdown test
5. `review-mode-audit.spec.ts` read-only/retry test

Those five tests cannot consume the two deterministic placeholders, because the baseline already marks both placeholder questions as answered before any spec runs.

So before `session-review-navigation.spec.ts` starts, the maximum number of distinct answered questions is:

- placeholder 01
- placeholder 02
- 5 additional non-placeholder questions

That is **7** distinct answered questions total.

With **970** seeded questions in CI, at least:

```text
970 - 7 = 963
```

questions remain in the overall `Unanswered` pool.

### What `startSession(page, 'tutor', 2)` Actually Does

`tests/e2e/helpers/session.ts` probes statuses in this order:

1. `Unanswered`
2. `Incorrect`
3. `Bookmarked`

It selects the first status for which the UI's `Start session` button is enabled.

With at least **963** unanswered questions still available in CI, the helper should stop at `Unanswered`. It does **not** need placeholder fallback logic to find 2 questions.

**Conclusion:** the original DEBT-293 claim that earlier specs exhausted the placeholder pool and thereby prevented `startSession(page, 'tutor', 2)` from finding 2 questions is not supported by the code or by the seeded content volume.

### Helper Risk Identified During Audit

The audit found a real helper weakness:

- it waits only for `Start session` to be **enabled**
- the UI intentionally allows starting a session where `actualCount < requestedCount`
- the available-count request is debounced

So a future line-23 failure could still mean:

- the helper started a **smaller session** than requested, or
- the helper clicked through while counts were stale

That was a **helper/UI contract problem**, not the placeholder-exhaustion theory from the original draft.

It is now addressed: `tests/e2e/helpers/session.ts` reads the visible `Question 1 of N` progress indicator after answer choices load and throws `startSession created ${actual}-question session but ${requested} were requested` whenever the UI starts a smaller session than requested.

---

## Retry Behavior Verification

Playwright's retry model is clear:

- a failed test discards the worker process and retries in a fresh worker/browser process
- Playwright explicitly recommends cleaning **server-side** state yourself when needed

That matches this suite:

- browser state is fresh on retry
- database state is **not**

### What `startSession()` Cleans Up

`tests/e2e/helpers/session.ts` only auto-cleans one thing:

- a **preexisting incomplete session**

It does this by clicking `Abandon session`, which flows through `endPracticeSession`. That ends the session and leaves the completed row in the database.

It does **not** delete:

- completed sessions
- attempts from prior runs
- idempotency rows

### What That Means for the Incident

The incident report says attempt 1:

1. started a 2-question session
2. answered both questions
3. ended the session
4. navigated to review
5. failed at line 93

So by the time retry 1 starts:

- there is **no incomplete session from attempt 1** for `startSession()` to abandon
- the two attempts from attempt 1 still exist
- the completed session from attempt 1 still exists

Retry 1 therefore proves a narrower point than the original doc claimed:

- `startSession()` does **not** clean up completed-session artifacts from a failed prior attempt

That part of the cascading-retry story is real.

But the earlier explanation that those two new attempts exhausted the available 2-question pool is disproven by the seeded-question math above.

---

## Navigator Button Count Failure

The navigator failure at line 93 is not well-explained by "rendering timing under CI pressure."

### What the Component Guarantees

`ReviewQuestionNavigator` renders:

- exactly one button per `sessionNavigation.questions` item
- no lazy second phase where buttons appear after the heading

The heading and buttons are rendered from the same data structure.

### Where Fewer Than 2 Buttons Can Come From

On the review page, `useQuestionPageController` builds `sessionNavigation` from only `isAvailable: true` session-review rows. That means a nominal 2-question session can show fewer than 2 navigator buttons if:

1. the session actually started with fewer than 2 questions, or
2. `getPracticeSessionReview()` returned 2 rows but only 1 remained `isAvailable: true`

Both are **data/contract** scenarios.

They are not the same as a pure DOM-timing problem.

**Conclusion:** line 93 should be treated as evidence of either:

- a smaller-than-requested session, or
- a mismatch between session review rows and navigator assumptions

It should not be described as "likely a rendering timing issue" without stronger evidence.

---

## DEBT-281 Pattern Accuracy

`tests/e2e/helpers/reset-bookmarks-for-e2e-user.ts` is a good pattern reference at the **approach** level:

- direct DB reset
- deterministic reseed
- explicit post-reset verification

But the analogy is not 1:1.

### Why Sessions/Attempts Are More Complex Than Bookmarks

Bookmark reset is a single-table operation:

- delete bookmark rows
- insert 1 deterministic bookmark row

Session reset is multi-table and order-sensitive:

- `attempts.practice_session_id` uses `ON DELETE SET NULL`
- if you delete `practice_sessions` **before** deleting `attempts`, the attempts survive and still affect `Unanswered` / `Incorrect`
- the existing full reset helper also deletes `idempotency_keys`

So a correct session/attempt reset must, at minimum:

1. delete `attempts`
2. delete `practice_sessions`
3. usually clear `idempotency_keys` as part of the same user-state reset
4. reseed the deterministic baseline
5. verify the result

That is why the existing `runE2EUserStateReset()` helper is a safer foundation than inventing a bookmark-style single-table session reset.

---

## Other Shared-State Mutation Vectors

The original DEBT-293 draft missed several real attempt writers.

### Per-Spec Writes Before the Target File

These specs mutate server-side state before `session-review-navigation.spec.ts`:

- `bookmarks.spec.ts`: bookmarks
- `core-app-pages.spec.ts`: attempts
- `cross-page-navigation.spec.ts`: attempts + bookmarks
- `history.spec.ts`: attempts
- `practice.spec.ts`: sessions + attempts
- `review-mode-audit.spec.ts`: sessions + attempts + bookmarks
- `session-continuation.spec.ts`: sessions

### What Is *Not* Mutated by Specs

No spec body mutates:

- Clerk profile data
- app user profile fields
- Stripe subscription/customer rows
- Stripe webhook/event rows

Those writes occur only in `tests/e2e/global.setup.ts` via `seedTestSubscription()`.

### Tests That Read Setup-Seeded Baseline State

These tests explicitly rely on preexisting setup-seeded state:

- `session-review-navigation.spec.ts` test 2 expects at least one completed history session
- `session-review-navigation.spec.ts` test 3 expects at least one Quick Practice history row
- the authenticated mutating specs now satisfy those preconditions via per-test `runE2EUserStateReset()` instead of inheriting state from earlier specs

---

## Phase 1 Sufficiency

A **full per-test user-state reset** is sufficient to prevent question-availability drift for this Clerk user.

Why:

- `Unanswered` / `Incorrect` status filtering is derived from the current `attempts` table for that user
- `Bookmarked` is derived from the current `bookmarks` table for that user
- there is no separate lifetime user-question progress table or denormalized lifetime attempt counter that survives those resets

So if a per-test reset deletes and reseeds:

- `idempotency_keys`
- `attempts`
- `bookmarks`
- `practice_sessions`

then the E2E user's question availability returns to a deterministic baseline. There is no hidden lifetime counter that continues degrading availability after those rows are removed.

---

## Resolution Implemented

### Phase 1: Full Per-Test User-State Reset Now Runs in Every Mutating Spec

`runE2EUserStateReset()` is now wired into `beforeEach` for every authenticated spec that mutates attempts, sessions, or bookmarks:

- `bookmarks.spec.ts`
- `core-app-pages.spec.ts`
- `cross-page-navigation.spec.ts`
- `history.spec.ts`
- `practice.spec.ts`
- `review-mode-audit.spec.ts`
- `session-continuation.spec.ts`
- `session-review-navigation.spec.ts`
- `subscribe-and-practice.spec.ts`

That removes the old suite-level-only assumption and restores the shared E2E user to the same deterministic baseline before each mutating test body runs.

### Phase 2: `startSession()` Now Verifies the Created Session Count

`tests/e2e/helpers/session.ts` now:

- waits for answer choices to load
- reads the visible `Question 1 of N` progress indicator
- throws an explicit error if `N < requestedCount`

`tests/e2e/helpers/session.test.ts` covers both the passing `Question 1 of 2` case and the explicit smaller-session failure case.

### Phase 3: Review Navigator Assertions Now Use the Page Contract

`tests/e2e/session-review-navigation.spec.ts` no longer hardcodes navigator count `2` after entering review mode.

Instead it:

- reads the visible `Question 1 of N` review progress text
- parses `N`
- asserts that the navigator button count matches that displayed review count

The parsing logic lives in `tests/e2e/helpers/question-progress.ts` with unit coverage in `tests/e2e/helpers/question-progress.test.ts`.

### Phase 4: Testing Infrastructure Docs Now Point to the Full Reset Pattern

`docs/dev/testing-infrastructure.md` now reflects the resolved policy:

- shared authenticated mutating specs should prefer `runE2EUserStateReset()` in `beforeEach`
- `networkidle` is no longer described as a blanket best practice
- the E2E test inventory matches the current spec files

---

## Authoritative References

The original draft used real but weaker vendor/consultancy blog citations. This audited version prefers official or broadly authoritative sources:

1. [Playwright Docs: Retries](https://playwright.dev/docs/test-retries)
2. [Playwright Docs: Authentication](https://playwright.dev/docs/auth)
3. [Playwright Docs: Best Practices](https://playwright.dev/docs/best-practices)
4. [Martin Fowler: Eradicating Non-Determinism in Tests](https://martinfowler.com/articles/nonDeterminism.html)
5. [Google Testing Blog: Just Say No to More End-to-End Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html)

---

## Audit Trail

- Verified the exact Playwright execution order with `pnpm exec playwright test --list --project=chromium`.
- Read every `tests/e2e/*.spec.ts` file and all relevant helpers/components.
- Confirmed `global.setup.ts` performs a suite-level reset only once.
- Counted the deterministic reset-helper fixtures: exactly 2 required placeholder slugs.
- Counted the repository seed corpus used by CI on this snapshot: 970 published MDX question files, 10 published placeholder files.
- Traced every pre-target spec that mutates attempts, sessions, or bookmarks and corrected the original mutation table.
- Proved the deterministic placeholders are both `Incorrect` immediately before `session-review-navigation.spec.ts`; they are not the source of a 2-question shortage.
- Proved the overall CI `Unanswered` pool remains at least 963 questions before the target spec, so the placeholder-exhaustion narrative is false.
- Verified from Playwright docs that retries reset the worker/browser only; server-side state persists unless the suite resets it explicitly.
- Verified from code that `startSession()` only abandons incomplete sessions and does not clean up completed-session artifacts from a failed prior attempt.
- Verified from code that the review navigator count is driven by filtered review data, so line 93 is a data/contract failure mode, not a pure rendering-timing failure mode.
- Replaced weaker vendor/consultancy references with Playwright/Fowler/Google sources.
- Corrected the inaccurate statement about `docs/dev/testing-infrastructure.md`; the current doc already recommends structural fixes over band-aid waits.
- Added a repeated-reset unit test proving `runE2EUserStateReset()` re-clears and re-seeds the deterministic baseline on consecutive calls.
- Added `tests/e2e/helpers/session.test.ts` to cover the explicit smaller-session failure path.
- Wired per-test full reset into all mutating authenticated E2E specs and removed the old bookmark-only double-reset cases.
- Added `tests/e2e/helpers/question-progress.ts` plus unit coverage so the review navigator spec reads its expected count from the page contract.
- Updated `docs/dev/testing-infrastructure.md` to document the full reset policy and the current E2E file inventory.
