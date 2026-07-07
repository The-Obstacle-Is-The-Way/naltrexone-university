import { expect, test } from '@playwright/test';
import {
  AUTH_REDIRECT_QUERY_PARAM,
  toPricingRoute,
  toSignUpRedirectRoute,
} from '@/lib/routes';

test('unauthenticated pricing CTA links to sign-up with selected plan context', async ({
  page,
}) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();

  const startTrial = page.getByRole('link', {
    name: 'Start 7-day free trial',
  });
  const expectedHref = toSignUpRedirectRoute(
    toPricingRoute({ plan: 'monthly' }),
  );
  await expect(startTrial.first()).toBeVisible();
  await expect(startTrial.first()).toHaveAttribute('href', expectedHref);

  await startTrial.first().click();

  await expect(page).toHaveURL(/\/sign-up/, { timeout: 15_000 });
  const url = new URL(page.url());
  expect(url.searchParams.get(AUTH_REDIRECT_QUERY_PARAM)).toBe(
    toPricingRoute({ plan: 'monthly' }),
  );
});
