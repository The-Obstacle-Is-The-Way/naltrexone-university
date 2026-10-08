import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';
import {
  SENTRY_DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
} from './sentry-data-collection';

// BUG-331: the browser records breadcrumbs, and the SDK serialises a console
// breadcrumb's logged values after `beforeBreadcrumb` runs. What leaves is
// proven through the real SDK's console integration and the browser's hooks
// (`sentry.client.config.ts`); the server sends no breadcrumbs at all. The
// transport keeps each envelope and sends nothing.
let sent: string[] = [];
// The server SDK's init sets process variables of its own.
const ORIGINAL_ENV = snapshotProcessEnv();

beforeAll(() => {
  Sentry.init({
    dsn: 'https://public@sentry.invalid/1',
    release: 'breadcrumb-test',
    tracesSampleRate: 0,
    dataCollection: SENTRY_DATA_COLLECTION,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    transport: () => ({
      send: async (envelope: unknown) => {
        sent.push(JSON.stringify(envelope));
        return {};
      },
      flush: async () => true,
    }),
  });
});

afterAll(async () => {
  await Sentry.close();
  restoreProcessEnv(ORIGINAL_ENV);
});

// Markers are made at run time: the Node SDK attaches the test's own source
// lines to the event as stack context, and those must not contain them.
const run = crypto.randomUUID();
const markers = {
  text: `${run}-text`,
  error: `${run}-error`,
  url: `${run}-url`,
  object: `${run}-object`,
  navigation: `${run}-navigation`,
};

class Checkout {
  returnUrl = `https://example.com/cb?code=${markers.object}`;
}

describe('browser breadcrumbs through the real SDK', () => {
  it('send no console line, whatever it logs, and a navigation with its credentials filtered', async () => {
    sent = [];

    console.warn(
      `retry=2 at /v1/client?__clerk_handshake=${markers.text}`,
      new Error(`redirect to /cb?code=${markers.error}`),
      new URL(`https://example.com/cb?code=${markers.url}`),
      new Checkout(),
    );
    Sentry.addBreadcrumb({
      category: 'navigation',
      data: { to: `/app?__clerk_handshake=${markers.navigation}&tab=1` },
    });
    Sentry.captureMessage('after a logged line');
    await Sentry.flush(2_000);

    const envelope = sent.join('\n');
    expect(envelope).toContain(
      '"to":"/app?__clerk_handshake=[Filtered]&tab=1"',
    );
    expect(envelope).not.toContain('"category":"console"');
    for (const marker of Object.values(markers)) {
      expect(envelope).not.toContain(marker);
    }
  });
});
