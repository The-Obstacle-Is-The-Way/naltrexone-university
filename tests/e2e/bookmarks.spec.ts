import { expect, test } from '@playwright/test';
import { ensureBookmarkExistsOnBookmarksPage } from './helpers/bookmark';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { ensureSubscribed } from './helpers/subscription';

test.describe('bookmarks', () => {
  // Authenticated E2E flows include Clerk sign-in and seeded subscription setup; allow CI headroom.
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');
  test.beforeEach(async () => {
    await runE2EUserStateReset();
  });

  test('persists bookmark state and allows removing from bookmarks page', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await ensureBookmarkExistsOnBookmarksPage(page);

    const removeButtons = page.getByRole('button', { name: 'Remove' });
    const countBefore = await removeButtons.count();
    expect(countBefore).toBeGreaterThan(0);

    // Click "Remove" to open the confirmation dialog
    await removeButtons.first().click();

    // Confirm removal in the AlertDialog
    await page.getByRole('button', { name: 'Remove bookmark' }).click();

    // After confirmation, the server action runs and redirects back to /app/bookmarks.
    // Wait for the page to settle after the redirect.
    await page.waitForURL(/\/app\/bookmarks/);

    if (countBefore > 1) {
      await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(
        countBefore - 1,
        { timeout: 15_000 },
      );
      return;
    }

    await expect(
      page.getByText('No bookmarks yet.', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
