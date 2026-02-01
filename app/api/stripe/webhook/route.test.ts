import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { describe, expect, it, vi } from 'vitest';
import type { StripeWebhookRouteContainer } from '@/app/api/stripe/webhook/handler';
import { createWebhookHandler } from '@/app/api/stripe/webhook/handler';
import type * as schema from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { PaymentGateway } from '@/src/application/ports/gateways';

type Db = PostgresJsDatabase<typeof schema>;

function createPaymentGatewayStub(): PaymentGateway {
  return {
    createCheckoutSession: async () => ({ url: 'https://stripe/checkout' }),
    createPortalSession: async () => ({ url: 'https://stripe/portal' }),
    processWebhookEvent: async () => ({ eventId: 'evt_1', type: 'test' }),
  };
}

function createTestDeps() {
  const loggerError = vi.fn();
  const createContainer = vi.fn<() => StripeWebhookRouteContainer>(() => ({
    db: {
      transaction: async <T>(fn: (tx: Db) => Promise<T>): Promise<T> =>
        fn({} as Db),
    },
    env: {
      NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
      NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
    },
    logger: { error: loggerError },
    paymentGateway: createPaymentGatewayStub(),
  }));

  const processStripeWebhook = vi.fn();

  return {
    POST: createWebhookHandler(createContainer, processStripeWebhook),
    createContainer,
    processStripeWebhook,
    loggerError,
  };
}

describe('POST /api/stripe/webhook', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const { POST, createContainer, processStripeWebhook } = createTestDeps();

    const res = await POST(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        body: 'raw',
      }),
    );

    expect(res.status).toBe(400);
    expect(createContainer).not.toHaveBeenCalled();
    expect(processStripeWebhook).not.toHaveBeenCalled();
  });

  it('returns 200 and received=true when processing succeeds', async () => {
    const { POST, processStripeWebhook } = createTestDeps();
    processStripeWebhook.mockResolvedValue(undefined);

    const res = await POST(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_1' },
        body: 'raw',
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
  });

  it('returns 400 when signature verification fails', async () => {
    const { POST, processStripeWebhook } = createTestDeps();

    processStripeWebhook.mockRejectedValue(
      new ApplicationError('STRIPE_ERROR', 'Invalid webhook signature'),
    );

    const res = await POST(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_1' },
        body: 'raw',
      }),
    );

    expect(res.status).toBe(400);
  });

  it('returns 500 when processing fails unexpectedly', async () => {
    const { POST, loggerError, processStripeWebhook } = createTestDeps();
    loggerError.mockClear();
    processStripeWebhook.mockRejectedValue(new Error('boom'));

    const res = await POST(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_1' },
        body: 'raw',
      }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'Webhook processing failed',
    });
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it('provides a transaction wrapper to processStripeWebhook', async () => {
    const containerTransaction = vi.fn(
      async <T>(fn: (tx: Db) => Promise<T>): Promise<T> => fn({} as Db),
    ) as unknown as StripeWebhookRouteContainer['db']['transaction'];
    const createContainer = vi.fn<() => StripeWebhookRouteContainer>(() => ({
      db: { transaction: containerTransaction },
      env: {
        NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
        NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
      },
      logger: { error: vi.fn() },
      paymentGateway: createPaymentGatewayStub(),
    }));

    const processStripeWebhook = vi.fn(async (deps: unknown) => {
      const d = deps as {
        transaction: (fn: (tx: unknown) => Promise<void>) => Promise<void>;
      };
      await d.transaction(async (tx) => {
        const t = tx as {
          stripeEvents: { claim: unknown };
          subscriptions: { upsert: unknown };
          stripeCustomers: { insert: unknown };
        };
        expect(typeof t.stripeEvents.claim).toBe('function');
        expect(typeof t.subscriptions.upsert).toBe('function');
        expect(typeof t.stripeCustomers.insert).toBe('function');
      });
    });

    const POST = createWebhookHandler(createContainer, processStripeWebhook);

    const res = await POST(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_1' },
        body: 'raw',
      }),
    );

    expect(res.status).toBe(200);
    expect(containerTransaction).toHaveBeenCalledTimes(1);
  });
});
