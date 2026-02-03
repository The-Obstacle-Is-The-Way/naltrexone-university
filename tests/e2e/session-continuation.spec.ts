import { expect, type Page, test } from '@playwright/test';

const clerkUsername = process.env.E2E_CLERK_USER_USERNAME;
const clerkPassword = process.env.E2E_CLERK_USER_PASSWORD;

async function signInWithClerk(page: Page) {
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
}

async function completeStripeCheckout(page: Page) {
  await expect(page).toHaveURL(/stripe\.com/);

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
  await expect(page).toHaveURL(/\/app\/dashboard/);
}

async function ensureSubscribed(page: Page) {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();

  const alreadySubscribed = page.getByText("You're already subscribed");
  if (await alreadySubscribed.count()) {
    await page.getByRole('link', { name: 'Go to Dashboard' }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);
    return;
  }

  await page.getByRole('button', { name: 'Subscribe Monthly' }).click();
  await completeStripeCheckout(page);
}

test.describe('practice session continuation', () => {
  test.skip(!clerkUsername || !clerkPassword, 'Missing Clerk E2E credentials');

  test('user can resume a session via /app/practice/[sessionId]', async ({
    page,
  }) => {
    await signInWithClerk(page);
    await ensureSubscribed(page);

    await page.goto('/app/practice');
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    await page.getByRole('button', { name: 'Start session' }).click();
    await expect(page).toHaveURL(/\/app\/practice\/[^/]+$/);
    const sessionInfo = page.getByText(/Session: tutor/i);
    await expect(sessionInfo).toBeVisible();
    await expect(sessionInfo).toContainText('1/');

    const firstChoiceButton = page.getByRole('button').filter({
      has: page.getByText(/^A$/),
    });
    await firstChoiceButton.first().click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText(/Correct|Incorrect/)).toBeVisible();

    await page.getByRole('button', { name: 'Next Question' }).click();
    await expect(sessionInfo).toContainText('2/');

    const sessionUrl = page.url();
    await page.goto('/app/dashboard');
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    await page.goto(sessionUrl);
    await expect(page).toHaveURL(sessionUrl);
    await expect(sessionInfo).toContainText('2/');
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
  });
});
