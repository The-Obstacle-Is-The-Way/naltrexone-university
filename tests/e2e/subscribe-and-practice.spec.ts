import { expect, test } from '@playwright/test';
import { openQuickPracticeQuestion } from './helpers/bookmark';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import {
  expectVerdictPillVisible,
  selectChoiceByLabel,
} from './helpers/question';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { ensureSubscribed } from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

test.describe('subscribe and practice', () => {
  // Authenticated E2E flows include Clerk sign-in and seeded subscription setup; allow CI headroom.
  test.setTimeout(120_000);
  test.beforeEach(async () => {
    await runE2EUserStateReset();
  });

  test('user can subscribe and answer a question', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await openQuickPracticeQuestion(page);

    // Select first choice; tutor/quick practice commits on click.
    await selectChoiceByLabel(page, 'A');

    const verdictPill = await expectVerdictPillVisible(page);
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
