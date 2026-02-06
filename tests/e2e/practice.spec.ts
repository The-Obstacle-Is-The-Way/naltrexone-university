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

  test('exam mode hides explanation content before session end', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await startSession(page, 'exam');

    await selectChoiceByLabel(page, 'A');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(
      page.getByText('No more questions found.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Explanation not available.', { exact: true }),
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'End session' }).click();
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible();
  });
});
