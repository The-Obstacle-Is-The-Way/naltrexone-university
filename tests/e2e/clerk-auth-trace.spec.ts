import { expect, test } from '@playwright/test';
import {
  reportFailedClerkAuthTrace,
  startClerkAuthTrace,
} from './helpers/clerk-auth-trace';

// Exercise the recorder against real Playwright events with local, controlled
// traffic. No Clerk call or token is needed for this diagnostic contract.
test('records an action redirect and failed fetch without credential values', async ({
  page,
}) => {
  const output: string[] = [];
  await startClerkAuthTrace(page, (text) => output.push(text));
  await page.route('**/trace-start', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><body></body></html>',
    }),
  );
  await page.route('**/trace-action*', (route) =>
    route.fulfill({
      status: 307,
      headers: {
        location:
          'http://127.0.0.2/trace-target?__clerk_db_jwt=location-secret',
        'x-clerk-auth-status': 'handshake',
        'x-clerk-auth-reason': 'dev-browser-missing',
      },
    }),
  );
  await page.route('http://127.0.0.2/**', (route) => route.abort('failed'));
  await page.goto('/trace-start');
  await page.evaluate(async () => {
    try {
      await fetch('/trace-action?__clerk_db_jwt=query-secret', {
        method: 'POST',
        headers: { 'Next-Action': 'action-secret' },
      });
    } catch {
      // The controlled transport failure exercises the same UI signal.
      const alert = document.createElement('div');
      alert.setAttribute('role', 'alert');
      alert.textContent = 'Failed to fetch';
      document.body.append(alert);
    }
  });
  await expect.poll(() => output.length).toBe(1);
  await reportFailedClerkAuthTrace(page);

  expect(output).toHaveLength(1);
  const report = output.join('\n');
  expect(report).toContain('requestfailed POST');
  expect(report).toContain('action=yes');
  expect(report).toContain('redirect-host=127.0.0.2');
  expect(report).toContain('reason=dev-browser-missing');
  expect(report).not.toMatch(/location-secret|query-secret|action-secret/);
});

test('reports a failed test without needing a sign-in navigation or an alert', async ({
  page,
}) => {
  const output: string[] = [];
  await startClerkAuthTrace(page, (text) => output.push(text));
  await reportFailedClerkAuthTrace(page);
  await reportFailedClerkAuthTrace(page);

  expect(output).toHaveLength(1);
  expect(output[0]).toContain('[E2E_CLERK_AUTH_TRACE] test failure:');
});
