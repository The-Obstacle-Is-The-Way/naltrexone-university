# DEBT-208: Missing E2E Tests for Cross-Page Navigation Flows

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-11
**Resolved:** 2026-02-14
**GitHub Issue:** #81

---

## Description

SPEC-019 Phase 3 added cross-page navigation: clickable dashboard activity items, origin-aware question detail "Back to..." links, and review/bookmarks stem links. While comprehensive unit tests exist via `renderToStaticMarkup` (verifying `href` attributes and link text), Playwright E2E coverage still does not exercise the full click-through flows where the user clicks the origin-aware "Back to..." link and returns to the source page (Dashboard / History / Bookmarks).

### What Exists (Partial Coverage)

- `tests/e2e/core-app-pages.spec.ts:33-47` — Tests History → Question forward navigation (click link, verify URL) but does NOT test the "Back to History" click
- `tests/e2e/history.spec.ts:28-42` — Tests History Questions tab with `result=incorrect` → question navigation, but no back-link verification
- `tests/e2e/review-mode-audit.spec.ts` — Verifies multiple entry points reach the question page in review mode (Dashboard, History, session breakdown) and asserts URL params; bookmarks coverage only inspects link `href`s. It never clicks the origin-aware "Back to..." link.
- `tests/e2e/session-review-navigation.spec.ts` — Verifies session-scoped review navigation and asserts session/history back links exist, but does not click them and does not cover Dashboard/Bookmarks return clicks
- Unit tests in `app/(app)/app/questions/[slug]/question-page-client.test.tsx` verify correct `href` attributes and label text for all origins

### What's Missing

The specific gap is **clicking the "Back to..." link and verifying return navigation** in a real browser:

1. **Dashboard → Question detail → Back to Dashboard**: Click an activity item on the dashboard, verify the question detail page loads, click "Back to Dashboard" link, verify return
2. **History → Question detail → Back to History**: Click a question stem in the Questions tab, verify navigation, click back link
3. **Bookmarks → Question detail → Back to Bookmarks**: Click a bookmarked question, verify navigation flow

### Clean Architecture Analysis

Uncle Bob emphasizes that **boundaries should be tested at the boundary**. Unit tests verify that components render correct `href` attributes (output boundary), but they don't test that the browser actually navigates correctly when those links are clicked (integration at the framework boundary). E2E tests close this gap.

## Impact

- **Low regression risk**: Navigation is simple `<Link>` components with static `href` values — unlikely to break silently
- **Confidence gap**: No automated proof that click-through flows work end-to-end in a real browser
- **Requires credentials**: Authenticated E2E tests are skipped when `E2E_CLERK_USER_USERNAME` / `E2E_CLERK_USER_PASSWORD` are missing (see DEBT-104). CI must set these secrets to run the full suite.

## Resolution

### Prerequisite

Ensure authenticated E2E credentials are available:
1. Provide `E2E_CLERK_USER_USERNAME` and `E2E_CLERK_USER_PASSWORD` (locally and in CI)
2. Verify Clerk test mode configuration (DEBT-104)

### Step 1: Add Cross-Page Navigation E2E Tests

Create `tests/e2e/cross-page-navigation.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';
import { ensureBookmarkExistsOnBookmarksPage } from './helpers/bookmark';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import {
  assertQuestionSlugExists,
  submitQuestionForOutcome,
} from './helpers/question';
import { ensureSubscribed } from './helpers/subscription';

// Seeded by content/questions/placeholder/placeholder-01-naltrexone-mechanism.mdx
const QUESTION_SLUG = 'placeholder-01-naltrexone-mechanism';

test.describe('cross-page navigation', () => {
  test.setTimeout(180_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('dashboard activity → question detail → back to dashboard', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, QUESTION_SLUG);
    await submitQuestionForOutcome(page, QUESTION_SLUG, 'Correct');

    await page.goto('/app/dashboard', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    const activityItem = page
      .locator(`a[href*="${QUESTION_SLUG}"][href*="from=dashboard"]`)
      .first();
    await expect(activityItem).toBeVisible({ timeout: 15_000 });
    await activityItem.click();

    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });
    await expect(page).toHaveURL(/from=dashboard/);
    await expect(page.getByRole('heading', { name: 'Question' })).toBeVisible();
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    await page.getByRole('link', { name: 'Back to Dashboard' }).click();
    await expect(page).toHaveURL('/app/dashboard');
  });

  test('history questions → question detail → back to history', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, QUESTION_SLUG);
    await submitQuestionForOutcome(page, QUESTION_SLUG, 'Incorrect');

    await page.goto('/app/history?tab=questions&result=incorrect', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    const historyLink = page
      .locator(
        `a[href^="/app/questions/${QUESTION_SLUG}"][href*="from=history"]`,
      )
      .first();
    await expect(historyLink).toBeVisible({ timeout: 15_000 });
    await historyLink.click();

    await expect(page).toHaveURL(new RegExp(`/app/questions/${QUESTION_SLUG}`));
    await expect(page).toHaveURL(/from=history/);
    await expect(page.getByRole('heading', { name: 'Question' })).toBeVisible();
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    await page.getByRole('link', { name: 'Back to History' }).click();
    await expect(page).toHaveURL('/app/history');
  });

  test('bookmarks navigates to question detail and back', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await ensureBookmarkExistsOnBookmarksPage(page);

    const bookmarksLink = page
      .locator('a[href^="/app/questions/"][href*="from=bookmarks"]')
      .first();
    await expect(bookmarksLink).toBeVisible({ timeout: 15_000 });
    await bookmarksLink.click();

    await expect(page).toHaveURL(/\/app\/questions\//, { timeout: 15_000 });
    await expect(page).toHaveURL(/from=bookmarks/);
    await expect(page.getByRole('heading', { name: 'Question' })).toBeVisible();
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    await page.getByRole('link', { name: 'Back to Bookmarks' }).click();
    await expect(page).toHaveURL('/app/bookmarks');
  });
});
```

### Step 2: Test Origin-Aware Back Links

Verify that the `from` query parameter controls the back link destination:
- `?from=dashboard` → "Back to Dashboard"
- `?from=history` → "Back to History"
- `?from=bookmarks` → "Back to Bookmarks"

## Verification

1. `pnpm test:e2e` passes with new navigation tests
2. Each flow exercises: page load → link click → destination verification → back link → return verification

## Related

- SPEC-019 Phase 3 (PR #79)
- DEBT-104 (Missing E2E Test Credentials — Accepted)
- `tests/e2e/core-app-pages.spec.ts` (existing E2E coverage)
- `app/(app)/app/questions/[slug]/` (question detail page with origin-aware back links)

## Resolution Notes (2026-02-14)

- Added `tests/e2e/cross-page-navigation.spec.ts` covering Dashboard/History/Bookmarks click-through and origin-aware "Back to…" return navigation.
