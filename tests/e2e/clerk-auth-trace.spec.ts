import { createServer } from 'node:http';
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
  // Serve the redirect over HTTP. Chromium aborts the intercepted 307 from
  // route.fulfill() before it exposes a redirect response to Playwright.
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/trace-action')) {
      response.writeHead(307, {
        location:
          'http://127.0.0.2/trace-target?__clerk_db_jwt=location-secret',
        'x-clerk-auth-status': 'handshake',
        'x-clerk-auth-reason': 'dev-browser-missing',
      });
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html><body></body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected the local HTTP fixture to have a TCP port');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await page.route('http://127.0.0.2/**', (route) => route.abort('failed'));
    await page.goto(`${origin}/trace-start`);
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

    await page.goto(`${origin}/sign-in/trace`);
    await expect.poll(() => output.length).toBe(2);
    expect(output[1]).toContain('[E2E_CLERK_AUTH_TRACE] sign-in:');
    expect(output[1]).toContain('/sign-in/trace 200');
    await reportFailedClerkAuthTrace(page);
    expect(output).toHaveLength(2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
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
