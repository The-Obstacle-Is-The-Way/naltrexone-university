import { expect, type Page, type Route, test } from '@playwright/test';
import { withTimeout } from '@/lib/with-timeout';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import {
  type E2EEntitlementSnapshot,
  ensureSubscribed,
  removeE2EUserEntitlement,
  restoreE2EUserEntitlement,
} from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

const ACTION_BODY_TIMEOUT_MS = 30_000;

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

    const actionPageUrl = new URL(page.url());
    const matchesActionPage = (url: URL) =>
      url.origin === actionPageUrl.origin &&
      url.pathname === actionPageUrl.pathname;
    const actionBody = Promise.withResolvers<string>();
    let capturedAction = false;
    const captureActionBody = async (route: Route): Promise<void> => {
      const request = route.request();
      const matchesStartSession =
        request.method() === 'POST' &&
        request.headers()['next-action'] !== undefined &&
        request.postData()?.includes('"idempotencyKey"') === true &&
        request.postData()?.includes('"mode":"tutor"') === true;

      if (!matchesStartSession || capturedAction) {
        await route.fallback();
        return;
      }

      capturedAction = true;
      try {
        // microsoft/playwright#41512: buffer the real response before the
        // page can release Chromium's resource, then deliver it unchanged.
        const response = await route.fetch();
        const body = await response.text();
        await route.fulfill({ response, body });
        actionBody.resolve(body);
      } catch (error) {
        actionBody.reject(error);
        await route.abort();
      }
    };

    await page.route(matchesActionPage, captureActionBody);
    try {
      await page.getByRole('button', { name: 'Start session' }).click();
      expect(
        await withTimeout(actionBody.promise, ACTION_BODY_TIMEOUT_MS),
      ).toContain('UNSUBSCRIBED');
      await expect(
        page.getByRole('alert').filter({ hasText: 'Subscription required' }),
      ).toHaveText('Subscription required');
    } finally {
      await page.unroute(matchesActionPage, captureActionBody);
    }

    await page.goto('/app/dashboard');
    await expect(page).toHaveURL(/\/pricing\?reason=subscription_required$/);
    await expect(
      page.getByText(
        'Start your free trial to access the app — no card required.',
      ),
    ).toBeVisible();
  });
});
