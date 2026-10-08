import { randomUUID } from 'node:crypto';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as Sentry from '@sentry/nextjs';
import { BaseServerSpan } from 'next/dist/server/lib/trace/constants';
import { getTracer, SpanKind } from 'next/dist/server/lib/trace/tracer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';
import { SENTRY_SERVER_SETTINGS } from './sentry-data-collection';

// DEBT-499 / BUG-318 / BUG-331: what leaves the process is proven through the
// real SDK with the server's own settings, from our onRequestError path to the
// transport, not by the setting's shape. Every trace is sampled here, so each
// request's spans are seen. The transport keeps each envelope and sends
// nothing. Each secret is generated at run time, so the source lines Sentry
// attaches to stack frames cannot contain it.
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

const ORIGINAL_ENV = snapshotProcessEnv();

beforeAll(() => {
  // The SDK reads its trace lifecycle from the environment; in 'static' mode
  // it would ignore beforeSendSpan. The settings pin 'stream'.
  process.env.SENTRY_TRACE_LIFECYCLE = 'static';
  Sentry.init({
    dsn: 'https://public@sentry.invalid/1',
    environment: 'production',
    // As on CI and Vercel, where a release turns on release-health sessions.
    release: 'sentry-data-collection-test',
    ...SENTRY_SERVER_SETTINGS,
    tracesSampleRate: 1,
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

type EnvelopeItem = [{ type: string }, Record<string, unknown>];

function sentItems(type: string): Array<Record<string, unknown>> {
  return sent.flatMap((envelope) => {
    const [, items] = JSON.parse(envelope) as [unknown, EnvelopeItem[]];
    return items
      .filter(([header]) => header.type === type)
      .map(([, payload]) => payload);
  });
}

const servers: http.Server[] = [];

async function listen(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterAll(() => {
  for (const server of servers) {
    server.closeAllConnections();
    server.close();
  }
});

// BUG-331: a server breadcrumb can hold Clerk's handshake nonce, a logged
// value, or, if it lands on the shared scope, another visitor's request.
const recorded = {
  outgoingNonce: randomUUID(),
  loggedValue: randomUUID(),
  requestNonce: randomUUID(),
  oauthCode: randomUUID(),
  handshake: randomUUID(),
};

describe('a server error raised after outgoing calls and recorded steps', () => {
  it('carries no breadcrumbs', async () => {
    const upstream = await listen((_, response) => response.end('{}'));
    sent = [];
    await fetch(
      `${upstream}/v1/clients/handshake_payload?nonce=${recorded.outgoingNonce}`,
    );
    Sentry.addBreadcrumb({
      category: 'auth',
      message: `Session check for ${recorded.loggedValue}`,
    });
    // A scope's own addBreadcrumb ignores maxBreadcrumbs.
    Sentry.getIsolationScope().addBreadcrumb({
      category: 'checkout',
      message: `Checkout sync failed for ${recorded.loggedValue}`,
    });
    Sentry.captureException(new Error('server boom'));
    await Sentry.flush(2000);

    const events = sentItems('event');
    expect(events).toEqual([
      expect.objectContaining({ exception: expect.anything() }),
    ]);
    expect(events[0]?.breadcrumbs ?? []).toEqual([]);
    expect(JSON.stringify(events)).not.toContain(recorded.outgoingNonce);
    expect(JSON.stringify(events)).not.toContain(recorded.loggedValue);
  });
});

describe('a sampled request', () => {
  // Next.js opens each request's server span and keeps the raw URL in
  // `http.target`; Sentry's own incoming-request span is off in @sentry/nextjs.
  it('sends its spans, Next.js request span and outgoing call alike, without a credential parameter', async () => {
    const upstreamHeaders: http.IncomingHttpHeaders[] = [];
    const upstream = await listen((request, response) => {
      upstreamHeaders.push(request.headers);
      response.end('{}');
    });
    sent = [];
    await getTracer().trace(
      BaseServerSpan.handleRequest,
      {
        spanName: 'GET /pricing',
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': 'GET',
          'http.target': `/pricing?__clerk_handshake=${recorded.handshake}&nonce=${recorded.requestNonce}&code=${recorded.oauthCode}&plan=annual`,
        },
      },
      async () => {
        await fetch(
          `${upstream}/v1/clients/handshake_payload?nonce=${recorded.outgoingNonce}&limit=1`,
        );
      },
    );

    // Both spans arrive, so the filtering below is not vacuous.
    await vi.waitFor(
      async () => {
        await Sentry.flush(500);
        const spans = JSON.stringify(sentItems('span'));
        expect(spans).toContain('plan=annual');
        expect(spans).toContain('limit=1');
      },
      { timeout: 5_000 },
    );
    const spans = JSON.stringify(sentItems('span'));
    for (const value of [
      recorded.handshake,
      recorded.requestNonce,
      recorded.oauthCode,
      recorded.outgoingNonce,
    ]) {
      expect(spans).not.toContain(value);
    }
    // Stripe and Clerk get no trace headers: they carried this project's key
    // and the request's name.
    expect(upstreamHeaders).toHaveLength(1);
    expect(upstreamHeaders[0]).not.toHaveProperty('sentry-trace');
    expect(upstreamHeaders[0]).not.toHaveProperty('baggage');
  });

  // Next.js answers a malformed request with its error page, and
  // @sentry/nextjs then names the request span after the raw URL. The
  // envelope's trace header copies that name, out of beforeSendSpan's reach.
  it("sends a request that fell back to Next's error page with no credential in any header", async () => {
    sent = [];
    await getTracer().trace(
      BaseServerSpan.handleRequest,
      {
        spanName: 'GET /_error',
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': 'GET',
          'http.target': `/pricing?__clerk_handshake=${recorded.handshake}&nonce=${recorded.requestNonce}&plan=annual`,
          'next.route': '/_error',
        },
      },
      async () => {},
    );

    await vi.waitFor(
      async () => {
        await Sentry.flush(500);
        expect(JSON.stringify(sentItems('span'))).toContain('plan=annual');
      },
      { timeout: 5_000 },
    );
    const everything = sent.join('\n');
    expect(everything).not.toContain(recorded.handshake);
    expect(everything).not.toContain(recorded.requestNonce);
  });
});
