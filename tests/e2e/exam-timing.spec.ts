import { expect, type Request, test } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { selectChoiceByLabel } from './helpers/question';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

const EXAM_SECONDS = 72;
const CLOCK_SKEW_MS = 20_000;

test('a fast browser clock preserves the answer until server exam expiry', async ({
  page,
}) => {
  // One real question lasts 72 seconds. A long multi-step flow (the guide's
  // 180_000 tier): sign-in, the full exam, its expiry and finalization.
  test.setTimeout(180_000);
  await runE2EUserStateReset();
  await signInWithClerkPassword(page);
  await ensureSubscribed(page);
  // Playwright's clock replaces the page's Date and performance.now. Setting
  // it before the session page loads keeps both continuous on that page, 20
  // seconds fast, as on a machine whose clock runs ahead; a change mid-page
  // would restart performance.now.
  await page.clock.setSystemTime(Date.now() + CLOCK_SKEW_MS);
  await startSession(page, 'exam', 1);
  await selectChoiceByLabel(page, 'A');

  const timer = page.getByRole('timer', { name: 'Exam time remaining' });
  const remaining = timer.locator('[aria-hidden="true"]');
  const seconds = (value: string | null) => {
    const match = /^(\d+):(\d{2})$/.exec(value ?? '');
    if (!match) throw new Error('Expected a minute-and-second countdown');
    return Number(match[1]) * 60 + Number(match[2]);
  };
  // A countdown from the browser's clock would start 20 seconds short.
  const before = seconds(await remaining.textContent());
  expect(before).toBeGreaterThan(EXAM_SECONDS - CLOCK_SKEW_MS / 1_000);

  // A focus refresh goes through the real timing server action and must keep
  // both the server countdown and the selection. A failed request ends the
  // wait at once and names its error, rather than waiting out the test.
  const isTimingRequest = (request: Request) =>
    request.method() === 'POST' &&
    new URL(request.url()).pathname === new URL(page.url()).pathname;
  // Other server actions post to the same page, such as the draft save that
  // follows a selection; only the timing action's response carries
  // remainingMs.
  const refreshed = Promise.race([
    page.waitForResponse(
      async (response) =>
        isTimingRequest(response.request()) &&
        (await response.text()).includes('remainingMs'),
    ),
    page.waitForEvent('requestfailed', isTimingRequest).then((request) => {
      throw new Error(
        `The timing refresh failed: ${request.failure()?.errorText}`,
      );
    }),
  ]);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await refreshed).ok()).toBe(true);
  await expect(timer).toBeVisible();
  expect(before - seconds(await remaining.textContent())).toBeLessThan(10);
  await expect(page.getByRole('radio').first()).toBeChecked();

  // The summary appears only after the exam reaches the server's deadline and
  // the timer's flush finalizes it.
  await expect(
    page.getByRole('heading', { name: 'Session Summary' }),
  ).toBeVisible({ timeout: 90_000 });
  const answered = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText('Answered', { exact: true }) });
  await expect(answered).toHaveText('Answered1');
});
