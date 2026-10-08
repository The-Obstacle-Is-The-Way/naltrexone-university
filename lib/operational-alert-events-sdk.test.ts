import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sendOperationalAlertEvent } from '@/src/adapters/shared/operational-alert-events';
import { SENTRY_SERVER_SETTINGS } from './sentry-data-collection';

// DEBT-505: what leaves the process is proven through the real SDK and our
// production settings. The transport keeps each envelope and sends nothing.
let sent: string[] = [];
let transportFlushes = true;

beforeAll(() => {
  Sentry.init({
    dsn: 'https://public@sentry.invalid/1',
    ...SENTRY_SERVER_SETTINGS,
    transport: () => ({
      send: async (envelope: unknown) => {
        sent.push(JSON.stringify(envelope));
        return {};
      },
      flush: async () => transportFlushes,
    }),
  });
});

afterAll(async () => {
  await Sentry.close();
});

function sentEvents(): Array<Record<string, unknown>> {
  return sent.flatMap((envelope) => {
    const [, items] = JSON.parse(envelope) as [
      unknown,
      Array<[{ type: string }, Record<string, unknown>]>,
    ];
    return items
      .filter(([header]) => header.type === 'event')
      .map(([, payload]) => payload);
  });
}

// Everything a request scope can hold, as an alert raised inside a request
// would inherit it: the request itself, a user, extra data, tags, a Next.js
// context, and console and HTTP breadcrumbs. Each value is a marker.
const inherited = {
  nonce: 'NONCE-MARKER',
  sessionCookie: 'SESSION-MARKER',
  clerkUser: 'user_MARKER',
  stripeCustomer: 'cus_MARKER',
  appUser: 'APP-USER-MARKER',
};

function fillRequestScope(scope: Sentry.Scope) {
  scope.setSDKProcessingMetadata({
    normalizedRequest: {
      url: `https://example.com/pricing?__clerk_handshake_nonce=${inherited.nonce}`,
      method: 'GET',
      headers: {
        cookie: `__session=${inherited.sessionCookie}`,
        'user-agent': 'test-agent',
      },
    },
  });
  scope.setUser({ id: inherited.clerkUser });
  scope.setExtra('userId', inherited.appUser);
  scope.setTag('route', `/pricing?nonce=${inherited.nonce}`);
  scope.setContext('nextjs', { request_path: `/pricing/${inherited.appUser}` });
  scope.addBreadcrumb({
    category: 'console',
    level: 'error',
    message: `Checkout sync failed for ${inherited.appUser}`,
  });
  scope.addBreadcrumb({
    category: 'http',
    type: 'http',
    data: {
      url: `https://api.stripe.com/v1/subscriptions?customer=${inherited.stripeCustomer}`,
      'url.query': `nonce=${inherited.nonce}`,
    },
  });
}

describe('sendOperationalAlertEvent', () => {
  it('sends the fixed fields only, whatever the surrounding request scope holds', async () => {
    sent = [];

    await Sentry.withIsolationScope(async (scope) => {
      fillRequestScope(scope);
      await sendOperationalAlertEvent({
        kind: 'checkout_stripe_holds_unrecorded',
        count: 1,
        sharedCooldown: 'held',
        window: '2026-10-08T00:00:00.000Z',
      });
    });

    const [event] = sentEvents();
    expect(event).toBeDefined();
    for (const field of ['breadcrumbs', 'request', 'user', 'extra']) {
      expect(event).not.toHaveProperty(field);
    }
    expect(Object.keys(event?.contexts ?? {})).toEqual(['alert']);
    expect(
      Object.keys(event?.tags ?? {}).every((tag) => tag.startsWith('alert.')),
    ).toBe(true);
    const envelope = sent.join('\n');
    for (const marker of Object.values(inherited)) {
      expect(envelope).not.toContain(marker);
    }
  });

  // A fingerprint set on the scope goes ahead of the alert's own, and a
  // scope's attachments travel beside the event.
  it('keeps an alert to its fixed fields when the scope sets a fingerprint or an attachment', async () => {
    sent = [];

    await Sentry.withIsolationScope(async (scope) => {
      fillRequestScope(scope);
      scope.setFingerprint(['{{ default }}']);
      scope.addAttachment({ filename: 'notes.txt', data: inherited.appUser });
      await sendOperationalAlertEvent({
        kind: 'checkout_stripe_holds_unrecorded',
        count: 1,
        sharedCooldown: 'held',
        window: '2026-10-08T00:00:00.000Z',
      });
    });

    const [event] = sentEvents();
    expect(event?.fingerprint).toEqual([
      'operational-alert',
      'checkout_stripe_holds_unrecorded',
      '2026-10-08T00:00:00.000Z',
    ]);
    expect(event).not.toHaveProperty('user');
    const envelope = sent.join('\n');
    expect(envelope).not.toContain('"type":"attachment"');
    for (const marker of Object.values(inherited)) {
      expect(envelope).not.toContain(marker);
    }
  });

  it('rejects when Sentry does not confirm the event, so the loss is logged', async () => {
    transportFlushes = false;
    try {
      await expect(
        sendOperationalAlertEvent({
          kind: 'renewal_notice_outcome_unknown',
          count: 1,
          sharedCooldown: 'held',
          window: '2026-10-08T00:00:00.000Z',
        }),
      ).rejects.toThrow('Sentry did not confirm the operational alert');
    } finally {
      transportFlushes = true;
    }
  });

  it('sends one error-level event with fixed tags and the count, and flushes it before resolving', async () => {
    sent = [];

    await sendOperationalAlertEvent({
      kind: 'renewal_notice_deadline_missed',
      count: 3,
      sharedCooldown: 'held',
      window: '2026-10-08T00:00:00.000Z',
    });

    const events = sentEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: 'error',
      message: 'Operational alert: renewal_notice_deadline_missed',
      fingerprint: [
        'operational-alert',
        'renewal_notice_deadline_missed',
        '2026-10-08T00:00:00.000Z',
      ],
      tags: {
        'alert.kind': 'renewal_notice_deadline_missed',
        'alert.shared_cooldown': 'held',
        'alert.window': '2026-10-08T00:00:00.000Z',
      },
      contexts: expect.objectContaining({ alert: { count: 3 } }),
    });
    expect(events[0]).not.toHaveProperty('user');
    expect(events[0]).not.toHaveProperty('extra');
  });

  // Sentry emails on a new issue, not on a later event in one still open. A
  // new issue per kind and cooldown window makes every episode notify.
  it('opens a new issue for each kind and cooldown window, whatever the cooldown tag', async () => {
    sent = [];

    await sendOperationalAlertEvent({
      kind: 'clerk_backend_call_limiter_failed',
      count: 1,
      sharedCooldown: 'unavailable',
      window: '2026-10-08T00:00:00.000Z',
    });
    await sendOperationalAlertEvent({
      kind: 'clerk_backend_call_limiter_failed',
      count: 1,
      sharedCooldown: 'unavailable',
      window: '2026-10-08T06:00:00.000Z',
    });

    expect(sentEvents().map((event) => event.fingerprint)).toEqual([
      [
        'operational-alert',
        'clerk_backend_call_limiter_failed',
        '2026-10-08T00:00:00.000Z',
      ],
      [
        'operational-alert',
        'clerk_backend_call_limiter_failed',
        '2026-10-08T06:00:00.000Z',
      ],
    ]);
    expect(sentEvents()[0]).toMatchObject({
      tags: { 'alert.shared_cooldown': 'unavailable' },
    });
  });
});

// Last, since it closes the client: with Sentry off nothing can be sent.
describe('sendOperationalAlertEvent without Sentry', () => {
  it('rejects, so the loss is logged', async () => {
    await Sentry.close();

    await expect(
      sendOperationalAlertEvent({
        kind: 'renewal_notice_outcome_unknown',
        count: 1,
        sharedCooldown: 'held',
        window: '2026-10-08T00:00:00.000Z',
      }),
    ).rejects.toThrow('Sentry is not enabled');
  });
});
