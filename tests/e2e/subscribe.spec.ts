import { expect, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';

test.describe('subscribe', () => {
  // Authenticated E2E flows include Clerk sign-in and seeded subscription setup; allow CI headroom.
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('subscribed user sees confirmation and can reach dashboard', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);

    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();

    await expect(page.getByText("You're already subscribed")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('link', { name: 'Go to Dashboard' }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 15_000 });
    const appNavigation = page.getByRole('navigation', {
      name: 'App navigation',
    });
    await expect(appNavigation).toBeVisible({ timeout: 15_000 });
    await expect(
      appNavigation.getByRole('link', { name: 'Dashboard' }),
    ).toBeVisible();
  });
});
