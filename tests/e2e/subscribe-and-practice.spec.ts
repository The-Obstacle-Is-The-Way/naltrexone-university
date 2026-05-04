import { expect, test } from '@playwright/test';
import { openQuickPracticeQuestion } from './helpers/bookmark';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { selectChoiceByLabel } from './helpers/question';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { ensureSubscribed } from './helpers/subscription';

test.describe('subscribe and practice', () => {
  // Authenticated E2E flows include Clerk sign-in and seeded subscription setup; allow CI headroom.
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');
  test.beforeEach(async () => {
    await runE2EUserStateReset();
  });

  test('user can subscribe and answer a question', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await openQuickPracticeQuestion(page);

    // Select first choice; tutor/quick practice commits on click.
    await selectChoiceByLabel(page, 'A');

    const verdictPill = page.getByText(/^(Correct|Incorrect)$/).first();
    await expect(verdictPill).toBeVisible();
    if ((await verdictPill.textContent())?.trim() === 'Incorrect') {
      await expect(
        page.getByText('Correct Answer', { exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText('Correct Answer', { exact: true }),
      ).toHaveCount(0);
    }
  });
});
