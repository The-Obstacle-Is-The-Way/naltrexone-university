import { expect, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

test.describe('practice session continuation', () => {
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('practice page shows continue-session card and resumes session', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await startSession(page, 'tutor');
    const sessionInfo = page.getByText(/Session: tutor/i);
    await expect(sessionInfo).toBeVisible();
    await expect(sessionInfo).toContainText('1/');

    const sessionUrl = page.url();
    await page.goto('/app/dashboard');
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    await page.goto('/app/practice');
    await expect(page.getByText('Continue session')).toBeVisible();
    await expect(page.getByText(/Tutor mode|Exam mode/)).toBeVisible();
    await page.getByRole('link', { name: 'Resume session' }).click();
    await expect(page).toHaveURL(sessionUrl);
    await expect(sessionInfo).toContainText('1/');
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
  });
});
