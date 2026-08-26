import { expect, test } from '@playwright/test';
import { ensureBookmarkExistsOnBookmarksPage } from './helpers/bookmark';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import {
  assertQuestionSlugExists,
  submitQuestionForOutcome,
} from './helpers/question';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { ensureSubscribed } from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

// Seeded by content/questions/placeholder/placeholder-01-naltrexone-mechanism.mdx
const QUESTION_SLUG = 'placeholder-01-naltrexone-mechanism';

test.describe('cross-page navigation', () => {
  // Multi-page audit flows can exceed the default timeout due to sequential navigation and assertions in CI.
  test.setTimeout(180_000);
  test.beforeEach(async () => {
    await runE2EUserStateReset();
  });

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
    await expect(
      page.getByRole('heading', { name: 'Question', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    await page.getByRole('link', { name: 'Back to Dashboard' }).first().click();
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
    await expect(
      page.getByRole('heading', { name: 'Question', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    await page.getByRole('link', { name: 'Back to History' }).click();
    await expect(page).toHaveURL(/\/app\/history\?tab=questions/);
    await expect(page).toHaveURL(/result=incorrect/);
    await expect(page).toHaveURL(/offset=0/);
    await expect(page).toHaveURL(/limit=20/);
  });

  test.describe('bookmark navigation', () => {
    test('bookmarks → question detail → back to bookmarks', async ({
      page,
    }) => {
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
      await expect(
        page.getByRole('heading', { name: 'Question', exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/Loading question/i)).toBeHidden({
        timeout: 15_000,
      });

      await page
        .getByTestId('bottom-action-bar')
        .getByRole('link', { name: 'Back to Bookmarks' })
        .click();
      await expect(page).toHaveURL('/app/bookmarks');
    });
  });
});
