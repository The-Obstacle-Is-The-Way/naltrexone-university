import { expect, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { selectChoiceByLabel } from './helpers/question';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

test.describe('practice', () => {
  // Authenticated E2E flows include Clerk sign-in and seeded subscription setup; allow CI headroom.
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');
  test.beforeEach(async () => {
    await runE2EUserStateReset();
  });

  test('subscribed user can run a tutor session and end on summary', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/practice');
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
    await expect(page.getByText('Recent sessions')).toHaveCount(0);

    await startSession(page, 'tutor');

    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();

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
    await expect(
      page.getByText('Explanation not available.', { exact: true }),
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'End session' }).click();
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'View in History' }),
    ).toHaveAttribute('href', '/app/history');
  });

  test('quick practice submit shows correctness feedback', async ({ page }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/practice/quick?status=unanswered');
    await expect(
      page.getByRole('heading', { name: 'Quick Practice' }),
    ).toBeVisible();

    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText(/^(Correct|Incorrect)$/)).toBeVisible();
  });

  test('exam mode completes session without showing explanation', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await startSession(page, 'exam');

    await selectChoiceByLabel(page, 'A');

    // Exam mode does not show feedback or explanations while the exam is active.
    await expect(
      page.getByText('Correct Answer', { exact: true }),
    ).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Mark for review' }),
    ).toBeVisible();

    // Click "Review answers" to enter exam review view
    await page
      .getByTestId('bottom-action-bar')
      .getByRole('button', { name: 'Review answers' })
      .click();

    // Wait for exam review to load with the "Submit exam" button
    const submitExamButton = page.getByRole('button', { name: 'Submit exam' });
    await expect(submitExamButton).toBeVisible({ timeout: 15_000 });

    // Submit the exam via confirmation dialog
    await submitExamButton.click();
    await page.getByRole('button', { name: 'Confirm submit' }).click();

    // Wait for session to end and summary to appear
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
