import { expect, test } from '@playwright/test';
import { ensureBookmarkedQuestion } from './helpers/bookmark';
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

test.describe('core app pages', () => {
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('subscribed user can navigate dashboard, billing, bookmarks, and review', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await assertQuestionSlugExists(page, QUESTION_SLUG);

    await ensureBookmarkedQuestion(page);

    // Create a missed question attempt via a deterministic seeded slug.
    await submitQuestionForOutcome(page, QUESTION_SLUG, 'Incorrect');
    await expect(page.getByText('Explanation', { exact: true })).toBeVisible();

    // Review lists missed questions and links to reattempt.
    await page.goto('/app/review', {
      timeout: 60_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();

    const missedRow = page.locator('li', { hasText: QUESTION_SLUG });
    await expect(missedRow).toBeVisible();
    await missedRow.getByRole('link', { name: 'Reattempt' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/questions/${QUESTION_SLUG}`),
      {
        timeout: 15_000,
      },
    );

    // Dashboard shows stats and recent activity (including the missed attempt).
    await page.goto('/app/dashboard');
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
    await expect(page.getByText('Total answered')).toBeVisible();
    await expect(page.getByText('Overall accuracy')).toBeVisible();
    await expect(page.getByText('Recent activity')).toBeVisible();
    await expect(page.getByText(QUESTION_SLUG).first()).toBeVisible();

    // Bookmarks view shows the bookmarked list.
    await page.goto('/app/bookmarks');
    await expect(
      page.getByRole('heading', { name: 'Bookmarks' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Remove' }).first(),
    ).toBeVisible();

    // Billing shows the manage button for an active subscription.
    await page.goto('/app/billing');
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Manage in Stripe' }),
    ).toBeVisible();
  });
});
