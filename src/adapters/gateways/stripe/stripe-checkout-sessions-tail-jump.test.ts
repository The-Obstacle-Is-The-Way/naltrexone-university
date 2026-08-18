import { describe, expect, it } from 'vitest';
import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import type {
  CheckoutSessionCreateParams,
  StripeCheckoutSession,
} from '@/src/adapters/shared/stripe-types';
import type { CheckoutSessionInput } from '@/src/application/ports/gateways';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { createTestRenewalTerms } from '@/src/application/test-helpers/renewal-terms';
import { createStripeCheckoutSession } from './stripe-checkout-sessions';
import { FakeStripeCheckoutClient } from './test-helpers/fake-stripe-checkout-client';

const PRICE_IDS: StripePriceIds = {
  monthly: 'price_monthly',
  annual: 'price_annual',
};

type TailJumpHarness = {
  stripe: FakeStripeCheckoutClient;
  input: CheckoutSessionInput;
  logger: FakeLogger;
  nowMs: () => number;
  advanceOneSecond: () => void;
};

function createHarness(): TailJumpHarness {
  let currentNowMs = Date.UTC(2026, 7, 17, 12, 0, 0);
  return {
    stripe: new FakeStripeCheckoutClient(() => currentNowMs),
    input: {
      userId: crypto.randomUUID(),
      externalCustomerId: 'cus_tail_jump',
      ...createTestRenewalTerms('monthly'),
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
      trialPeriodDays: 7,
    },
    logger: new FakeLogger(),
    nowMs: () => currentNowMs,
    advanceOneSecond: () => {
      currentNowMs += 1_000;
    },
  };
}

function recoveryKey(input: CheckoutSessionInput, sessionId: string): string {
  const variantSuffix =
    input.trialPeriodDays === undefined
      ? ''
      : `:trial:${input.trialPeriodDays}`;
  return `checkout_session_recovery:${input.userId}:${input.plan}:${sessionId}${variantSuffix}`;
}

async function createCheckout(
  harness: TailJumpHarness,
): Promise<{ url: string }> {
  return createStripeCheckoutSession({
    stripe: harness.stripe,
    input: harness.input,
    priceIds: PRICE_IDS,
    logger: harness.logger,
    nowMs: harness.nowMs,
  });
}

async function seedCompletedChain(
  harness: TailJumpHarness,
  terminalSessionCount: number,
): Promise<{
  tail: StripeCheckoutSession;
  params: CheckoutSessionCreateParams;
}> {
  await createCheckout(harness);
  const params = harness.stripe.createCalls[0]?.params;
  if (!params) throw new Error('Expected the primary create params');

  let tail = await harness.stripe.checkout.sessions.retrieve('cs_fake_1');
  harness.stripe.markComplete(tail.id);
  tail = await harness.stripe.checkout.sessions.retrieve(tail.id);
  for (let index = 1; index < terminalSessionCount; index += 1) {
    harness.advanceOneSecond();
    tail = await harness.stripe.checkout.sessions.create(params, {
      idempotencyKey: recoveryKey(harness.input, tail.id),
    });
    harness.stripe.markComplete(tail.id);
    tail = await harness.stripe.checkout.sessions.retrieve(tail.id);
  }

  return { tail, params };
}

async function seedTerminalSession({
  harness,
  params,
  idempotencyKey,
}: {
  harness: TailJumpHarness;
  params: CheckoutSessionCreateParams;
  idempotencyKey: string;
}): Promise<StripeCheckoutSession> {
  const session = await harness.stripe.checkout.sessions.create(params, {
    idempotencyKey,
  });
  harness.stripe.markComplete(session.id);
  return harness.stripe.checkout.sessions.retrieve(session.id);
}

describe('createStripeCheckoutSession replay tail jump', () => {
  it('jumps past a retained chain above the traversal cap with constant recovery-create depth', async () => {
    const harness = createHarness();
    const { tail } = await seedCompletedChain(harness, 13);
    const createCallsBefore = harness.stripe.createCalls.length;
    const listCallsBefore = harness.stripe.listCalls.length;
    const retrieveCallsBefore = harness.stripe.retrieveCalls.length;

    await expect(createCheckout(harness)).resolves.toEqual({
      url: 'https://checkout.stripe.test/cs_fake_14',
    });

    const invocationCreateCalls =
      harness.stripe.createCalls.slice(createCallsBefore);
    const invocationListCalls = harness.stripe.listCalls.slice(listCallsBefore);
    const invocationRetrieveCalls =
      harness.stripe.retrieveCalls.slice(retrieveCallsBefore);
    expect(invocationCreateCalls).toHaveLength(2);
    expect(invocationRetrieveCalls).toHaveLength(2);
    expect(invocationListCalls).toEqual([
      { customer: harness.input.externalCustomerId, status: 'open', limit: 1 },
      { customer: harness.input.externalCustomerId, limit: 25 },
      {
        customer: harness.input.externalCustomerId,
        status: 'open',
        limit: 10,
      },
    ]);
    expect(invocationCreateCalls[1]?.options?.idempotencyKey).toBe(
      recoveryKey(harness.input, tail.id),
    );
  });

  it('finds the unique newest exact-metadata tail on the second page', async () => {
    const harness = createHarness();
    const { tail, params } = await seedCompletedChain(harness, 2);
    const unrelatedParams = {
      ...params,
      metadata: {
        ...params.metadata,
        renewal_user_id: crypto.randomUUID(),
      },
    } satisfies CheckoutSessionCreateParams;
    for (let index = 0; index < 25; index += 1) {
      harness.advanceOneSecond();
      await seedTerminalSession({
        harness,
        params: unrelatedParams,
        idempotencyKey: `unrelated_${index}`,
      });
    }
    const createCallsBefore = harness.stripe.createCalls.length;
    const listCallsBefore = harness.stripe.listCalls.length;

    await expect(createCheckout(harness)).resolves.toEqual({
      url: 'https://checkout.stripe.test/cs_fake_28',
    });

    const invocationCreateCalls =
      harness.stripe.createCalls.slice(createCallsBefore);
    const invocationTailListCalls = harness.stripe.listCalls
      .slice(listCallsBefore)
      .filter((call) => call.status === undefined);
    expect(invocationCreateCalls).toHaveLength(2);
    expect(invocationCreateCalls[1]?.options?.idempotencyKey).toBe(
      recoveryKey(harness.input, tail.id),
    );
    expect(invocationTailListCalls).toEqual([
      { customer: harness.input.externalCustomerId, limit: 25 },
      {
        customer: harness.input.externalCustomerId,
        limit: 25,
        starting_after: 'cs_fake_3',
      },
    ]);
  });

  it('falls back to the primary chain when newest exact matches tie across a page boundary', async () => {
    const harness = createHarness();
    const { tail: causalTail, params } = await seedCompletedChain(harness, 2);
    const ambiguousBranch = await seedTerminalSession({
      harness,
      params,
      idempotencyKey: 'ambiguous_same_second_branch',
    });
    const unrelatedParams = {
      ...params,
      metadata: {
        ...params.metadata,
        renewal_plan: 'annual',
      },
    } satisfies CheckoutSessionCreateParams;
    for (let index = 0; index < 24; index += 1) {
      harness.advanceOneSecond();
      await seedTerminalSession({
        harness,
        params: unrelatedParams,
        idempotencyKey: `newer_unrelated_${index}`,
      });
    }
    const createCallsBefore = harness.stripe.createCalls.length;
    const listCallsBefore = harness.stripe.listCalls.length;

    await expect(createCheckout(harness)).resolves.toEqual({
      url: 'https://checkout.stripe.test/cs_fake_28',
    });

    const invocationCreateCalls =
      harness.stripe.createCalls.slice(createCallsBefore);
    const invocationTailListCalls = harness.stripe.listCalls
      .slice(listCallsBefore)
      .filter((call) => call.status === undefined);
    expect(
      invocationCreateCalls.map((call) => call.options?.idempotencyKey),
    ).toEqual([
      `checkout_session:${harness.input.userId}:monthly:trial:7`,
      recoveryKey(harness.input, 'cs_fake_1'),
      recoveryKey(harness.input, causalTail.id),
    ]);
    expect(
      invocationCreateCalls.map((call) => call.options?.idempotencyKey),
    ).not.toContain(recoveryKey(harness.input, ambiguousBranch.id));
    expect(invocationTailListCalls).toHaveLength(2);
  });

  it('ignores newer Sessions unless every renewal metadata field matches', async () => {
    const harness = createHarness();
    const { tail, params } = await seedCompletedChain(harness, 2);
    const metadata = params.metadata;
    if (!metadata) throw new Error('Expected renewal metadata');
    let fixtureIndex = 0;
    for (const metadataKey of Object.keys(metadata)) {
      harness.advanceOneSecond();
      await seedTerminalSession({
        harness,
        params: {
          ...params,
          metadata: {
            ...metadata,
            [metadataKey]: `${metadata[metadataKey]}_different`,
          },
        },
        idempotencyKey: `metadata_mismatch_${fixtureIndex}`,
      });
      fixtureIndex += 1;
    }
    harness.advanceOneSecond();
    const legacyParams = structuredClone(params);
    delete legacyParams.metadata;
    await seedTerminalSession({
      harness,
      params: legacyParams,
      idempotencyKey: 'legacy_missing_metadata',
    });
    const createCallsBefore = harness.stripe.createCalls.length;

    await expect(createCheckout(harness)).resolves.toEqual({
      url: `https://checkout.stripe.test/cs_fake_${fixtureIndex + 4}`,
    });

    const invocationCreateCalls =
      harness.stripe.createCalls.slice(createCallsBefore);
    expect(invocationCreateCalls).toHaveLength(2);
    expect(invocationCreateCalls[1]?.options?.idempotencyKey).toBe(
      recoveryKey(harness.input, tail.id),
    );
  });

  it('falls back after the bounded scan cannot reach an exact-metadata tail', async () => {
    const harness = createHarness();
    const { params } = await seedCompletedChain(harness, 2);
    const unrelatedParams = structuredClone(params);
    delete unrelatedParams.metadata;
    for (let index = 0; index < 100; index += 1) {
      harness.advanceOneSecond();
      await seedTerminalSession({
        harness,
        params: unrelatedParams,
        idempotencyKey: `bounded_scan_unrelated_${index}`,
      });
    }
    const createCallsBefore = harness.stripe.createCalls.length;
    const listCallsBefore = harness.stripe.listCalls.length;

    await expect(createCheckout(harness)).resolves.toEqual({
      url: 'https://checkout.stripe.test/cs_fake_103',
    });

    const invocationCreateCalls =
      harness.stripe.createCalls.slice(createCallsBefore);
    const invocationTailListCalls = harness.stripe.listCalls
      .slice(listCallsBefore)
      .filter((call) => call.status === undefined);
    expect(
      invocationCreateCalls.map((call) => call.options?.idempotencyKey),
    ).toEqual([
      `checkout_session:${harness.input.userId}:monthly:trial:7`,
      recoveryKey(harness.input, 'cs_fake_1'),
      recoveryKey(harness.input, 'cs_fake_2'),
    ]);
    expect(invocationTailListCalls).toHaveLength(4);
    expect(harness.logger.warnCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          context: expect.objectContaining({
            reason: 'tail-scan-page-limit-reached',
          }),
        }),
      ]),
    );
  });

  it('falls back when the provider omits the pagination completion field', async () => {
    const harness = createHarness();
    await seedCompletedChain(harness, 2);
    const list = harness.stripe.checkout.sessions.list;
    harness.stripe.checkout.sessions.list = async (params) => {
      const page = await list(params);
      if (params.status !== undefined) return page;
      return { data: page.data };
    };
    const createCallsBefore = harness.stripe.createCalls.length;

    await expect(createCheckout(harness)).resolves.toEqual({
      url: 'https://checkout.stripe.test/cs_fake_3',
    });

    expect(
      harness.stripe.createCalls
        .slice(createCallsBefore)
        .map((call) => call.options?.idempotencyKey),
    ).toEqual([
      `checkout_session:${harness.input.userId}:monthly:trial:7`,
      recoveryKey(harness.input, 'cs_fake_1'),
      recoveryKey(harness.input, 'cs_fake_2'),
    ]);
    expect(harness.logger.warnCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          context: expect.objectContaining({
            reason: 'provider-list-has-more-is-missing',
          }),
        }),
      ]),
    );
  });

  it('falls back to the deterministic primary walk when the tail list fails', async () => {
    const harness = createHarness();
    await seedCompletedChain(harness, 2);
    const list = harness.stripe.checkout.sessions.list;
    harness.stripe.checkout.sessions.list = async (params) => {
      if (params.status === undefined) {
        throw new Error('injected tail list failure');
      }
      return list(params);
    };
    const createCallsBefore = harness.stripe.createCalls.length;

    await expect(createCheckout(harness)).resolves.toEqual({
      url: 'https://checkout.stripe.test/cs_fake_3',
    });

    expect(
      harness.stripe.createCalls
        .slice(createCallsBefore)
        .map((call) => call.options?.idempotencyKey),
    ).toEqual([
      `checkout_session:${harness.input.userId}:monthly:trial:7`,
      recoveryKey(harness.input, 'cs_fake_1'),
      recoveryKey(harness.input, 'cs_fake_2'),
    ]);
    expect(harness.logger.warnCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          context: expect.objectContaining({ reason: 'provider-list-failed' }),
        }),
      ]),
    );
  });

  it('live-retrieves and reuses an open tail that appeared after the preflight list', async () => {
    const harness = createHarness();
    const { tail, params } = await seedCompletedChain(harness, 13);
    harness.advanceOneSecond();
    const openTail = await harness.stripe.checkout.sessions.create(params, {
      idempotencyKey: recoveryKey(harness.input, tail.id),
    });
    const list = harness.stripe.checkout.sessions.list;
    let hideOpenTailFromPreflight = true;
    harness.stripe.checkout.sessions.list = async (listParams) => {
      const page = await list(listParams);
      if (
        hideOpenTailFromPreflight &&
        listParams.status === 'open' &&
        listParams.limit === 1
      ) {
        hideOpenTailFromPreflight = false;
        return { ...page, data: [] };
      }
      return page;
    };
    const createCallsBefore = harness.stripe.createCalls.length;
    const retrieveCallsBefore = harness.stripe.retrieveCalls.length;

    await expect(createCheckout(harness)).resolves.toEqual({
      url: openTail.url,
    });

    expect(harness.stripe.createCalls.slice(createCallsBefore)).toHaveLength(1);
    expect(harness.stripe.retrieveCalls.slice(retrieveCallsBefore)).toEqual([
      'cs_fake_1',
      openTail.id,
    ]);
  });

  it('preserves the subscription fallback policy when open-tail retrieval fails', async () => {
    const harness = createHarness();
    const { tail, params } = await seedCompletedChain(harness, 2);
    harness.advanceOneSecond();
    const openTail = await harness.stripe.checkout.sessions.create(params, {
      idempotencyKey: recoveryKey(harness.input, tail.id),
    });
    const list = harness.stripe.checkout.sessions.list;
    let hideOpenTailFromPreflight = true;
    harness.stripe.checkout.sessions.list = async (listParams) => {
      const page = await list(listParams);
      if (
        hideOpenTailFromPreflight &&
        listParams.status === 'open' &&
        listParams.limit === 1
      ) {
        hideOpenTailFromPreflight = false;
        return { ...page, data: [] };
      }
      return page;
    };
    harness.stripe.setRetrieveOverride((session) => {
      if (session.id === openTail.id) {
        throw new Error('injected open-tail retrieve failure');
      }
      return session;
    });

    await expect(createCheckout(harness)).resolves.toEqual({
      url: openTail.url,
    });

    expect(harness.logger.warnCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msg: 'Falling back to created checkout session snapshot after live retrieval failed',
        }),
      ]),
    );
  });

  it('derives one shared tail key for concurrent same-input calls', async () => {
    const harness = createHarness();
    const { tail } = await seedCompletedChain(harness, 13);
    const createCallsBefore = harness.stripe.createCalls.length;

    const [first, second] = await Promise.all([
      createCheckout(harness),
      createCheckout(harness),
    ]);

    expect(first).toEqual({ url: 'https://checkout.stripe.test/cs_fake_14' });
    expect(second).toEqual(first);
    const invocationKeys = harness.stripe.createCalls
      .slice(createCallsBefore)
      .map((call) => call.options?.idempotencyKey);
    expect(invocationKeys).toEqual([
      `checkout_session:${harness.input.userId}:monthly:trial:7`,
      `checkout_session:${harness.input.userId}:monthly:trial:7`,
      recoveryKey(harness.input, tail.id),
      recoveryKey(harness.input, tail.id),
    ]);
  });
});
