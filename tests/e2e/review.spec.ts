import { expect, test } from '@playwright/test';
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

test.describe('review', () => {
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('shows missed questions and removes them after correct reattempt', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, QUESTION_SLUG);

    await submitQuestionForOutcome(page, QUESTION_SLUG, 'Incorrect');

    await page.goto('/app/review', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
    const reattemptLink = page
      .locator(`a[href="/app/questions/${QUESTION_SLUG}"]`)
      .first();
    await expect(reattemptLink).toBeVisible();

    await reattemptLink.click();
    await expect(page).toHaveURL(
      new RegExp(`/app/questions/${QUESTION_SLUG}`),
      {
        timeout: 15_000,
      },
    );

    await submitQuestionForOutcome(page, QUESTION_SLUG, 'Correct');

    await page.goto('/app/review', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.locator(`a[href="/app/questions/${QUESTION_SLUG}"]`),
    ).toHaveCount(0, { timeout: 15_000 });
  });
});
