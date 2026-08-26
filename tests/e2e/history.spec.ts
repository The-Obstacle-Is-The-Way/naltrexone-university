import { expect, test } from '@playwright/test';
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

test.describe('history', () => {
  // Authenticated E2E flows include Clerk sign-in and seeded subscription setup; allow CI headroom.
  test.setTimeout(120_000);
  test.beforeEach(async () => {
    await runE2EUserStateReset();
  });

  test('shows missed questions and removes them after correct reattempt', async ({
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
    const reattemptLink = page.locator(`a[href*="${QUESTION_SLUG}"]`).first();
    await expect(reattemptLink).toBeVisible();

    await reattemptLink.click();
    await expect(page).toHaveURL(
      new RegExp(`/app/questions/${QUESTION_SLUG}`),
      {
        timeout: 15_000,
      },
    );

    await submitQuestionForOutcome(page, QUESTION_SLUG, 'Correct');

    await page.goto('/app/history?tab=questions&result=incorrect', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator(`a[href*="${QUESTION_SLUG}"]`)).toHaveCount(0, {
      timeout: 15_000,
    });
  });
});
