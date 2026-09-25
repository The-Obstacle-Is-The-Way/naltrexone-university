import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  CheckoutSessionCreateParams,
  StripeClient,
} from '@/src/adapters/shared/stripe-types';
import { STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES } from './stripe-checkout-client-contract-cases';

type ContractSuite = (name: string, factory: () => void) => void;
type ContractCase = (name: string, run: () => Promise<void>) => unknown;

type PaymentOrSubscriptionParams = Extract<
  CheckoutSessionCreateParams,
  { customer: string }
>;

type SubscriptionParams = Omit<PaymentOrSubscriptionParams, 'mode'> & {
  mode: 'subscription';
};

type StripeSubscriptionsClient = NonNullable<StripeClient['subscriptions']>;

// The port marks list and cancel optional; both halves implement them, so
// the contract requires them instead of guarding at run time.
export type StripeCheckoutClientContractHarness = {
  sessions: StripeClient['checkout']['sessions'];
  subscriptions: StripeSubscriptionsClient &
    Required<Pick<StripeSubscriptionsClient, 'list' | 'cancel'>>;
  subscriptionParams: SubscriptionParams;
  advanceCreationTime(): Promise<void>;
  // Creates one active Subscription for the harness customer and returns
  // its id and customer; the real half charges the TEST price with a test
  // card, the fake seeds it.
  seedSubscription(): Promise<{ id: string; customer: string }>;
  // Creates one more Subscription for the same customer and cancels it, so
  // the listing's status filters can be observed against a canceled one.
  seedCanceledSubscription(): Promise<{ id: string; customer: string }>;
  cleanup(): Promise<void>;
};

type ContractScenario = {
  name: (typeof STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES)[number];
  run(harness: StripeCheckoutClientContractHarness): Promise<void>;
};

function idempotencyKey(label: string): string {
  return `debt472_${label}_${randomUUID()}`;
}

function changedSuccessUrl(
  params: StripeCheckoutClientContractHarness['subscriptionParams'],
): StripeCheckoutClientContractHarness['subscriptionParams'] {
  return {
    ...params,
    success_url: 'https://app.example.com/a-different-success',
  };
}

function readErrorField(error: unknown, field: string): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  return Reflect.get(error, field);
}

const stripeCheckoutClientContractScenarios: readonly ContractScenario[] = [
  {
    name: STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES[0],
    async run(harness) {
      const options = { idempotencyKey: idempotencyKey('frozen_replay') };
      const first = await harness.sessions.create(
        harness.subscriptionParams,
        options,
      );
      await harness.sessions.expire(first.id);

      const replay = await harness.sessions.create(
        harness.subscriptionParams,
        options,
      );
      const live = await harness.sessions.retrieve(first.id);

      expect(replay.id === first.id).toBe(true);
      expect(replay.status).toBe(first.status);
      expect(replay.url).toBe(first.url);
      expect(live.id === first.id).toBe(true);
      expect(live.status).toBe('expired');
      expect(live.url).toBeNull();
    },
  },
  {
    name: STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES[1],
    async run(harness) {
      const first = await harness.sessions.create(harness.subscriptionParams, {
        idempotencyKey: idempotencyKey('page_first'),
      });
      await harness.advanceCreationTime();
      const second = await harness.sessions.create(harness.subscriptionParams, {
        idempotencyKey: idempotencyKey('page_second'),
      });
      await harness.advanceCreationTime();
      const third = await harness.sessions.create(harness.subscriptionParams, {
        idempotencyKey: idempotencyKey('page_third'),
      });

      const firstPage = await harness.sessions.list({
        customer: harness.subscriptionParams.customer,
        limit: 2,
      });
      const cursor = firstPage.data[1]?.id;
      expect(cursor).toBeTypeOf('string');
      if (!cursor) throw new Error('Contract first page omitted its cursor');
      const secondPage = await harness.sessions.list({
        customer: harness.subscriptionParams.customer,
        limit: 2,
        starting_after: cursor,
      });

      expect(firstPage.data).toHaveLength(2);
      expect(firstPage.data[0]?.id === third.id).toBe(true);
      expect(firstPage.data[1]?.id === second.id).toBe(true);
      expect(firstPage.has_more).toBe(true);
      expect(secondPage.data).toHaveLength(1);
      expect(secondPage.data[0]?.id === first.id).toBe(true);
      expect(secondPage.has_more).toBe(false);
    },
  },
  {
    name: STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES[2],
    async run(harness) {
      const session = await harness.sessions.create(
        harness.subscriptionParams,
        { idempotencyKey: idempotencyKey('terminal_visibility') },
      );
      await harness.sessions.expire(session.id);

      const listed = await harness.sessions.list({
        customer: harness.subscriptionParams.customer,
        limit: 100,
      });

      expect(
        listed.data.some(
          (candidate) =>
            candidate.id === session.id && candidate.status === 'expired',
        ),
      ).toBe(true);
    },
  },
  {
    name: STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES[3],
    async run(harness) {
      const options = { idempotencyKey: idempotencyKey('param_mismatch') };
      await harness.sessions.create(harness.subscriptionParams, options);

      let caught: unknown;
      try {
        await harness.sessions.create(
          changedSuccessUrl(harness.subscriptionParams),
          options,
        );
      } catch (error) {
        caught = error;
      }

      expect(readErrorField(caught, 'type')).toBe('StripeIdempotencyError');
      expect(readErrorField(caught, 'rawType')).toBe('idempotency_error');
      expect(readErrorField(caught, 'statusCode')).toBe(400);
      const message = readErrorField(caught, 'message');
      expect(
        typeof message === 'string' &&
          message.toLowerCase().includes('same parameters'),
      ).toBe(true);
    },
  },
  {
    name: STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES[4],
    async run(harness) {
      const list = harness.subscriptions.list;
      const seeded = await harness.seedSubscription();
      const canceledSeed = await harness.seedCanceledSubscription();

      // Stripe lists full Subscription objects; the port reads id and status.
      const all = await list.call(harness.subscriptions, {
        customer: seeded.customer,
        status: 'all',
        limit: 10,
      });
      expect(all.data).toHaveLength(2);
      expect(all.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: seeded.id, status: 'active' }),
          expect.objectContaining({ id: canceledSeed.id, status: 'canceled' }),
        ]),
      );
      // Without a status, Stripe lists every Subscription except canceled ones.
      const byDefault = await list.call(harness.subscriptions, {
        customer: seeded.customer,
        limit: 10,
      });
      expect(byDefault.data).toHaveLength(1);
      expect(byDefault.data[0]).toEqual(
        expect.objectContaining({ id: seeded.id, status: 'active' }),
      );
      const canceled = await list.call(harness.subscriptions, {
        customer: seeded.customer,
        status: 'canceled',
        limit: 10,
      });
      expect(canceled.data).toHaveLength(1);
      expect(canceled.data[0]).toEqual(
        expect.objectContaining({ id: canceledSeed.id, status: 'canceled' }),
      );

      const retrieved = (await harness.subscriptions.retrieve(seeded.id)) as {
        id?: string;
        customer?: string;
        status?: string;
        metadata?: Record<string, string>;
        items?: { data?: Array<{ price?: { id?: string } }> };
      };
      expect(retrieved).toEqual(
        expect.objectContaining({
          id: seeded.id,
          customer: seeded.customer,
          status: 'active',
        }),
      );
      expect(retrieved.metadata?.user_id).toBe('debt472_contract_user');
      expect(retrieved.items?.data?.[0]?.price?.id).toBe(
        harness.subscriptionParams.line_items[0]?.price,
      );
    },
  },
  {
    name: STRIPE_CHECKOUT_CLIENT_CONTRACT_CASE_TITLES[5],
    async run(harness) {
      const { cancel, list } = harness.subscriptions;
      const seeded = await harness.seedSubscription();

      const canceled = await cancel.call(harness.subscriptions, seeded.id);
      expect(canceled).toEqual(
        expect.objectContaining({ id: seeded.id, status: 'canceled' }),
      );
      // A canceled Subscription stays retrievable and leaves the default
      // listing.
      await expect(harness.subscriptions.retrieve(seeded.id)).resolves.toEqual(
        expect.objectContaining({ id: seeded.id, status: 'canceled' }),
      );
      const byDefault = await list.call(harness.subscriptions, {
        customer: seeded.customer,
        limit: 10,
      });
      expect(byDefault.data).toHaveLength(0);

      // Stripe rejects a second cancel as though the Subscription did not
      // exist; the message names the id.
      let caught: unknown;
      try {
        await cancel.call(harness.subscriptions, seeded.id);
      } catch (error) {
        caught = error;
      }
      expect(readErrorField(caught, 'type')).toBe('StripeInvalidRequestError');
      expect(readErrorField(caught, 'rawType')).toBe('invalid_request_error');
      expect(readErrorField(caught, 'code')).toBe('resource_missing');
      expect(readErrorField(caught, 'statusCode')).toBe(404);
      expect(readErrorField(caught, 'param')).toBe('id');
      expect(readErrorField(caught, 'message')).toBe(
        `No such subscription: '${seeded.id}'`,
      );
    },
  },
];

export function runStripeCheckoutClientContract(
  adapterName: string,
  createHarness: () => Promise<StripeCheckoutClientContractHarness>,
  suite: ContractSuite = describe,
  contractCase: ContractCase = it,
): void {
  suite(`${adapterName} Stripe Checkout client contract`, () => {
    for (const scenario of stripeCheckoutClientContractScenarios) {
      contractCase(scenario.name, async () => {
        const harness = await createHarness();
        try {
          await scenario.run(harness);
        } finally {
          await harness.cleanup();
        }
      });
    }
  });
}
