import { expect, test } from '@playwright/test';
import { ensureBookmarkExistsOnBookmarksPage } from './helpers/bookmark';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { ensureSubscribed } from './helpers/subscription';

test.describe('bookmarks', () => {
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('persists bookmark state and allows removing from bookmarks page', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await ensureBookmarkExistsOnBookmarksPage(page);

    const removeButtons = page.getByRole('button', { name: 'Remove' });
    const countBefore = await removeButtons.count();
    expect(countBefore).toBeGreaterThan(0);

    await removeButtons.first().click();

    if (countBefore > 1) {
      await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(
        countBefore - 1,
      );
      return;
    }

    await expect(
      page.getByText('No bookmarks yet.', { exact: true }),
    ).toBeVisible();
  });
});
