import { expect, type Page } from '@playwright/test';

async function completeStripeCheckout(page: Page): Promise<void> {
  await expect(page).toHaveURL(/stripe\.com/);

  const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]');
  const cardNumber = stripeFrame.locator('input[name="cardnumber"]');
  const expDate = stripeFrame.locator('input[name="exp-date"]');
  const cvc = stripeFrame.locator('input[name="cvc"]');
  const postal = stripeFrame.locator('input[name="postal"]');

  if (await cardNumber.isVisible({ timeout: 10_000 })) {
    await cardNumber.fill('4242424242424242');
  }
  if (await expDate.isVisible({ timeout: 10_000 })) {
    await expDate.fill('1234');
  }
  if (await cvc.isVisible({ timeout: 10_000 })) {
    await cvc.fill('123');
  }
  if (await postal.isVisible({ timeout: 10_000 })) {
    await postal.fill('94107');
  }

  await page.getByRole('button', { name: /subscribe|pay/i }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 30_000 });
}

export async function ensureSubscribed(page: Page): Promise<void> {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();

  const subscribedMessage = page.getByText("You're already subscribed");
  const isAlreadySubscribed = await subscribedMessage
    .isVisible({ timeout: 10_000 })
    .catch(() => false);
  if (isAlreadySubscribed) {
    return;
  }

  const subscribeMonthlyButton = page.getByRole('button', {
    name: 'Subscribe Monthly',
  });
  await expect(subscribeMonthlyButton).toBeVisible({ timeout: 10_000 });
  await subscribeMonthlyButton.click();
  await completeStripeCheckout(page);
}
