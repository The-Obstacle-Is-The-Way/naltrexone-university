import { expect, type Page } from '@playwright/test';

/**
 * Drives Stripe-owned Checkout markup for the observational hosted smoke only.
 * Required PR E2E must stop at the checkout.stripe.com origin boundary.
 */
export async function completeNoCardTrialCheckout(page: Page): Promise<void> {
  await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  await acceptHostedCheckoutTerms(page);

  const startTrialButton = page
    .getByRole('button', {
      name: /start (free )?trial|subscribe|continue/i,
    })
    .first();
  await expect(startTrialButton).toBeVisible({ timeout: 30_000 });
  await startTrialButton.click();
}

// DEBT-414 F03b: the trial add-card offer's setup-mode Checkout saves a card
// without charging it. The Session names no customer, so Stripe asks for the
// learner's email.
export async function completeHostedCardSetup(
  page: Page,
  email: string,
): Promise<void> {
  await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  const emailField = page.getByRole('textbox', { name: 'Email' });
  await expect(emailField).toBeVisible({ timeout: 30_000 });
  if ((await emailField.inputValue()) === '') {
    await emailField.fill(email);
  }
  await fillHostedCheckoutTestCard(page);
  await acceptHostedCheckoutTerms(page);

  const saveButton = page
    .getByRole('button', { name: /^(save|set up|confirm|continue)\b/i })
    .first();
  await expect(saveButton).toBeVisible({ timeout: 30_000 });
  await saveButton.click();
}

export async function fillHostedCheckoutTestCard(page: Page): Promise<void> {
  const cardPaymentMethod = page.getByRole('radio', {
    name: 'Card',
    exact: true,
  });
  const cardNumber = page.getByLabel(/card number/i);
  await expect
    .poll(
      async () =>
        (await cardPaymentMethod.isVisible()) || (await cardNumber.isVisible()),
      { timeout: 30_000 },
    )
    .toBe(true);
  if (await cardPaymentMethod.isVisible()) {
    // Older Checkout markup requires expanding Card; its cover intercepts clicks.
    await cardPaymentMethod.check({ force: true });
    await expect(cardPaymentMethod).toBeChecked();
  }
  const saveInformation = page.getByRole('checkbox', {
    name: 'Save my information for faster checkout',
  });
  if (
    (await saveInformation.isVisible()) &&
    (await saveInformation.isChecked())
  ) {
    await saveInformation.uncheck();
  }
  await cardNumber.fill('4242424242424242');
  await page.getByLabel(/expiration/i).fill('12/30');
  await page.getByRole('textbox', { name: /\bCVC(?:\/CVV)?$/i }).fill('123');

  const cardholderName = page.getByLabel(/cardholder name|name on card/i);
  if (await cardholderName.isVisible()) {
    await cardholderName.fill('E2E Test User');
  }

  const postalCode = page.getByLabel(/zip|postal code/i);
  if (await postalCode.isVisible()) {
    await postalCode.fill('10001');
  }
}

export async function acceptHostedCheckoutTerms(page: Page): Promise<void> {
  const termsCheckbox = page.getByRole('checkbox', {
    name: /I agree to .*Terms of Service and Privacy Policy/i,
  });
  await expect(termsCheckbox).toBeVisible({ timeout: 30_000 });
  await termsCheckbox.check();
  await expect(termsCheckbox).toBeChecked();
}
