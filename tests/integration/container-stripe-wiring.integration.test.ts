import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { stripeSubscriptions } from '@/db/schema';
import { createContainer } from '@/lib/container';
import { env } from '@/lib/env';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';
import subscriptionEvent from '@/tests/fixtures/stripe/customer.subscription.updated.json';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const PRICE_IDS = {
  monthly: 'container-monthly',
  annual: 'container-annual',
};
const WEBHOOK_SECRET = 'container-signature-test-only';

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('container Stripe configuration', () => {
  it.each(['monthly', 'annual'] as const)(
    'uses the configured %s price for webhook normalization and persisted subscriptions',
    async (plan) => {
      const user = await createUser(db, cleanup);
      const subscription = structuredClone(subscriptionEvent.data.object);
      subscription.metadata.user_id = user.id;
      const item = subscription.items.data[0];
      if (!item) throw new Error('Subscription fixture has no item');
      item.price.id = PRICE_IDS[plan];

      // Canned HTTP input isolates configuration wiring, not Stripe behavior.
      // The SDK/signature verifier and Postgres adapter are real; no network
      // request, provider parity, or webhook-delivery claim is made here.
      const stripe = new Stripe('container-test-key', {
        apiVersion: STRIPE_API_VERSION,
        maxNetworkRetries: 0,
        httpClient: Stripe.createFetchHttpClient(async (url, init) => {
          expect(new URL(String(url)).pathname).toBe(
            `/v1/subscriptions/${subscription.id}`,
          );
          expect(init?.method).toBe('GET');
          return new Response(JSON.stringify(subscription), { status: 200 });
        }),
      });
      const container = createContainer({
        primitives: {
          db,
          env: {
            ...env,
            NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: PRICE_IDS.monthly,
            NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: PRICE_IDS.annual,
            STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
          },
          getStripe: () => stripe,
        },
      });
      const payload = JSON.stringify({
        ...subscriptionEvent,
        data: { object: subscription },
      });
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });

      const result = await container
        .createPaymentGateway()
        .processWebhookEvent(payload, signature);
      expect(result.subscriptionUpdate).toMatchObject({
        userId: user.id,
        plan,
      });
      if (!result.subscriptionUpdate) {
        throw new Error('Gateway did not return a subscription update');
      }
      const repository = container.createSubscriptionRepository();
      await expect(
        repository.upsert({
          ...result.subscriptionUpdate,
          expectedVersion: null,
        }),
      ).resolves.toEqual({ persisted: true });
      await expect(
        db.query.stripeSubscriptions.findFirst({
          where: eq(stripeSubscriptions.userId, user.id),
        }),
      ).resolves.toMatchObject({ priceId: PRICE_IDS[plan] });
      await expect(repository.findByUserId(user.id)).resolves.toMatchObject({
        userId: user.id,
        plan,
      });
    },
  );

  it('uses the injected SDK to verify the signature through the public gateway', async () => {
    const stripe = new Stripe('container-test-key', {
      apiVersion: STRIPE_API_VERSION,
      httpClient: Stripe.createFetchHttpClient(async () => {
        throw new Error('Unexpected Stripe network request');
      }),
    });
    const verifySignature = vi.spyOn(stripe.webhooks, 'constructEvent');
    const getStripe = vi.fn(() => stripe);
    const container = createContainer({
      primitives: {
        db,
        env: { ...env, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET },
        getStripe,
      },
    });
    const payload = JSON.stringify({
      ...subscriptionEvent,
      type: 'invoice.updated',
      data: { object: {} },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });

    await expect(
      container.createPaymentGateway().processWebhookEvent(payload, signature),
    ).resolves.toEqual({
      eventId: subscriptionEvent.id,
      type: 'invoice.updated',
    });
    expect(getStripe).toHaveBeenCalledTimes(1);
    expect(verifySignature).toHaveBeenCalledWith(
      payload,
      signature,
      WEBHOOK_SECRET,
    );
  });
});
