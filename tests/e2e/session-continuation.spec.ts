import { expect, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { ensureSubscribed } from './helpers/subscription';

test.describe('practice session continuation', () => {
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('user can resume a session via /app/practice/[sessionId]', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await page.goto('/app/practice');
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
    await page.locator('input[type="number"]').first().fill('1');

    await page.getByRole('button', { name: 'Start session' }).click();
    await expect(page).toHaveURL(/\/app\/practice\/[^/]+$/, {
      timeout: 15_000,
    });
    const sessionInfo = page.getByText(/Session: tutor/i);
    await expect(sessionInfo).toBeVisible();
    await expect(sessionInfo).toContainText('1/');

    const sessionUrl = page.url();
    await page.goto('/app/dashboard');
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    await page.goto(sessionUrl);
    await expect(page).toHaveURL(sessionUrl);
    await expect(sessionInfo).toContainText('1/');
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
  });
});
