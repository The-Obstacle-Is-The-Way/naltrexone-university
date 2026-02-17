import { expect, test } from '@playwright/test';
import {
  hasClerkCredentials,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

test.describe('practice session continuation', () => {
  // Authenticated E2E flows include Clerk sign-in and seeded subscription setup; allow CI headroom.
  test.setTimeout(120_000);
  test.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');

  test('practice page shows continue-session card and resumes session', async ({
    page,
  }) => {
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);

    await startSession(page, 'tutor');
    // Session page now shows "Tutor Session" heading and "Question X of Y" description
    await expect(
      page.getByRole('heading', { name: 'Tutor Session' }),
    ).toBeVisible();
    await expect(page.getByText(/Question 1 of/)).toBeVisible();

    const sessionUrl = page.url();
    await page.goto('/app/dashboard');
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    await page.goto('/app/practice');
    await expect(page.getByText('Continue session')).toBeVisible();
    await expect(page.getByText(/Tutor mode|Exam mode/)).toBeVisible();
    await page.getByRole('link', { name: 'Resume session' }).click();
    await expect(page).toHaveURL(sessionUrl);
    await expect(page.getByText(/Question 1 of/)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Tutor Session' }),
    ).toBeVisible();
  });
});
