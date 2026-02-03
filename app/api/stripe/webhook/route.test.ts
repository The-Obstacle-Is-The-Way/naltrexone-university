import { describe, expect, it, vi } from 'vitest';
import type { StripeWebhookRouteContainer } from '@/app/api/stripe/webhook/handler';
import { createWebhookHandler } from '@/app/api/stripe/webhook/handler';
import type {
  StripeWebhookDeps,
  StripeWebhookTransaction,
} from '@/src/adapters/controllers/stripe-webhook-controller';
import { ApplicationError } from '@/src/application/errors';
import type {
  PaymentGateway,
  RateLimiter,
} from '@/src/application/ports/gateways';

function createPaymentGatewayStub(): PaymentGateway {
  return {
    createCustomer: async () => ({ stripeCustomerId: 'cus_123' }),
    createCheckoutSession: async () => ({ url: 'https://stripe/checkout' }),
    createPortalSession: async () => ({ url: 'https://stripe/portal' }),
    processWebhookEvent: async () => ({ eventId: 'evt_1', type: 'test' }),
  };
}

function createControllerLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createTestDeps() {
  const loggerError = vi.fn();
  const limit = vi.fn<RateLimiter['limit']>(async () => ({
    success: true,
    limit: 1000,
    remaining: 999,
    retryAfterSeconds: 0,
  }));
  const rateLimiter: RateLimiter & { limit: typeof limit } = { limit };
  const tx = {
    stripeEvents: {
      claim: async () => true,
      lock: async () => ({ processedAt: null, error: null }),
      markProcessed: async () => undefined,
      markFailed: async () => undefined,
      pruneProcessedBefore: async () => 0,
    },
    subscriptions: {
      findByUserId: async () => null,
      findByStripeSubscriptionId: async () => null,
      upsert: async () => undefined,
    },
    stripeCustomers: {
      findByUserId: async () => null,
      insert: async () => undefined,
    },
  } satisfies StripeWebhookTransaction;

  const deps: StripeWebhookDeps = {
    paymentGateway: createPaymentGatewayStub(),
    logger: createControllerLogger(),
    transaction: async (fn) => fn(tx),
  };

  const createStripeWebhookDeps = vi.fn(() => deps);
  const createRateLimiter = vi.fn<() => RateLimiter>(() => rateLimiter);
  const createContainer = vi.fn<() => StripeWebhookRouteContainer>(() => ({
    logger: { error: loggerError },
    createStripeWebhookDeps,
    createRateLimiter,
  }));

  const processStripeWebhook = vi.fn();

  return {
    POST: createWebhookHandler(createContainer, processStripeWebhook),
    createContainer,
    processStripeWebhook,
    loggerError,
    createStripeWebhookDeps,
    createRateLimiter,
    rateLimiter,
    deps,
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
    const { POST, processStripeWebhook, createStripeWebhookDeps, deps } =
      createTestDeps();
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
    expect(createStripeWebhookDeps).toHaveBeenCalledTimes(1);
    expect(processStripeWebhook).toHaveBeenCalledWith(deps, {
      rawBody: 'raw',
      signature: 'sig_1',
    });
  });

  it('returns 400 when signature verification fails', async () => {
    const { POST, processStripeWebhook } = createTestDeps();

    processStripeWebhook.mockRejectedValue(
      new ApplicationError(
        'INVALID_WEBHOOK_SIGNATURE',
        'Invalid webhook signature',
      ),
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

  it('returns 400 when payload validation fails', async () => {
    const { POST, processStripeWebhook } = createTestDeps();

    processStripeWebhook.mockRejectedValue(
      new ApplicationError('INVALID_WEBHOOK_PAYLOAD', 'Invalid payload'),
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

  it('returns 429 when rate limited', async () => {
    const { POST, processStripeWebhook, rateLimiter } = createTestDeps();

    rateLimiter.limit.mockResolvedValue({
      success: false,
      limit: 1000,
      remaining: 0,
      retryAfterSeconds: 60,
    });

    const res = await POST(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_1' },
        body: 'raw',
      }),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(processStripeWebhook).not.toHaveBeenCalled();
  });

  it('returns 503 when rate limiter throws', async () => {
    const { POST, processStripeWebhook, rateLimiter, loggerError } =
      createTestDeps();

    rateLimiter.limit.mockRejectedValue(new Error('rate limiter down'));

    const res = await POST(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_1' },
        body: 'raw',
      }),
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: 'Rate limiter unavailable',
    });
    expect(processStripeWebhook).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when processing fails unexpectedly', async () => {
    const { POST, loggerError, processStripeWebhook } = createTestDeps();
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

  it('passes container-created deps into processStripeWebhook', async () => {
    const tx = {
      stripeEvents: { claim: async () => true },
      subscriptions: { upsert: async () => undefined },
      stripeCustomers: { insert: async () => undefined },
    } as unknown as StripeWebhookTransaction;

    const transactionSpy = vi.fn(
      async (fn: (t: StripeWebhookTransaction) => Promise<void>) => fn(tx),
    );

    const deps: StripeWebhookDeps = {
      paymentGateway: createPaymentGatewayStub(),
      logger: createControllerLogger(),
      transaction:
        transactionSpy as unknown as StripeWebhookDeps['transaction'],
    };

    const createStripeWebhookDeps = vi.fn(() => deps);
    const rateLimiter: RateLimiter = {
      limit: async () => ({
        success: true,
        limit: 1000,
        remaining: 999,
        retryAfterSeconds: 0,
      }),
    };
    const createContainer = vi.fn<() => StripeWebhookRouteContainer>(() => ({
      logger: { error: vi.fn() },
      createRateLimiter: () => rateLimiter,
      createStripeWebhookDeps,
    }));

    const processStripeWebhook = vi.fn(async (inputDeps: StripeWebhookDeps) => {
      expect(inputDeps).toBe(deps);
      await inputDeps.transaction(async (tx) => {
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
    expect(createStripeWebhookDeps).toHaveBeenCalledTimes(1);
    expect(transactionSpy).toHaveBeenCalledTimes(1);
  });
});
