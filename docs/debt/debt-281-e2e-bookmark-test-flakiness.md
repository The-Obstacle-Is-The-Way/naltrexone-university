# DEBT-281: E2E Bookmark Test Flakiness

**Priority:** P2
**Created:** 2026-03-06
**Status:** Active, partially mitigated on the PR branch
**Discovered during:** [PR #175](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/175) investigation

---

## Current Status

As of **March 6, 2026**, PR #175 has shown **both passing and failing CI runs**. The latest failed run (`22782151850`) confirmed the issue was real, not speculative: the first mitigation pass still missed an error-state branch on the bookmarks page.

This document now reflects what was **verified from code and CI evidence**, not the earlier broader hypothesis list.

---

## Problem

Bookmark-dependent E2E flows were structurally brittle:

1. `tests/e2e/helpers/bookmark.ts` used a **1,000ms** probe to decide whether `/app/bookmarks` already contained at least one bookmark.
2. The same helper used **500ms** action-bar probes while trying to create a bookmark in Quick Practice.
3. `ensureBookmarkExistsOnBookmarksPage()` reused a locator across navigations and assumed the page should already be populated.
4. Unrelated specs were mutating bookmark state unnecessarily:
   - `tests/e2e/subscribe-and-practice.spec.ts` used `ensureBookmarkedQuestion()` even though the test only needed a Quick Practice question, not a bookmark.
   - `tests/e2e/core-app-pages.spec.ts` created a random bookmark up front instead of ensuring bookmark state only at the bookmarks step.

When the aggressive probes missed the real page state, later assertions would fail looking for a `Remove` button on `/app/bookmarks`.

---

## What Was Actually True

### V1: The helper timeouts were too aggressive

This part of the original analysis was correct.

Relevant code before mitigation:

- `tests/e2e/helpers/bookmark.ts` checked for existing bookmarks with a **1s** timeout.
- The same helper used **500ms** button-visibility checks for `Bookmark` / `Remove bookmark`.

That is a poor fit for CI, where the path includes:

1. Clerk-authenticated navigation
2. Server rendering
3. Database-backed bookmark lookup
4. Client hydration of the action bar

The immediate mitigation is larger, explicit wait budgets around the actual state transitions we care about.

### V2: The test needed state disambiguation, not a fake “data loaded” theory

The earlier writeup overstated this point.

`/app/bookmarks` is a Server Component page. `BookmarksPage` awaits `getBookmarks()` before rendering `BookmarksView`, so this is **not** a case where the heading shell renders and the bookmark list trickles in later. Once the page render lands, the state is already one of three stable outcomes:

1. **Populated**: at least one `Remove` button is present
2. **Empty**: `No bookmarks yet.` is present
3. **Error**: `Unable to load bookmarks.` is present

The real bug was that the helper/test path assumed only the populated or empty states mattered. The CI failure on run `22782151850` proved the missing third branch. The fix is to wait for any stable rendered state, then branch intentionally.

### V3: Shared mutable state is real

This part was also correct, with one nuance.

The Playwright suite uses:

- one shared Clerk test user
- `workers: 1`
- a **one-time** deterministic baseline reset in `global.setup.ts`

That reset seeds a deterministic bookmark for the E2E user at suite start (one bookmark on `placeholder-01`, plus one correct attempt on `placeholder-01` and one incorrect attempt on `placeholder-02`). But it does **not** reset state before each spec, so later tests can remove or alter bookmarks created by earlier ones. The baseline exists once per suite run, not once per test.

**Cross-spec mutation map (five specs touch bookmarks):**

| Spec | Helper used | Mutates bookmarks? | Net effect |
|------|-------------|--------------------|----|
| `subscribe-and-practice.spec.ts` | `openQuickPracticeQuestion()` | No | Safe |
| `core-app-pages.spec.ts` | `ensureBookmarkExistsOnBookmarksPage()` | Creates if missing | +1 if empty |
| `bookmarks.spec.ts` | `ensureBookmarkExistsOnBookmarksPage()` | Creates if missing, **then removes one** | Can leave empty |
| `cross-page-navigation.spec.ts` | `ensureBookmarkExistsOnBookmarksPage()` | Creates if missing | +1 if empty |
| `review-mode-audit.spec.ts` | None (navigates directly) | No | Handles both empty and populated |

The key interaction: if `bookmarks.spec.ts` runs before `cross-page-navigation.spec.ts` and removes the only bookmark, the latter must recreate one via Quick Practice. This adds 30–60 seconds of latency and exercises the full bookmark creation path under CI conditions.

### V4: Locator reuse and unnecessary bookmark mutation were real code smells

Reusing a locator across navigations was not the likeliest root cause by itself, but it was still the wrong pattern and made the helper harder to reason about.

More importantly, two specs were mutating bookmark state when they did not need to:

- `subscribe-and-practice.spec.ts` only needed a visible Quick Practice question.
- `core-app-pages.spec.ts` only needed bookmark state when it reached `/app/bookmarks`.

Those unnecessary mutations increased state drift across the shared-user suite.

### V5: The Quick Practice bookmark helper had an exhausted-state bug

This CodeRabbit finding was valid.

If Quick Practice had already reached `No more questions found.`, the helper could still attempt one more `Next` click on the following loop iteration. That turns the failure into a locator problem instead of the intended terminal helper error.

The fix is to model `exhausted` as an explicit question state and stop before the next click.

---

## What Was Not Verified

### NV1: Missing `waitUntil` on `page.goto('/app/bookmarks')` was not the root cause

The earlier draft treated this like a primary failure driver. That was too loose.

Playwright defaults `page.goto()` to `waitUntil: 'load'`, which is not “too early” relative to `domcontentloaded`; if anything, it is stricter. Adding `waitUntil: 'domcontentloaded'` can still be a valid consistency choice once explicit state waits exist, but **`waitUntil` alone does not solve the bookmark failure mode**.

### NV2: The `core-app-pages` monolith is a risk, but not the direct explanation for zero `Remove` buttons

`tests/e2e/core-app-pages.spec.ts` is still broader than ideal. A future split could improve diagnosis and isolation. But the observed failure signature was “no `Remove` button exists in the DOM,” which points more directly to bookmark-state setup than to overall test timeout budget.

That remains a secondary hardening opportunity, not the primary fix.

---

## Investigated and Ruled Out (2026-03-06 Audit)

A full four-axis investigation (global setup, spec consumption, server-side data flow, CI environment) confirmed the verified root causes above and ruled out several potential deeper issues:

### RO1: Optimistic UI race between bookmark creation and bookmarks page verification

**Ruled out.** `toggleBookmarkForQuestion()` in `practice-page-logic.ts` awaits the server response (`res = await toggleBookmarkFn(...)`) before calling `setBookmarkedQuestionIds()`. The “Remove bookmark” button text at `practice-view.tsx:331` is derived from `isBookmarked`, which only flips after the DB INSERT commits and the server action responds. When the E2E helper sees “Remove bookmark” and navigates to `/app/bookmarks`, the write is already durable.

This also means the retry logic in `openBookmarksPageStateWithRetry()` does not need to retry on `empty` state after creation — an `empty` result after a confirmed toggle would require a database anomaly, not a timing race.

### RO2: Next.js caching causing stale bookmarks page

**Ruled out.** The bookmarks page is an async Server Component that awaits `getBookmarks()` before rendering. Each `page.goto()` triggers a full server render. The Drizzle repository has no application-level cache — every `listByUserId()` call is a fresh DB query. `revalidatePath()` is only relevant for client-side navigations (used in `removeBookmarkAction`), not for full `page.goto()` navigations.

### RO3: Neon cold start latency in CI

**Not applicable.** CI uses a local PostgreSQL 16 service container (configured in `.github/workflows/ci.yml`), not Neon. Neon cold start latency (400–750ms) only affects deployed Vercel previews, not CI test runs.

### RO4: 2-second question state timeout too short for client hydration

**Low risk.** The “Bookmark” and “Next” buttons are rendered in the same React component (`practice-view.tsx`). Once `openQuickPracticeQuestion()` confirms the Next button is visible (up to 15s budget), both buttons share the same hydration boundary. The 2-second `QUESTION_BUTTON_VISIBILITY_TIMEOUT_MS` is a safety margin after hydration, not the primary wait.

### RO5: Rate limiting on bookmark mutations

**Not a factor at E2E scale.** The bookmark mutation rate limit is 60 toggles per 60 seconds per user. E2E specs perform at most 1–2 toggles per test. The rate limiter would only trigger if a spec loops or the suite runs dozens of bookmark-mutating tests in rapid succession.

---

## CI Retry Masking

Playwright is configured with `retries: 2` in CI and `retries: 0` locally. A test that fails on the first attempt but passes on retry counts as “passing” in CI. This means:

- The true flake rate may be higher than CI green/red status suggests.
- Transient failures (slow DB response, resource contention on GitHub Actions VM) are silently retried.
- Traces are only captured on the first retry (`trace: 'on-first-retry'`), so the initial failure is observable, but the overall CI run still goes green.

This is not a bug — retries are a reasonable CI strategy. But when investigating flakes, check the Playwright report artifact for retry counts, not just the final CI status.

---

## Mitigations Implemented On This Branch

### 1. Added explicit bookmarks-page state detection

`tests/e2e/helpers/bookmark.ts` now exposes `waitForBookmarksPageState()` and treats `/app/bookmarks` as a three-state page:

- `populated`
- `empty`
- `error`

`ensureBookmarkExistsOnBookmarksPage()` now:

1. opens the bookmarks page
2. waits for one of those stable states
3. returns immediately if already populated
4. retries when the page renders its error state, with a short backoff between attempts
5. only falls back to bookmark creation if the page is actually empty

### 2. Increased helper wait budgets where the old values were indefensible

- Quick Practice button probes: **500ms → 2,000ms**
- Bookmarks page state resolution: **1,000ms → 10,000ms**
- When Quick Practice never reaches a stable `bookmark` / `remove` / `exhausted` state within those budgets, the helper now fails explicitly instead of blindly clicking `Next`

### 3. Removed locator reuse across navigations

The helper now resolves fresh locators after the second navigation back to `/app/bookmarks`.

### 4. Separated “open a Quick Practice question” from “create a bookmark”

`tests/e2e/helpers/bookmark.ts` now has `openQuickPracticeQuestion()`.

That let us stop using bookmark creation as a side effect just to land on a question screen.

### 5. Reduced unnecessary bookmark mutation in unrelated specs

- `tests/e2e/subscribe-and-practice.spec.ts` now uses `openQuickPracticeQuestion()` instead of `ensureBookmarkedQuestion()`
- `tests/e2e/core-app-pages.spec.ts` now ensures bookmark existence only at the bookmarks step, via `ensureBookmarkExistsOnBookmarksPage()`

### 6. Added regression coverage for the helper itself

`tests/e2e/helpers/bookmark.test.ts` now covers:

- populated state detection
- empty state detection
- error state detection
- bookmark state detection
- already-bookmarked state detection
- exhausted Quick Practice detection
- null / timeout question-state detection
- Quick Practice fallback from unanswered → incorrect
- bookmarks-page retry behavior
- descriptive failure when no stable bookmarks-page state appears

---

## Remaining Debt

The branch mitigates the most plausible failure mechanics, but two structural issues remain:

1. **Per-test state isolation is still absent.**
   The suite still shares one mutable authenticated user, with reset only in `global.setup.ts`. The baseline seeds exactly: 1 practice session, 2 attempts (1 correct on `placeholder-01`, 1 incorrect on `placeholder-02`), and 1 bookmark on `placeholder-01`. All with deterministic UUIDs and timestamps. See `tests/e2e/helpers/reset-e2e-user-state.ts` for the full seed.
2. **Bookmark-dependent flows still rely on UI fallback creation when the suite baseline has been mutated.**
   Specifically, `bookmarks.spec.ts` can remove the baseline bookmark, forcing `cross-page-navigation.spec.ts` and `core-app-pages.spec.ts` to recreate one via Quick Practice if they run later. This adds 30–60 seconds of latency per affected spec and exercises the full creation path under CI conditions.
3. **CI retries mask transient flakes.**
   With `retries: 2` in CI, a test that fails once but passes on retry appears green. The true flake rate may be higher than CI status suggests. Check the Playwright report artifact for retry counts when investigating failures.

If bookmark flakes recur after these mitigations, the escalation path is:

1. Add a scoped per-test bookmark reset helper (direct DB call via the same Postgres connection used in `global.setup.ts`, not UI-based).
2. Use that helper in `beforeEach` for `bookmarks.spec.ts`, `cross-page-navigation.spec.ts`, and `core-app-pages.spec.ts`.
3. Then reassess whether `core-app-pages.spec.ts` should be split — its broad scope makes it harder to diagnose which step caused a failure, but it is not the direct cause of bookmark flakes.

---

## Files Changed In This Mitigation

| File | Change |
|------|--------|
| `tests/e2e/helpers/bookmark.ts` | Added page/question state resolvers, raised helper timeouts, retried bookmarks error state, removed locator reuse, added `openQuickPracticeQuestion()` |
| `tests/e2e/helpers/bookmark.test.ts` | Added regression coverage for bookmarks page state detection |
| `tests/e2e/core-app-pages.spec.ts` | Removed early random bookmark creation; ensure bookmark state only at the bookmarks step |
| `tests/e2e/subscribe-and-practice.spec.ts` | Stopped mutating bookmark state just to open a question |
| `components/question/choice-button.tsx` | Removed the neutral selected-state conflict with the rest-state dark border token |
| `components/question/choice-button.test.tsx` | Added regression assertion for the selected-state dark border contract |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-06 | Created DEBT-281 | Bookmark-related E2E failure mode needed a concrete writeup instead of hand-waving |
| 2026-03-06 | Corrected root-cause analysis | The first draft mixed valid causes with weaker hypotheses |
| 2026-03-06 | Confirmed live flake on CI run `22782151850` | The helper still missed the bookmarks error state after the first mitigation pass |
| 2026-03-06 | Implemented branch-level mitigations | Harden helper behavior before escalating to heavier per-test reset work |
| 2026-03-06 | Full four-axis audit (setup, specs, server-side, CI) | Confirmed all 5 verified causes hold up; ruled out optimistic-UI race, Next.js caching, Neon cold start, hydration timeout, and rate limiting; added cross-spec mutation map and CI retry masking context |
