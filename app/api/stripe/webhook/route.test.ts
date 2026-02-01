import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';

vi.mock('server-only', () => ({}));

const processStripeWebhookMock = vi.fn();
vi.mock('@/src/adapters/controllers/stripe-webhook-controller', () => ({
  processStripeWebhook: (...args: unknown[]) =>
    processStripeWebhookMock(...args),
}));

const loggerErrorMock = vi.fn();
vi.mock('@/lib/container', () => ({
  createContainer: () => ({
    db: {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    },
    env: {
      NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
      NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
    },
    logger: { error: loggerErrorMock },
    paymentGateway: {},
  }),
}));

describe('POST /api/stripe/webhook', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const { POST } = await import('./route');

    const res = await POST(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        body: 'raw',
      }),
    );

    expect(res.status).toBe(400);
  });

  it('returns 200 and received=true when processing succeeds', async () => {
    processStripeWebhookMock.mockResolvedValue(undefined);

    const { POST } = await import('./route');

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
    processStripeWebhookMock.mockRejectedValue(
      new ApplicationError('STRIPE_ERROR', 'Invalid webhook signature'),
    );

    const { POST } = await import('./route');

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
    loggerErrorMock.mockClear();
    processStripeWebhookMock.mockRejectedValue(new Error('boom'));

    const { POST } = await import('./route');

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
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });
});
