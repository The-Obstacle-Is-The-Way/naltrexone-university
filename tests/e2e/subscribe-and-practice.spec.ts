import { expect, test } from '@playwright/test';
import { ensureBookmarkedQuestion } from './helpers/bookmark';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { selectChoiceByLabel } from './helpers/question';
import { ensureSubscribed } from './helpers/subscription';

test.describe('subscribe and practice', () => {
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('user can subscribe and answer a question', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await ensureBookmarkedQuestion(page);

    // Select first choice and submit
    await selectChoiceByLabel(page, 'A');

    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText(/Correct|Incorrect/)).toBeVisible();
    await expect(page.getByText('Explanation', { exact: true })).toBeVisible();
  });
});
