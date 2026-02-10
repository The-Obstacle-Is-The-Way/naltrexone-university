import { expect, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { selectChoiceByLabel } from './helpers/question';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

test.describe('practice', () => {
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('subscribed user can run a tutor session and end on summary', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await startSession(page, 'tutor');

    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText(/Correct|Incorrect/)).toBeVisible();
    await expect(page.getByText('Explanation', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Explanation not available.', { exact: true }),
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'End session' }).click();
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible();
  });

  test('exam mode completes session without showing explanation', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await startSession(page, 'exam');

    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();

    // Exam mode does not show explanation after submit
    await expect(
      page.getByText('Explanation', { exact: true }),
    ).not.toBeVisible();

    // Click "Review answers" to enter exam review view
    await page.getByRole('button', { name: 'Review answers' }).click();

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
