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

export type StripeCheckoutClientContractHarness = {
  sessions: StripeClient['checkout']['sessions'];
  subscriptionParams: SubscriptionParams;
  advanceCreationTime(): Promise<void>;
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
