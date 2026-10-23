import { expect, type Page, type Request, type Route } from '@playwright/test';
import { withTimeout } from '@/lib/with-timeout';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { test } from './helpers/clerk-auth-test';
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
  await page.getByLabel('Questions').fill('1');
  // The reset leaves unanswered questions, and Unanswered is the default
  // filter, so no filter changes. The page then shows this from its first
  // render until its one count returns, 200 ms after load, and Start session
  // stays enabled while it counts.
  await expect(page.getByText('Counting questions…')).toBeHidden();
  await expect(startSessionButton).toBeEnabled();
}

function countServerActionsInFlight(page: Page): () => number {
  const inFlight = new Set<Request>();
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.headers()['next-action'] !== undefined
    ) {
      inFlight.add(request);
    }
  });
  const settle = (request: Request) => {
    inFlight.delete(request);
  };
  page.on('requestfinished', settle);
  page.on('requestfailed', settle);
  return () => inFlight.size;
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
    const pricingUrl = /\/pricing\?reason=subscription_required$/;
    const trialOffer = page.getByText(
      'Start your free trial to access the app — no card required.',
    );

    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    const actionsInFlight = countServerActionsInFlight(page);
    await page.goto('/app/practice');
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
    await enableStartSession(page);
    // BUG-365: any refused action replaces the page with Pricing. In CI run
    // 40001450731 the page's own count was refused before the click, so the
    // entitlement goes only once no action is in flight.
    await expect.poll(actionsInFlight).toBe(0);

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

    // The route stays until the page closes; after its one capture it falls
    // back for every request. BUG-365: the refused action replaces the page
    // with Pricing, and in CI run 39873346857 an unroute after that navigation
    // never returned, so the test timed out.
    await page.route(matchesActionPage, captureActionBody);
    await page.getByRole('button', { name: 'Start session' }).click();
    expect(
      await withTimeout(actionBody.promise, ACTION_BODY_TIMEOUT_MS),
    ).toContain('UNSUBSCRIBED');
    // BUG-365: the refused action leaves the app frame for Pricing.
    await expect(page).toHaveURL(pricingUrl);
    await expect(trialOffer).toBeVisible();

    await page.goto('/app/dashboard');
    await expect(page).toHaveURL(pricingUrl);
    await expect(trialOffer).toBeVisible();
  });
});
