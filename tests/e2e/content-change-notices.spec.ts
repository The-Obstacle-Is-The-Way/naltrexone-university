import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { ROUTES, toQuestionRoute } from '@/lib/routes';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import {
  type ContentChanges,
  openContentChanges,
} from './helpers/content-changes';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { ensureSubscribed } from './helpers/subscription';

// DEBT-496: the notices a learner sees when content changed after they saw it
// (ADR-022), proven on real pages from database state, with a screenshot of
// each attached to the report.

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

test.describe('content-change notices', () => {
  // Authenticated E2E flows include Clerk sign-in and seeded subscription setup; allow CI headroom.
  test.setTimeout(120_000);
  let changes: ContentChanges | undefined;

  test.beforeEach(async ({ page }) => {
    await runE2EUserStateReset();
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    changes = await openContentChanges();
  });

  test.afterEach(async () => {
    await changes?.dispose();
    changes = undefined;
  });

  test('a key corrected since the answer is flagged on its review', async ({
    page,
  }, testInfo) => {
    if (!changes) throw new Error('content changes not arranged');
    const { slug, attemptId } = await changes.keyCorrectedAttempt();
    const scored = await changes.scoredAttempt();
    const scoredIncorrect = await changes.scoredAttempt('incorrect');
    const heldIncorrect = await changes.heldAttempt('incorrect');

    await page.goto(
      toQuestionRoute(slug, { from: 'history', mode: 'review', attemptId }),
    );

    const notice = page
      .getByRole('status')
      .filter({ hasText: 'The answer to this question was corrected' });
    await expect(notice).toContainText(
      'The answer to this question was corrected after you answered.',
    );
    await expect(notice).toContainText("This attempt isn't scored.");
    await expect(
      notice.getByRole('link', { name: 'Practice the corrected question' }),
    ).toHaveAttribute('href', toQuestionRoute(slug));
    // DEBT-498: the answer is not graded against the superseded key, and the
    // explanation written for that key is not shown.
    await expect(page.getByTestId('verdict-pill')).toHaveText('Not scored');
    await expect(
      page.getByRole('radio', { name: /Answer before the correction/ }),
    ).toHaveCount(1);
    await expect(page.getByText('Explanation', { exact: true })).toHaveCount(0);
    await attachScreenshot(page, testInfo, 'key-corrected-review');

    // DEBT-498 increment 2a: the Dashboard's recent activity names it too.
    await page.goto(ROUTES.APP_DASHBOARD);
    const activity = page
      .getByRole('listitem')
      .filter({ has: page.locator(`a[href*="${slug}"]`) });
    await expect(activity).toHaveCount(1);
    await expect(activity).toContainText('Not scored');
    await expect(activity).not.toContainText('Correct');
    await attachScreenshot(page, testInfo, 'key-corrected-dashboard');

    // DEBT-498 increment 2b: History names it too. A result no score counts,
    // answered correctly (the key-corrected one) or not (the held one), is
    // under neither result filter, while scored answers keep their filter.
    const historyRow = (rowSlug: string) =>
      page
        .getByRole('listitem')
        .filter({ has: page.locator(`a[href*="${rowSlug}"]`) });
    await page.goto(`${ROUTES.APP_HISTORY}?tab=questions`);
    await expect(historyRow(slug)).toHaveCount(1);
    await expect(historyRow(slug)).toContainText('Not scored');
    await expect(historyRow(slug)).not.toContainText('Correct');
    await attachScreenshot(page, testInfo, 'key-corrected-history');

    await page.goto(`${ROUTES.APP_HISTORY}?tab=questions&result=correct`);
    await expect(historyRow(scored.slug)).toHaveCount(1);
    await expect(historyRow(slug)).toHaveCount(0);

    await page.goto(`${ROUTES.APP_HISTORY}?tab=questions&result=incorrect`);
    await expect(page.getByRole('combobox', { name: 'Result' })).toHaveText(
      'Incorrect',
    );
    await expect(historyRow(scoredIncorrect.slug)).toHaveCount(1);
    await expect(historyRow(heldIncorrect.slug)).toHaveCount(0);
    await expect(historyRow(slug)).toHaveCount(0);
  });

  test('a question placed under review after the answer is named in History and on its review', async ({
    page,
  }, testInfo) => {
    if (!changes) throw new Error('content changes not arranged');
    const { slug, attemptId } = await changes.heldAttempt();

    await page.goto(`${ROUTES.APP_HISTORY}?tab=questions`);

    const row = page
      .getByRole('listitem')
      .filter({ has: page.locator(`a[href*="${slug}"]`) });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Under review');
    // DEBT-498 increment 2b: no score counts it, so it is not graded.
    await expect(row).toContainText('Not scored');
    await expect(row).not.toContainText('Correct');
    await attachScreenshot(page, testInfo, 'under-review-history');

    await page.goto(
      toQuestionRoute(slug, { from: 'history', mode: 'review', attemptId }),
    );

    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'This question is under review.' }),
    ).toBeVisible();
    // DEBT-498: not graded, its key named in words.
    await expect(page.getByTestId('verdict-pill')).toHaveText('Not scored');
    await expect(page.getByRole('radio', { name: /Keyed answer/ })).toHaveCount(
      1,
    );
    await attachScreenshot(page, testInfo, 'under-review-review');
  });

  test('a bookmarked question withdrawn since is named on Bookmarks, with no content', async ({
    page,
  }, testInfo) => {
    if (!changes) throw new Error('content changes not arranged');
    await changes.withdrawnBookmark();

    await page.goto(ROUTES.APP_BOOKMARKS);

    const row = page
      .getByRole('listitem')
      .filter({ hasText: 'This question was withdrawn.' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Withdrawn');
    await expect(row.getByRole('link')).toHaveCount(0);
    // The stem's rendered text, as a preview would show it.
    await expect(row).not.toContainText('Stem');
    await attachScreenshot(page, testInfo, 'withdrawn-bookmark');
  });
});
