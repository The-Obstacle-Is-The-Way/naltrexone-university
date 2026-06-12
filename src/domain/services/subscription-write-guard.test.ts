import { describe, expect, it } from 'vitest';
import type { SubscriptionStatus } from '../value-objects';
import {
  type SubscriptionWriteCandidate,
  shouldPersistSubscriptionWrite,
} from './subscription-write-guard';

const NOW = new Date('2026-06-12T12:00:00.000Z');
const FUTURE = new Date('2026-07-12T12:00:00.000Z');
const PAST = new Date('2026-05-12T12:00:00.000Z');

function candidate(
  overrides: Partial<SubscriptionWriteCandidate> = {},
): SubscriptionWriteCandidate {
  return {
    subscriptionIdentity: 'sub_current',
    status: 'active',
    currentPeriodEnd: FUTURE,
    ...overrides,
  };
}

describe('shouldPersistSubscriptionWrite', () => {
  it.each([
    {
      name: 'allows the first subscription row',
      stored: null,
      incoming: candidate({
        subscriptionIdentity: 'sub_first',
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      expected: true,
    },
    {
      name: 'allows same-subscription terminal lifecycle transitions',
      stored: candidate({ subscriptionIdentity: 'sub_current' }),
      incoming: candidate({
        subscriptionIdentity: 'sub_current',
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      expected: true,
    },
    {
      name: 'rejects a superseded canceled subscription over a current active row',
      stored: candidate({ status: 'active' }),
      incoming: candidate({
        subscriptionIdentity: 'sub_superseded',
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      expected: false,
    },
    {
      name: 'rejects a superseded incomplete_expired subscription over a current trial row',
      stored: candidate({ status: 'inTrial' }),
      incoming: candidate({
        subscriptionIdentity: 'sub_superseded',
        status: 'paymentFailed',
        currentPeriodEnd: PAST,
      }),
      expected: false,
    },
    {
      name: 'rejects a superseded terminal subscription over a current past-due grace row',
      stored: candidate({ status: 'pastDue' }),
      incoming: candidate({
        subscriptionIdentity: 'sub_superseded',
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      expected: false,
    },
    {
      name: 'allows terminal writes when the stored entitled period has ended',
      stored: candidate({ status: 'active', currentPeriodEnd: PAST }),
      incoming: candidate({
        subscriptionIdentity: 'sub_superseded',
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      expected: true,
    },
    {
      name: 'allows churned resubscribe over a canceled row',
      stored: candidate({ status: 'canceled', currentPeriodEnd: PAST }),
      incoming: candidate({
        subscriptionIdentity: 'sub_resubscribe',
        status: 'active',
        currentPeriodEnd: FUTURE,
      }),
      expected: true,
    },
    {
      name: 'allows reconcile to replace the row with a different blocking canonical winner',
      stored: candidate({ status: 'active' }),
      incoming: candidate({
        subscriptionIdentity: 'sub_canonical',
        status: 'active',
        currentPeriodEnd: FUTURE,
      }),
      expected: true,
    },
    {
      name: 'allows unpaid rows because they are recoverable rather than terminal',
      stored: candidate({ status: 'unpaid' }),
      incoming: candidate({
        subscriptionIdentity: 'sub_superseded',
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      expected: true,
    },
    {
      name: 'allows paused rows because they are recoverable rather than terminal',
      stored: candidate({ status: 'paused' }),
      incoming: candidate({
        subscriptionIdentity: 'sub_superseded',
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      expected: true,
    },
  ])('$name', ({ stored, incoming, expected }) => {
    expect(shouldPersistSubscriptionWrite({ stored, incoming, now: NOW })).toBe(
      expected,
    );
  });

  it.each<SubscriptionStatus>([
    'paymentProcessing',
    'unpaid',
    'paused',
  ])('allows a different %s write so recoverable canonical subscriptions can persist', (status) => {
    expect(
      shouldPersistSubscriptionWrite({
        stored: candidate({ status: 'active' }),
        incoming: candidate({
          subscriptionIdentity: 'sub_recoverable',
          status,
          currentPeriodEnd: FUTURE,
        }),
        now: NOW,
      }),
    ).toBe(true);
  });
});
