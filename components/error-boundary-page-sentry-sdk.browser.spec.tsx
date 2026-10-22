import * as Sentry from '@sentry/nextjs';
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { SENTRY_CLIENT_SETTINGS } from '@/lib/sentry-data-collection';
import { STALE_ACTION_RELOAD_KEY } from '@/lib/stale-server-action';
import { ErrorBoundaryPage } from './error-boundary-page';

// BUG-319: an error page reports a stale action's error, then reloads the
// page. Only a request the transport started before the reload can arrive, so
// the order is proven through the real browser SDK with the browser's own
// settings. The transport records each request and sends nothing.
const order: string[] = [];
const sent: string[] = [];

beforeAll(() => {
  Sentry.init({
    dsn: 'https://public@sentry.invalid/1',
    environment: 'production',
    ...SENTRY_CLIENT_SETTINGS,
    transport: (options: Parameters<typeof Sentry.createTransport>[0]) =>
      Sentry.createTransport(options, async (request) => {
        order.push('request');
        sent.push(
          typeof request.body === 'string'
            ? request.body
            : new TextDecoder().decode(request.body),
        );
        return { statusCode: 200 };
      }),
  });
});

afterAll(async () => {
  await Sentry.close();
});

beforeEach(() => {
  window.sessionStorage.removeItem(STALE_ACTION_RELOAD_KEY);
  // The boundary logs every caught error; keep test output quiet.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

it("starts sending a stale action's error to Sentry before it reloads the page", async () => {
  await render(
    <ErrorBoundaryPage
      error={
        new UnrecognizedActionError(
          'Server Action "abc" was not found on the server.',
        )
      }
      retry={() => undefined}
      title="Something went wrong"
      description="Please try again."
      links={[]}
      reloadPage={() => order.push('reload')}
    />,
  );

  await expect.poll(() => order).toContain('reload');
  expect(order).toEqual(['request', 'reload']);
  expect(sent[0]).toContain('UnrecognizedActionError');
});
