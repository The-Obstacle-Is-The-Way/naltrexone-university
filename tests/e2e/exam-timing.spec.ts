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
// Quiet time before the return: CI's bursts of aborted server actions on a new
// session ended within 600 ms (BUG-337).
const QUIET_MS = 1_000;

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
  // that Next.js salts per build; the build's manifest names it. Every action
  // that fails on the practice pages is logged by name as BUG-337 evidence.
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
  // Every server action carries a Next-Action header. The test matches on it,
  // not on page.url(): a soft navigation updates page.url() after the new
  // page's first requests have started.
  const isServerAction = (request: Request) =>
    request.method() === 'POST' &&
    request.headers()['next-action'] !== undefined;
  const isTimingRequest = (request: Request) =>
    isServerAction(request) && actionOf(request) === TIMING_ACTION;
  // The return is signalled only once the page is quiet. In CI, a new
  // session's server actions are aborted in bursts that last under a second
  // (BUG-337), and a return read caught in one fails for a reason this test
  // isn't about. So the test keeps the page's server actions in flight, when
  // the last session-page action settled, and how many timing reads settled.
  // Server actions post to the page that calls them. Only the session page's
  // own actions keep it busy: a starter-page action has been seen in flight
  // more than 5 seconds after the session page loaded (BUG-337).
  let sessionPath: string | undefined;
  const onSessionPage = (request: Request) =>
    new URL(request.url()).pathname === sessionPath;
  const actionsInFlight = new Set<Request>();
  let lastActionSettledAt = Date.now();
  let timingReadsSettled = 0;
  let timingReadsSucceeded = 0;
  const settle = (request: Request) => {
    if (!actionsInFlight.delete(request)) return false;
    if (onSessionPage(request)) lastActionSettledAt = Date.now();
    return true;
  };
  // An action is tracked by the first request of its redirect chain: a 307
  // from Clerk's middleware finishes the first request and starts another,
  // and the action settles only when the chain's last request does.
  const rootOf = (request: Request) => {
    let root = request;
    for (let from = root.redirectedFrom(); from; from = from.redirectedFrom())
      root = from;
    return root;
  };
  // The listeners below run unawaited; a lookup that rejects because the
  // context has closed must not surface as an unhandled rejection.
  const responseOf = (request: Request) => request.response().catch(() => null);
  const isRedirect = async (request: Request) => {
    const status = (await responseOf(request))?.status() ?? 0;
    return status >= 300 && status < 400;
  };
  /** True when the request settled a timing read. */
  const settleAction = (request: Request) => {
    const root = rootOf(request);
    if (!settle(root) || actionOf(root) !== TIMING_ACTION) return false;
    timingReadsSettled += 1;
    return true;
  };
  page.on('request', (request) => {
    const root = rootOf(request);
    if (isServerAction(root)) actionsInFlight.add(root);
  });
  page.on('requestfinished', async (request) => {
    if (await isRedirect(request)) return;
    if (settleAction(request) && (await responseOf(request))?.ok())
      timingReadsSucceeded += 1;
  });
  page.on('requestfailed', (request) => {
    settleAction(request);
    const root = rootOf(request);
    if (
      isServerAction(root) &&
      new URL(root.url()).pathname.startsWith('/app/practice')
    )
      console.warn(
        `BUG-337 evidence: ${actionOf(root)} failed on a practice page: ${request.failure()?.errorText}`,
      );
  });

  // Playwright's clock replaces the page's Date and performance.now. Setting
  // it before the session page loads keeps both continuous on that page, 20
  // seconds fast, as on a machine whose clock runs ahead; a change mid-page
  // would restart performance.now.
  await page.clock.setSystemTime(Date.now() + CLOCK_SKEW_MS);
  await startSession(page, 'exam', 1);
  sessionPath = new URL(page.url()).pathname;
  lastActionSettledAt = Date.now();
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
  // BUG-337). The return is signalled once an activation read has settled
  // and no server action has been in flight for QUIET_MS. The return's read is
  // a timing read still in flight, which the timer would reuse, or else the
  // next one, followed through any redirect to its last request's
  // requestfinished or requestfailed: a response can arrive before its
  // request is aborted. A read that finishes must succeed.
  // A single failed read, at activation or on the return, doesn't fail the
  // test: the timer keeps its last server sample, and timing reads are aborted
  // for a reason not yet known (BUG-337), in 3 of 36 local runs on 2026-10-20
  // and 21; each is logged above as evidence. A timing action that never
  // works does fail it: the return must start a timing read, and at least one
  // timing read in the session must succeed. Both reads failed in one of
  // those runs, which also failed an unrelated test. The manifest name
  // identifies the request, so the test does not read its body: Chrome
  // can discard a server action's body before Playwright asks for it ("No
  // data found for resource"), and the controller's timing tests cover the
  // payload.
  // On a timeout, the poll's last value names what kept the page busy.
  const pageState = () => {
    const inFlight = [...actionsInFlight].filter(onSessionPage).map(actionOf);
    return timingReadsSettled > 0 &&
      inFlight.length === 0 &&
      Date.now() - lastActionSettledAt >= QUIET_MS
      ? 'quiet'
      : `timing reads settled: ${timingReadsSettled}; in flight: ${inFlight.join(', ') || 'none'}`;
  };
  await expect
    .poll(pageState, {
      message:
        'An activation timing read settles, and no server action is in flight for QUIET_MS',
    })
    .toBe('quiet');
  let returnRoot = [...actionsInFlight].find(isTimingRequest);
  const returnRead = new Promise<Request>((resolve) => {
    page.on('request', (request) => {
      const root = rootOf(request);
      if (!returnRoot && isTimingRequest(root)) returnRoot = root;
    });
    page.on('requestfinished', async (request) => {
      if (rootOf(request) === returnRoot && !(await isRedirect(request)))
        resolve(request);
    });
    page.on('requestfailed', (request) => {
      if (rootOf(request) === returnRoot) resolve(request);
    });
  });
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  );
  await expect
    .poll(() => returnRoot !== undefined, {
      message: 'The return starts a timing read',
    })
    .toBe(true);
  const read = await returnRead;
  if (read.failure() === null) expect((await read.response())?.ok()).toBe(true);
  await expect
    .poll(() => timingReadsSucceeded, {
      message: 'At least one timing read in the session succeeds',
    })
    .toBeGreaterThan(0);
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
