import { expect, test } from '@playwright/test';

const clerkUsername = process.env.E2E_CLERK_USER_USERNAME;
const clerkPassword = process.env.E2E_CLERK_USER_PASSWORD;

test.describe('subscribe and practice', () => {
  test.skip(!clerkUsername || !clerkPassword, 'Missing Clerk E2E credentials');

  test('user can subscribe and answer a question', async ({ page }) => {
    // Sign in via Clerk
    await page.goto('/sign-in');

    const identifierInput = page.getByLabel(/username|email/i);
    await identifierInput.fill(clerkUsername ?? '');

    const continueButton = page.getByRole('button', {
      name: /continue|sign in/i,
    });
    await continueButton.click();

    const passwordInput = page.getByLabel(/password/i);
    await passwordInput.fill(clerkPassword ?? '');

    await page.getByRole('button', { name: /continue|sign in/i }).click();

    // Subscribe (monthly)
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();

    await page.getByRole('button', { name: 'Subscribe Monthly' }).click();

    await expect(page).toHaveURL(/stripe\.com/);

    // Stripe Checkout (test card)
    const cardNumber = page
      .frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('input[name="cardnumber"]');
    const expDate = page
      .frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('input[name="exp-date"]');
    const cvc = page
      .frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('input[name="cvc"]');
    const postal = page
      .frameLocator('iframe[name^="__privateStripeFrame"]')
      .locator('input[name="postal"]');

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

    // Success page syncs and redirects to dashboard
    await expect(page).toHaveURL(/\/app\/dashboard/);
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    // Practice flow
    await page.goto('/app/practice');
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    // Select first choice and submit
    const firstChoiceButton = page.getByRole('button').filter({
      has: page.getByText(/^A$/),
    });
    await firstChoiceButton.first().click();

    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText(/Correct|Incorrect/)).toBeVisible();
    await expect(page.getByText('Explanation')).toBeVisible();
  });
});
