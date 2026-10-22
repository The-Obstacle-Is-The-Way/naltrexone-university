import { expect } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { test } from './helpers/clerk-auth-test';
import {
  ensureSubscribed,
  removeE2EUserEntitlement,
  restoreE2EUserEntitlement,
} from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

// The persisted cutoff reaches the production Billing page. Both projects
// attach the rendered notice so its longer date can be reviewed on a phone.
test(
  'scheduled cancellation states the prior US evening without horizontal overflow',
  {
    tag: '@mobile-smoke',
  },
  async ({ page }, testInfo) => {
    // Includes Clerk sign-in and the first authenticated page load.
    test.setTimeout(120_000);
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    const snapshot = await removeE2EUserEntitlement();
    try {
      const year = new Date().getUTCFullYear() + 1;
      await restoreE2EUserEntitlement({
        ...snapshot,
        status: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(Date.UTC(year, 0, 15, 3)),
      });
      await page.goto('/app/billing');
      await expect(
        page.getByRole('heading', { name: 'Billing' }),
      ).toBeVisible();
      await expect(page.getByText('Cancellation scheduled')).toBeVisible();
      await expect(
        page.getByText(
          `Your subscription will cancel on January 15, ${year} at 3:00 AM UTC (January 14 at 10:00 PM EST, January 14 at 7:00 PM PST). You'll keep access until then.`,
        ),
      ).toBeVisible();
      const width = await page.evaluate(async () => {
        await document.fonts.ready;
        return {
          scroll: document.documentElement.scrollWidth,
          viewport: document.documentElement.clientWidth,
        };
      });
      expect(width.scroll).toBe(width.viewport);
      await testInfo.attach('billing-cancellation-cutoff', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    } finally {
      await restoreE2EUserEntitlement(snapshot);
    }
  },
);
