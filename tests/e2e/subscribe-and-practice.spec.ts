import { expect, test } from '@playwright/test';
import { openQuickPracticeQuestion } from './helpers/bookmark';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { selectChoiceByLabel } from './helpers/question';
import { ensureSubscribed } from './helpers/subscription';

test.describe('subscribe and practice', () => {
  // Authenticated E2E flows include Clerk sign-in and seeded subscription setup; allow CI headroom.
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('user can subscribe and answer a question', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await openQuickPracticeQuestion(page);

    // Select first choice and submit
    await selectChoiceByLabel(page, 'A');

    await page.getByRole('button', { name: 'Submit' }).click();

    const verdictPill = page.getByText(/^(Correct|Incorrect)$/).first();
    await expect(verdictPill).toBeVisible();
    if ((await verdictPill.textContent())?.trim() === 'Incorrect') {
      await expect(
        page.getByText('Correct answer', { exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText('Correct answer', { exact: true }),
      ).toHaveCount(0);
    }
  });
});
