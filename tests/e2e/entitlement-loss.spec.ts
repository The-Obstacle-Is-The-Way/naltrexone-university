import { expect, type Page, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import {
  type E2EEntitlementSnapshot,
  ensureSubscribed,
  removeE2EUserEntitlement,
  restoreE2EUserEntitlement,
} from './helpers/subscription';

async function enableStartSession(page: Page): Promise<void> {
  const startSessionButton = page.getByRole('button', {
    name: 'Start session',
  });
  await expect(startSessionButton).toBeVisible({ timeout: 15_000 });

  for (const status of ['Unanswered', 'Incorrect', 'Bookmarked'] as const) {
    await page.getByRole('button', { name: status, exact: true }).click();
    await page.getByLabel('Questions').fill('1');
    if (await startSessionButton.isEnabled()) return;
  }

  await expect(startSessionButton).toBeEnabled({ timeout: 10_000 });
}

test.describe('entitlement loss', () => {
  // Clerk sign-in, an in-flight Server Action, and the redirect assertion span multiple pages.
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  let entitlementSnapshot: E2EEntitlementSnapshot | null = null;

  test.beforeEach(async () => {
    entitlementSnapshot = null;
    await runE2EUserStateReset();
  });

  test.afterEach(async () => {
    if (entitlementSnapshot) {
      await restoreE2EUserEntitlement(entitlementSnapshot);
      entitlementSnapshot = null;
    }
  });

  test('redirects an unentitled user and rejects an in-flight Server Action', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await page.goto('/app/practice');
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
    await enableStartSession(page);

    entitlementSnapshot = await removeE2EUserEntitlement();

    const actionResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.request().headers()['next-action'] !== undefined &&
        response.request().postData()?.includes('"idempotencyKey"') === true &&
        response.request().postData()?.includes('"mode":"tutor"') === true,
    );
    await page.getByRole('button', { name: 'Start session' }).click();
    const actionResponse = await actionResponsePromise;
    const actionBody = await actionResponse.text();

    expect(actionBody).toContain('UNSUBSCRIBED');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Subscription required' }),
    ).toHaveText('Subscription required');

    await page.goto('/app/dashboard');
    await expect(page).toHaveURL(/\/pricing\?reason=subscription_required$/);
    await expect(
      page.getByText(
        'Start your free trial to access the app — no card required.',
      ),
    ).toBeVisible();
  });
});
