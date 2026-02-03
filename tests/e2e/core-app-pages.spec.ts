import { expect, type Page, test } from '@playwright/test';

const clerkUsername = process.env.E2E_CLERK_USER_USERNAME;
const clerkPassword = process.env.E2E_CLERK_USER_PASSWORD;

const QUESTION_SLUG = 'placeholder-01-naltrexone-mechanism';

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

test.describe('core app pages', () => {
  test.skip(!clerkUsername || !clerkPassword, 'Missing Clerk E2E credentials');

  test('subscribed user can navigate dashboard, billing, bookmarks, and review', async ({
    page,
  }) => {
    await signInWithClerk(page);
    await ensureSubscribed(page);

    // Bookmark a question from practice so the bookmarks page is non-empty.
    await page.goto('/app/practice');
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    const bookmarkButton = page.getByRole('button', {
      name: /Bookmark|Bookmarked/,
    });
    await expect(bookmarkButton).toBeVisible();

    if (await page.getByRole('button', { name: 'Bookmark' }).count()) {
      await page.getByRole('button', { name: 'Bookmark' }).click();
    }
    await expect(
      page.getByRole('button', { name: 'Bookmarked' }),
    ).toBeVisible();

    // Create a missed question attempt via a deterministic seeded slug.
    await page.goto(`/app/questions/${QUESTION_SLUG}`);
    await expect(page.getByRole('heading', { name: 'Question' })).toBeVisible();
    await expect(page.getByText(/Loading question/i)).toBeHidden({
      timeout: 15_000,
    });

    const choiceA = page.getByRole('button').filter({
      has: page.getByText(/^A$/),
    });
    await choiceA.first().click();
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('Incorrect')).toBeVisible();
    await expect(page.getByText('Explanation')).toBeVisible();

    // Review lists missed questions and links to reattempt.
    await page.goto('/app/review');
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();

    const missedRow = page.locator('li', { hasText: QUESTION_SLUG });
    await expect(missedRow).toBeVisible();
    await missedRow.getByRole('link', { name: 'Reattempt' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/questions/${QUESTION_SLUG}`));

    // Dashboard shows stats and recent activity (including the missed attempt).
    await page.goto('/app/dashboard');
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();
    await expect(page.getByText('Total answered')).toBeVisible();
    await expect(page.getByText('Overall accuracy')).toBeVisible();
    await expect(page.getByText('Recent activity')).toBeVisible();
    await expect(page.getByText(QUESTION_SLUG)).toBeVisible();

    // Bookmarks view shows the bookmarked list.
    await page.goto('/app/bookmarks');
    await expect(
      page.getByRole('heading', { name: 'Bookmarks' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();

    // Billing shows the manage button for an active subscription.
    await page.goto('/app/billing');
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Manage in Stripe' }),
    ).toBeVisible();
  });
});
