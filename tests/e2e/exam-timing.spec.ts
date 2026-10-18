import { expect, test } from '@playwright/test';
import {
  E2E_CLERK_AUTH_STATE_PATH,
  signInWithClerkPassword,
} from './helpers/clerk-auth';
import { selectChoiceByLabel } from './helpers/question';
import { runE2EUserStateReset } from './helpers/reset-e2e-user-state';
import { startSession } from './helpers/session';
import { ensureSubscribed } from './helpers/subscription';

test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });

test('a fast browser clock preserves the answer until server exam expiry', async ({
  page,
}) => {
  // One real question lasts 72 seconds; this exercises the production timer,
  // read-only timing action and finalizer without replacing their clocks.
  test.setTimeout(150_000);
  await runE2EUserStateReset();
  await signInWithClerkPassword(page);
  await ensureSubscribed(page);
  await startSession(page, 'exam', 1);
  await selectChoiceByLabel(page, 'A');

  const timer = page.getByRole('timer', { name: 'Exam time remaining' });
  const remaining = timer.locator('[aria-hidden="true"]');
  const before = await remaining.textContent();
  await page.clock.setSystemTime(Date.now() + 20_000);
  // Visibility refresh goes through the real server action and must preserve
  // both the server countdown and the current selection.
  const refreshed = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === new URL(page.url()).pathname,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await refreshed).ok()).toBe(true);
  await expect(timer).toBeVisible();
  const after = await remaining.textContent();
  const seconds = (value: string | null) => {
    const match = /^(\d+):(\d{2})$/.exec(value ?? '');
    if (!match) throw new Error('Expected a minute-and-second countdown');
    return Number(match[1]) * 60 + Number(match[2]);
  };
  expect(seconds(before) - seconds(after)).toBeLessThan(10);
  await expect(page.getByRole('radio').first()).toBeChecked();

  await expect(
    page.getByRole('heading', { name: 'Session Summary' }),
  ).toBeVisible({ timeout: 90_000 });
  const answered = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText('Answered', { exact: true }) });
  await expect(answered).toHaveText('Answered1');
});
