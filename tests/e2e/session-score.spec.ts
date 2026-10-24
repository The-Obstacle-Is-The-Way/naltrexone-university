import { expect } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { test } from './helpers/clerk-auth-test';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });
test.beforeEach(async () => {
  await runE2EUserStateReset();
});
test.afterEach(async () => {
  await runE2EUserStateReset();
});

test(
  'an unanswered tutor session displays 0% on its summary, History and Dashboard',
  {
    tag: '@mobile-smoke',
  },
  async ({ page }, testInfo) => {
    // Clerk sign-in, session creation and three real page reads.
    test.setTimeout(120_000);
    await signInWithClerkPassword(page);
    await ensureSubscribed(page);
    await startSession(page, 'tutor', 1);
    const sessionId = new URL(page.url()).pathname.split('/').at(-1);
    if (!sessionId) throw new Error('Expected the started session route');
    await page
      .getByRole('button', { name: 'End session', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Session Summary' }),
    ).toBeVisible();
    const accuracy = page.getByText('Accuracy', { exact: true }).locator('..');
    await expect(accuracy).toContainText('0%');
    await testInfo.attach('zero-answer-tutor-summary', {
      body: await accuracy.screenshot(),
      contentType: 'image/png',
    });

    await page.goto('/app/history?tab=sessions');
    const historyRow = page.getByRole('listitem').filter({
      has: page.locator(`button[aria-controls="breakdown-${sessionId}"]`),
    });
    await expect(historyRow).toContainText('0/1 correct (0%)');
    await testInfo.attach('zero-answer-tutor-history', {
      body: await historyRow.screenshot(),
      contentType: 'image/png',
    });

    await page.goto('/app/dashboard');
    const dashboardRow = page.getByRole('listitem').filter({
      has: page.locator(`a[href*="sessionId=${sessionId}"]`),
    });
    await expect(dashboardRow).toContainText('0/1 correct (0%)');
    await testInfo.attach('zero-answer-tutor-dashboard', {
      body: await dashboardRow.screenshot(),
      contentType: 'image/png',
    });
  },
);
