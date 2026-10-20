import { readFileSync } from 'node:fs';
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
const TIMING_ACTION = 'getPracticeSessionTiming';

test('a fast browser clock preserves the answer until server exam expiry', async ({
  page,
}) => {
  // One real question lasts 72 seconds. A long multi-step flow (the guide's
  // 180_000 tier): sign-in, the full exam, its expiry and finalization.
  test.setTimeout(180_000);
  await runE2EUserStateReset();
  await signInWithClerkPassword(page);
  await ensureSubscribed(page);
  // A server action posts to the page that calls it, with a Next-Action ID
  // that Next.js salts per build; the build's manifest names it. Only the
  // timing action's failure fails this test; every action that fails on the
  // practice pages is logged by name as BUG-337 evidence.
  const manifest = JSON.parse(
    readFileSync('.next/server/server-reference-manifest.json', 'utf8'),
  ) as { node: Record<string, { exportedName: string }> };
  expect(
    Object.values(manifest.node).map((entry) => entry.exportedName),
  ).toContain(TIMING_ACTION);
  const actionOf = (request: Request) => {
    const id = request.headers()['next-action'] ?? 'no action';
    return manifest.node[id]?.exportedName ?? id;
  };
  const isPagePost = (request: Request) =>
    request.method() === 'POST' &&
    new URL(request.url()).pathname === new URL(page.url()).pathname;
  const isTimingRequest = (request: Request) =>
    isPagePost(request) && actionOf(request) === TIMING_ACTION;
  let timingAnswers = 0;
  page.on('response', (response) => {
    if (isTimingRequest(response.request())) timingAnswers += 1;
  });
  page.on('requestfailed', (request) => {
    if (isPagePost(request))
      console.warn(
        `BUG-337 evidence: ${actionOf(request)} failed on a practice page: ${request.failure()?.errorText}`,
      );
  });

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

  // A return to the tab refreshes timing through the real server action and
  // must keep both the server countdown and the selection. The test signals
  // the return with visibilitychange, which the timer also handles, not a
  // window focus: on Clerk's development instance a focus also touches the
  // session, and its cookie rewrites can abort a concurrent request (BUG-333,
  // BUG-337). Once the timer's activation refresh has answered, the return
  // starts a request of its own; if that request fails, the wait ends at once
  // and names the error.
  await expect
    .poll(() => timingAnswers, {
      message: 'The timer refreshes its timing on activation',
    })
    .toBeGreaterThan(0);
  const refreshed = Promise.race([
    page.waitForResponse((response) => isTimingRequest(response.request())),
    page.waitForEvent('requestfailed', isTimingRequest).then((request) => {
      throw new Error(
        `The timing refresh failed: ${request.failure()?.errorText}`,
      );
    }),
  ]);
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  const response = await refreshed;
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('remainingMs');
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
