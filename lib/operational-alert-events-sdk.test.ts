import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sendOperationalAlertEvent } from '@/src/adapters/shared/operational-alert-events';
import {
  SENTRY_DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
} from './sentry-data-collection';

// DEBT-505: what leaves the process is proven through the real SDK and our
// production settings. The transport keeps each envelope and sends nothing.
let sent: string[] = [];

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

describe('sendOperationalAlertEvent', () => {
  it('sends one error-level event with fixed tags and the count, and flushes it before resolving', async () => {
    sent = [];

    await sendOperationalAlertEvent({
      kind: 'renewal_notice_deadline_missed',
      count: 3,
      sharedCooldown: 'held',
    });

    const events = sentEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: 'error',
      message: 'Operational alert: renewal_notice_deadline_missed',
      fingerprint: ['operational-alert', 'renewal_notice_deadline_missed'],
      tags: {
        'alert.kind': 'renewal_notice_deadline_missed',
        'alert.shared_cooldown': 'held',
      },
      contexts: expect.objectContaining({ alert: { count: 3 } }),
    });
    expect(events[0]).not.toHaveProperty('user');
    expect(events[0]).not.toHaveProperty('extra');
  });

  it('groups each kind as its own issue, whatever the cooldown tag', async () => {
    sent = [];

    await sendOperationalAlertEvent({
      kind: 'clerk_backend_call_limiter_failed',
      count: 1,
      sharedCooldown: 'unavailable',
    });

    expect(sentEvents()[0]).toMatchObject({
      fingerprint: ['operational-alert', 'clerk_backend_call_limiter_failed'],
      tags: { 'alert.shared_cooldown': 'unavailable' },
    });
  });
});
