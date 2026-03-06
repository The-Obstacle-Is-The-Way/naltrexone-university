# DEBT-281: E2E Bookmark Test Flakiness

**Priority:** P2
**Created:** 2026-03-06
**Status:** Active, partially mitigated on the PR branch
**Discovered during:** [PR #175](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/175) investigation

---

## Current Status

As of **March 6, 2026**, the latest head of PR #175 is **green** in GitHub Actions. This debt item remains active because the bookmark-related E2E path had a credible intermittent failure mode, and the suite still shares one mutable authenticated user across specs.

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

`/app/bookmarks` is a Server Component page. `BookmarksPage` awaits `getBookmarks()` before rendering `BookmarksView`, so this is **not** a case where the heading shell renders and the bookmark list trickles in later. Once the page render lands, the state is already one of two valid outcomes:

1. **Populated**: at least one `Remove` button is present
2. **Empty**: `No bookmarks yet.` is present

The real bug was that the helper/test path assumed only the populated state mattered. The fix is to wait for either valid rendered state, then branch intentionally.

### V3: Shared mutable state is real

This part was also correct, with one nuance.

The Playwright suite uses:

- one shared Clerk test user
- `workers: 1`
- a **one-time** deterministic baseline reset in `global.setup.ts`

That reset seeds a deterministic bookmark for the E2E user at suite start. But it does **not** reset state before each spec, so later tests can remove or alter bookmarks created by earlier ones. The baseline exists once per suite run, not once per test.

### V4: Locator reuse and unnecessary bookmark mutation were real code smells

Reusing a locator across navigations was not the likeliest root cause by itself, but it was still the wrong pattern and made the helper harder to reason about.

More importantly, two specs were mutating bookmark state when they did not need to:

- `subscribe-and-practice.spec.ts` only needed a visible Quick Practice question.
- `core-app-pages.spec.ts` only needed bookmark state when it reached `/app/bookmarks`.

Those unnecessary mutations increased state drift across the shared-user suite.

---

## What Was Not Verified

### NV1: Missing `waitUntil` on `page.goto('/app/bookmarks')` was not the root cause

The earlier draft treated this like a primary failure driver. That was too loose.

Playwright defaults `page.goto()` to `waitUntil: 'load'`, which is not “too early” relative to `domcontentloaded`; if anything, it is stricter. Adding `waitUntil: 'domcontentloaded'` can still be a valid consistency choice once explicit state waits exist, but **`waitUntil` alone does not solve the bookmark failure mode**.

### NV2: The `core-app-pages` monolith is a risk, but not the direct explanation for zero `Remove` buttons

`tests/e2e/core-app-pages.spec.ts` is still broader than ideal. A future split could improve diagnosis and isolation. But the observed failure signature was “no `Remove` button exists in the DOM,” which points more directly to bookmark-state setup than to overall test timeout budget.

That remains a secondary hardening opportunity, not the primary fix.

---

## Mitigations Implemented On This Branch

### 1. Added explicit bookmarks-page state detection

`tests/e2e/helpers/bookmark.ts` now exposes `waitForBookmarksPageState()` and treats `/app/bookmarks` as a two-state page:

- `populated`
- `empty`

`ensureBookmarkExistsOnBookmarksPage()` now:

1. opens the bookmarks page
2. waits for one of those two valid states
3. returns immediately if already populated
4. only falls back to bookmark creation if the page is actually empty

### 2. Increased helper wait budgets where the old values were indefensible

- Quick Practice button probes: **500ms → 2,000ms**
- Bookmarks page state resolution: **1,000ms → 10,000ms**

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
- descriptive failure when neither valid state appears

---

## Remaining Debt

The branch mitigates the most plausible failure mechanics, but two structural issues remain:

1. **Per-test state isolation is still absent.**
   The suite still shares one mutable authenticated user, with reset only in global setup.
2. **Bookmark-dependent flows still rely on UI fallback creation when the suite baseline has been mutated.**
   That is acceptable for now, but a future direct reset or deterministic re-seed before bookmark-critical specs would be cleaner.

If bookmark flakes recur after these mitigations, the next step should be:

1. add a scoped per-test bookmark reset helper
2. use that helper in bookmark-dependent specs
3. then reassess whether `core-app-pages.spec.ts` should be split

---

## Files Changed In This Mitigation

| File | Change |
|------|--------|
| `tests/e2e/helpers/bookmark.ts` | Added state resolver, raised helper timeouts, removed locator reuse, added `openQuickPracticeQuestion()` |
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
| 2026-03-06 | Implemented branch-level mitigations | Harden helper behavior before escalating to heavier per-test reset work |
