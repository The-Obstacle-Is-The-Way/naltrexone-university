import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SENTRY_DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
} from './sentry-data-collection';

// BUG-331: the browser keeps console breadcrumbs, and the SDK serialises a
// breadcrumb's logged values after `beforeBreadcrumb` runs. What leaves is
// proven through the real SDK's console integration and the browser's hooks
// (`sentry.client.config.ts`); the server sends no breadcrumbs at all. The
// transport keeps each envelope and sends nothing.
let sent: string[] = [];

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
});

// Markers are made at run time: the Node SDK attaches the test's own source
// lines to the event as stack context, and those must not contain them.
const run = crypto.randomUUID();
const markers = {
  error: `${run}-error`,
  url: `${run}-url`,
  object: `${run}-object`,
};

class Checkout {
  returnUrl = `https://example.com/cb?code=${markers.object}`;
}

describe('browser console breadcrumbs through the real SDK', () => {
  it('send a logged error, URL or object without its credentials', async () => {
    sent = [];

    console.warn(
      new Error(`redirect to /cb?code=${markers.error}`),
      new URL(`https://example.com/cb?code=${markers.url}`),
      new Checkout(),
    );
    Sentry.captureMessage('after a logged line');
    await Sentry.flush(2_000);

    const envelope = sent.join('\n');
    expect(envelope).toContain('"category":"console"');
    for (const marker of Object.values(markers)) {
      expect(envelope).not.toContain(marker);
    }
  });
});
