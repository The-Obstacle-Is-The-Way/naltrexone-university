import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SENTRY_DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
} from './sentry-data-collection';

// DEBT-499 / BUG-318: what leaves the process is proven through the real
// SDK, from our onRequestError path to the transport, not by the setting's
// shape. The transport keeps each envelope and sends nothing. Each secret is
// generated at run time, so the source lines Sentry attaches to stack frames
// cannot contain it.
let sent: string[] = [];

const secret = {
  sessionCookie: randomUUID(),
  refreshCookie: randomUUID(),
  handshakeCookie: randomUUID(),
  cronBearer: randomUUID(),
  stripeSignature: randomUUID(),
  svixSignature: randomUUID(),
  handshakeParam: randomUUID(),
  devBrowserJwt: randomUUID(),
  prerenderBypass: randomUUID(),
  clientIp: '203.0.113.7',
};

beforeAll(() => {
  Sentry.init({
    dsn: 'https://public@sentry.invalid/1',
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

// Our onRequestError is Sentry.captureRequestError (instrumentation.ts).
async function reportRequestError() {
  sent = [];
  Sentry.addBreadcrumb({
    category: 'fetch',
    data: {
      url: `https://clerk.example/v1/client?__clerk_db_jwt=${secret.devBrowserJwt}`,
    },
  });
  await Sentry.captureRequestError(
    new Error('boom'),
    {
      path: `/app?__clerk_handshake=${secret.handshakeParam}&tab=questions`,
      method: 'POST',
      headers: {
        cookie: `__session=${secret.sessionCookie}; __refresh=${secret.refreshCookie}; __clerk_handshake=${secret.handshakeCookie}; __client_uat=1`,
        authorization: `Bearer ${secret.cronBearer}`,
        'stripe-signature': `t=1,v1=${secret.stripeSignature}`,
        'svix-signature': `v1,${secret.svixSignature}`,
        'x-clerk-clerk-url': `https://addictionboards.com/app?__clerk_handshake=${secret.handshakeParam}`,
        'x-forwarded-for': secret.clientIp,
        'x-prerender-revalidate': secret.prerenderBypass,
        referer: `https://addictionboards.com/?__clerk_handshake=${secret.handshakeParam}`,
        'user-agent': 'test-agent',
      },
    },
    { routerKind: 'App Router', routePath: '/app', routeType: 'render' },
  );
  await Sentry.flush(2000);
  return sent.join('\n');
}

describe('the real SDK with our Sentry settings', () => {
  it('sends an event for a request error', async () => {
    expect(await reportRequestError()).toContain('boom');
  });

  it.each(Object.keys(secret) as (keyof typeof secret)[])(
    'never sends the %s',
    async (name) => {
      expect(await reportRequestError()).not.toContain(secret[name]);
    },
  );

  it('turns off request body capture at the source', () => {
    expect(Sentry.getClient()?.getDataCollectionOptions().httpBodies).toEqual(
      [],
    );
  });
});
