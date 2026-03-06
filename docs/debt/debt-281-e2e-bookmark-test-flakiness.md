# DEBT-281: E2E Bookmark Test Flakiness

**Priority:** P2
**Created:** 2026-03-06
**Discovered in:** [PR #175](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/175) (DEBT-280) — CI failed on unrelated E2E bookmark tests while main branch passes consistently.

---

## Problem

Two E2E tests intermittently fail in CI looking for a "Remove" button on the bookmarks page:

1. `tests/e2e/core-app-pages.spec.ts:73` — `getByRole('button', { name: 'Remove' }).first()`
2. `tests/e2e/cross-page-navigation.spec.ts:94` via `helpers/bookmark.ts:124` — same locator

The error is `element(s) not found` (not timeout, not hidden — the DOM literally contains zero "Remove" buttons). This means the bookmarks page rendered with an **empty bookmark list** despite the global setup seeding a bookmark and `ensureBookmarkedQuestion` creating one via the UI.

Main branch passes (3/3 recent runs). The failure is non-deterministic and unrelated to the PR's CSS changes.

---

## Root Cause Analysis

After deep investigation of the full E2E infrastructure (`global.setup.ts`, `helpers/bookmark.ts`, `helpers/reset-e2e-user-state.ts`, `helpers/seed-test-user.ts`, `helpers/question.ts`, `playwright.config.ts`, `ci.yml`, and the bookmarks page Server Component), **six structural weaknesses** contribute to flakiness:

### F1: Dangerously tight timeouts throughout the bookmark helper

| Location | Timeout | What it's waiting for |
|----------|---------|-----------------------|
| `bookmark.ts:115` — initial bookmark existence check | **1,000ms** | Full SSR page render + DB query + Clerk auth |
| `bookmark.ts:73,77` — `isButtonVisible` per-question check | **500ms** | Action bar button hydration |
| `bookmark.ts:89-101` — `Promise.race` after clicking Next | 10,000ms | Next question load |
| `core-app-pages.spec.ts:72` — final "Remove" assertion | **5,000ms** (default) | Full SSR page render |

The 1s initial check at `bookmark.ts:115` is the most dangerous. The bookmarks page is a Server Component that must:
1. Authenticate via Clerk (`currentUser()` — network call to Clerk API)
2. Resolve entitlement (DB query)
3. Query bookmarks (DB query with join)
4. SSR the full page

In CI (shared GitHub Actions runner, cold Node.js process, remote Neon DB, Clerk API latency), this routinely takes 2-4 seconds. If it takes >1s, the helper falls through to the "create bookmark" path unnecessarily, wasting ~30s of test time and adding fragility.

The 500ms `isButtonVisible` checks compound the problem — in CI, client-side hydration of the action bar buttons (Bookmark/Remove bookmark) can take >500ms, causing the helper to skip bookmarkable questions and burn through its 8-attempt budget.

### F2: No `waitUntil` on critical navigations

```typescript
// bookmark.ts:110 — NO waitUntil
await page.goto('/app/bookmarks');

// vs. other navigations in the same test suite that DO use it:
await page.goto('/app/history?tab=questions&result=incorrect', {
  timeout: 60_000,
  waitUntil: 'domcontentloaded',
});
```

`page.goto()` without `waitUntil` defaults to `'load'`, which waits for the `load` event. But Server Components stream HTML progressively — the heading might arrive before the bookmark list. Without `waitUntil: 'networkidle'` or an explicit data-load assertion, the test can start asserting before the page has finished rendering.

### F3: No data-load guard — heading visible != data loaded

Both failing tests follow this pattern:

```typescript
await page.goto('/app/bookmarks');
await expect(page.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();
// Immediately assert data-dependent element:
await expect(page.getByRole('button', { name: 'Remove' }).first()).toBeVisible();
```

The heading `<h1>Bookmarks</h1>` renders in the page shell before the bookmark list (which requires a DB query). In streaming SSR, the heading can be visible while the bookmark data is still loading. The test should wait for a data-dependent signal (e.g., the bookmark list `<ul>` or the empty-state card) before asserting specific list content.

### F4: `ensureBookmarkExistsOnBookmarksPage` reuses a locator across navigations

```typescript
// bookmark.ts:113 — locator created on first page load
const removeButton = page.getByRole('button', { name: 'Remove' }).first();

// ... navigates away to Quick Practice, creates bookmark ...

// bookmark.ts:122-124 — navigates BACK to bookmarks
await page.goto('/app/bookmarks');
await expect(page.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();
await expect(removeButton).toBeVisible(); // ← reused locator
```

While Playwright locators are lazy (they re-query on each use), this pattern is fragile and confusing. If the page structure changes between navigations or the `first()` semantics differ, the locator could match a different element or none at all.

### F5: `core-app-pages` is a monolith test with cascading failure risk

`core-app-pages.spec.ts` crams **8+ assertions across 5 different pages** into a single `test()` block:

1. `ensureBookmarkedQuestion` → Quick Practice (creates bookmark)
2. `submitQuestionForOutcome` → Question page x4 (creates attempts)
3. History page assertions
4. Dashboard assertions
5. Bookmarks page assertions ← **fails here**
6. Billing page assertions

Any slowness or failure in steps 1-4 consumes time from the 120s test timeout, leaving less headroom for step 5. The bookmark assertion at step 5 inherits all accumulated CI latency from the previous navigations. If Clerk auth was slow at sign-in, if `submitQuestionForOutcome` needed 3 retries (3 page navigations), the remaining timeout budget for the bookmarks page could be tight.

A single monolith test also means a bookmark failure masks whether dashboard/billing/history would have passed independently.

### F6: Shared mutable state with non-deterministic bookmark creation

All E2E tests share a single test user (`E2E_CLERK_USER_USERNAME`). The global setup seeds a deterministic bookmark for `placeholder-01`, but `ensureBookmarkedQuestion` bookmarks whatever random question appears first in Quick Practice. This creates:

1. **Non-deterministic state**: Different CI runs bookmark different questions depending on DB ordering
2. **Cross-test pollution**: `core-app-pages` creates bookmarks and attempts that affect `cross-page-navigation`'s starting state
3. **No cleanup**: Bookmarks created during tests persist for subsequent tests (the global setup only runs once, before all tests)

The `workers: 1` config prevents parallel execution but doesn't prevent sequential state accumulation.

---

## Severity Assessment

**Severity:** P2 — Flaky CI tests erode trust in the test suite and waste developer time investigating false failures.

- **Frequency:** Intermittent. Main branch passes consistently; failure observed on PR branches (likely due to longer CI queue times / colder runners).
- **Impact:** Blocks PR merges until re-run. Wastes 6-7 minutes per failed CI run (full `test` job).
- **Risk of masking real failures:** A genuine bookmark regression could be dismissed as "just the flaky test."

---

## Proposed Fix

### Phase 1: Timeout and navigation hardening (quick wins)

1. **Increase `ensureBookmarkExistsOnBookmarksPage` initial check timeout** from 1s → 10s
2. **Add explicit `waitUntil: 'domcontentloaded'`** to all `page.goto('/app/bookmarks')` calls
3. **Add data-load guard**: After heading is visible, wait for either the bookmark list (`ul`) or the empty-state card before asserting specific content
4. **Increase `isButtonVisible` timeout** in the bookmark loop from 500ms → 2,000ms
5. **Add explicit timeout** to the final "Remove" button assertion in `core-app-pages.spec.ts:72`: `{ timeout: 15_000 }`

### Phase 2: Test isolation improvements

6. **Split `core-app-pages` monolith** into independent tests per page (dashboard, bookmarks, billing, history). Each test signs in and sets up its own preconditions. Trade execution time for isolation.
7. **Use deterministic bookmarks**: Instead of `ensureBookmarkedQuestion` (which bookmarks random questions), use the seeded `placeholder-01` bookmark directly. The global setup already seeds it — just navigate to bookmarks and verify.
8. **Fresh locator after navigation**: In `ensureBookmarkExistsOnBookmarksPage`, create the locator after the second `page.goto`, not before.

### Phase 3: Structural improvements (if flakiness persists)

9. **Add per-test state reset**: Before each test that depends on bookmark state, reset bookmarks to the deterministic baseline via a direct DB call (similar to `clearUserState` but scoped to bookmarks only).
10. **Add CI retry budget monitoring**: Track how often E2E tests need retries. If retry rate exceeds 10%, escalate.

---

## Files to Change

| File | Change |
|------|--------|
| `tests/e2e/helpers/bookmark.ts` | Increase timeouts (F1), add `waitUntil` (F2), add data-load guard (F3), fresh locator (F4) |
| `tests/e2e/core-app-pages.spec.ts` | Add explicit timeout to bookmarks assertion, consider splitting monolith (F5) |
| `tests/e2e/cross-page-navigation.spec.ts` | Inherits fixes from bookmark helper |

---

## What This Does NOT Change

- E2E test logic or assertions (the tests are correct, just fragile)
- Global setup / seed infrastructure (already well-built)
- Playwright config (1 worker, 2 retries in CI — correct)
- The bookmarks page Server Component (no caching or rendering bug)

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-06 | Created DEBT-281 | CI E2E failure on PR #175 — unrelated to PR changes, flaky bookmark test |
| 2026-03-06 | Classified as P2 | Intermittent but blocks PRs; erodes CI trust |
| 2026-03-06 | Identified 6 root causes (F1-F6) | Deep investigation of full E2E infrastructure |
