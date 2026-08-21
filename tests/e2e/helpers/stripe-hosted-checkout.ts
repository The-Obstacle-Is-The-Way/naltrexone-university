import { expect, type Page } from '@playwright/test';

/**
 * Drives Stripe-owned Checkout markup for the observational hosted smoke only.
 * Required PR E2E must stop at the checkout.stripe.com origin boundary.
 */
export async function completeNoCardTrialCheckout(page: Page): Promise<void> {
  await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  const termsCheckbox = page.getByRole('checkbox', {
    name: /I agree to .*Terms of Service and Privacy Policy/i,
  });
  await expect(termsCheckbox).toBeVisible({ timeout: 30_000 });
  await termsCheckbox.check();
  await expect(termsCheckbox).toBeChecked();

  const startTrialButton = page
    .getByRole('button', {
      name: /start (free )?trial|subscribe|continue/i,
    })
    .first();
  await expect(startTrialButton).toBeVisible({ timeout: 30_000 });
  await startTrialButton.click();
}
