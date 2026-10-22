import * as Sentry from '@sentry/nextjs';
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { SENTRY_CLIENT_SETTINGS } from '@/lib/sentry-data-collection';
import { STALE_ACTION_RELOAD_KEY } from '@/lib/stale-server-action';
import { ErrorBoundaryPage } from './error-boundary-page';

// BUG-319: an error page reports a stale action's error, then reloads the
// page. Only a keepalive request started before the reload can arrive, so the
// order is proven through the real browser SDK and its fetch transport, with
// the browser's own settings. The fetch records each request and sends nothing.
const order: string[] = [];
const requests: { body: string; keepalive: boolean | undefined }[] = [];

const recordingFetch: typeof fetch = async (_url, init) => {
  order.push('request');
  requests.push({
    body:
      init?.body instanceof Uint8Array
        ? new TextDecoder().decode(init.body)
        : String(init?.body),
    keepalive: init?.keepalive,
  });
  return new Response(null, { status: 200 });
};

beforeAll(() => {
  // The boundary logs every caught error; keep test output quiet. Stubbed
  // before init, so the SDK's console breadcrumb still wraps it.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  Sentry.init({
    dsn: 'https://public@sentry.invalid/1',
    environment: 'production',
    ...SENTRY_CLIENT_SETTINGS,
    transport: (options: Parameters<typeof Sentry.makeFetchTransport>[0]) =>
      Sentry.makeFetchTransport(options, recordingFetch),
  });
});

afterAll(async () => {
  await Sentry.close();
});

beforeEach(() => {
  window.sessionStorage.removeItem(STALE_ACTION_RELOAD_KEY);
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
  expect(requests[0]).toMatchObject({ keepalive: true });
  expect(requests[0]?.body).toContain('UnrecognizedActionError');
});
