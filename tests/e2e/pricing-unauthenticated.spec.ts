import { expect, test } from '@playwright/test';

test('unauthenticated pricing CTA links to sign-up with selected plan context', async ({
  page,
}) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();

  const startTrial = page.getByRole('link', {
    name: 'Start 7-day free trial',
  });
  // Literal expectations on purpose: deriving them from the same route
  // helpers production uses would let a helper regression pass silently.
  const expectedHref = '/sign-up?redirect_url=%2Fpricing%3Fplan%3Dmonthly';
  await expect(startTrial.first()).toBeVisible();
  await expect(startTrial.first()).toHaveAttribute('href', expectedHref);

  await startTrial.first().click();

  await expect(page).toHaveURL(/\/sign-up/, { timeout: 15_000 });
  const url = new URL(page.url());
  expect(url.searchParams.get('redirect_url')).toBe('/pricing?plan=monthly');
});
