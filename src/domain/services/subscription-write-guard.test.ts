import { describe, expect, it } from 'vitest';
import { createSubscriptionWriteCandidate } from '../test-helpers';
import type { SubscriptionStatus } from '../value-objects';
import { shouldPersistSubscriptionWrite } from './subscription-write-guard';

const NOW = new Date('2026-06-12T12:00:00.000Z');
const FUTURE = new Date('2026-07-12T12:00:00.000Z');
const PAST = new Date('2026-05-12T12:00:00.000Z');

describe('shouldPersistSubscriptionWrite', () => {
  it.each([
    {
      name: 'allows the first subscription row',
      stored: null,
      incoming: createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_first',
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      expected: true,
    },
    {
      name: 'allows same-subscription terminal lifecycle transitions',
      stored: createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_current',
        currentPeriodEnd: FUTURE,
      }),
      incoming: createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_current',
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      expected: true,
    },
    {
      name: 'rejects a superseded canceled subscription over a current active row',
      stored: createSubscriptionWriteCandidate({
        status: 'active',
        currentPeriodEnd: FUTURE,
      }),
      incoming: createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_superseded',
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      expected: false,
    },
    {
      name: 'rejects a superseded incomplete_expired subscription over a current trial row',
      stored: createSubscriptionWriteCandidate({
        status: 'inTrial',
        currentPeriodEnd: FUTURE,
      }),
      incoming: createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_superseded',
        status: 'paymentFailed',
        currentPeriodEnd: PAST,
      }),
      expected: false,
    },
    {
      name: 'rejects a superseded terminal subscription over a current past-due grace row',
      stored: createSubscriptionWriteCandidate({
        status: 'pastDue',
        currentPeriodEnd: FUTURE,
      }),
      incoming: createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_superseded',
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      expected: false,
    },
    {
      name: 'allows terminal writes when the stored entitled period has ended',
      stored: createSubscriptionWriteCandidate({
        status: 'active',
        currentPeriodEnd: PAST,
      }),
      incoming: createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_superseded',
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      expected: true,
    },
    {
      // The stored period is over at the instant it ends, so a row ending
      // exactly now no longer blocks even a weaker replacement.
      name: 'treats a stored period that ends exactly now as ended',
      stored: createSubscriptionWriteCandidate({
        status: 'active',
        currentPeriodEnd: NOW,
      }),
      incoming: createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_replacement',
        status: 'active',
        currentPeriodEnd: PAST,
      }),
      expected: true,
    },
    {
      name: 'allows churned resubscribe over a canceled row',
      stored: createSubscriptionWriteCandidate({
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      incoming: createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_resubscribe',
        status: 'active',
        currentPeriodEnd: FUTURE,
      }),
      expected: true,
    },
    {
      name: 'allows reconcile to replace the row with a different blocking canonical winner',
      stored: createSubscriptionWriteCandidate({
        status: 'active',
        currentPeriodEnd: FUTURE,
      }),
      incoming: createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_canonical',
        status: 'active',
        currentPeriodEnd: FUTURE,
      }),
      expected: true,
    },
    {
      name: 'allows unpaid rows because they are recoverable rather than terminal',
      stored: createSubscriptionWriteCandidate({
        status: 'unpaid',
        currentPeriodEnd: FUTURE,
      }),
      incoming: createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_superseded',
        status: 'canceled',
        currentPeriodEnd: PAST,
      }),
      expected: true,
    },
    {
      name: 'allows paused rows because they are recoverable rather than terminal',
      stored: createSubscriptionWriteCandidate({
        status: 'paused',
        currentPeriodEnd: FUTURE,
      }),
      incoming: createSubscriptionWriteCandidate({
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

  it.each<SubscriptionStatus>(['paymentProcessing', 'unpaid', 'paused'])(
    'rejects a different %s write over a current entitled row',
    (status) => {
      expect(
        shouldPersistSubscriptionWrite({
          stored: createSubscriptionWriteCandidate({
            status: 'active',
            currentPeriodEnd: FUTURE,
          }),
          incoming: createSubscriptionWriteCandidate({
            subscriptionIdentity: 'sub_recoverable',
            status,
            currentPeriodEnd: FUTURE,
          }),
          now: NOW,
        }),
      ).toBe(false);
    },
  );

  it.each<SubscriptionStatus>(['active', 'inTrial', 'pastDue'])(
    'allows a different current-entitled %s canonical winner',
    (status) => {
      expect(
        shouldPersistSubscriptionWrite({
          stored: createSubscriptionWriteCandidate({
            status: 'active',
            currentPeriodEnd: FUTURE,
          }),
          incoming: createSubscriptionWriteCandidate({
            subscriptionIdentity: 'sub_canonical',
            status,
            currentPeriodEnd: FUTURE,
          }),
          now: NOW,
        }),
      ).toBe(true);
    },
  );

  // #1160 review: distinct identities that compare equal under the locale
  // (NFC and NFD spellings) still order strictly, so exactly one direction of
  // the write persists and the guard's `< 0` has no equal case to decide.
  it.each([
    { stored: 'sub_\u00e9', incoming: 'sub_e\u0301', persists: true },
    { stored: 'sub_e\u0301', incoming: 'sub_\u00e9', persists: false },
  ])(
    'orders locale-equal identities strictly: $incoming over $stored persists=$persists',
    ({ stored, incoming, persists }) => {
      expect(
        shouldPersistSubscriptionWrite({
          stored: createSubscriptionWriteCandidate({
            subscriptionIdentity: stored,
            status: 'active',
            currentPeriodEnd: FUTURE,
          }),
          incoming: createSubscriptionWriteCandidate({
            subscriptionIdentity: incoming,
            status: 'active',
            currentPeriodEnd: FUTURE,
          }),
          now: NOW,
        }),
      ).toBe(persists);
    },
  );

  it('rejects a different current-entitled write that loses canonical ordering', () => {
    expect(
      shouldPersistSubscriptionWrite({
        stored: createSubscriptionWriteCandidate({
          subscriptionIdentity: 'sub_current',
          status: 'active',
          currentPeriodEnd: FUTURE,
        }),
        incoming: createSubscriptionWriteCandidate({
          subscriptionIdentity: 'sub_shorter',
          status: 'active',
          currentPeriodEnd: new Date('2026-06-20T12:00:00.000Z'),
        }),
        now: NOW,
      }),
    ).toBe(false);
  });

  it.each<SubscriptionStatus>(['paymentProcessing', 'unpaid', 'paused'])(
    'allows same-subscription %s lifecycle updates',
    (status) => {
      expect(
        shouldPersistSubscriptionWrite({
          stored: createSubscriptionWriteCandidate({
            subscriptionIdentity: 'sub_current',
            status: 'active',
            currentPeriodEnd: FUTURE,
          }),
          incoming: createSubscriptionWriteCandidate({
            subscriptionIdentity: 'sub_current',
            status,
            currentPeriodEnd: FUTURE,
          }),
          now: NOW,
        }),
      ).toBe(true);
    },
  );

  it('allows a different unpaid write when the stored active period has expired', () => {
    expect(
      shouldPersistSubscriptionWrite({
        stored: createSubscriptionWriteCandidate({
          status: 'active',
          currentPeriodEnd: PAST,
        }),
        incoming: createSubscriptionWriteCandidate({
          subscriptionIdentity: 'sub_recoverable',
          status: 'unpaid',
          currentPeriodEnd: FUTURE,
        }),
        now: NOW,
      }),
    ).toBe(true);
  });
});
