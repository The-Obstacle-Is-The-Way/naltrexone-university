import { describe, expect, it, vi } from 'vitest';
import type { ClerkWebhookRouteContainer } from '@/app/api/webhooks/clerk/handler';
import { createWebhookHandler } from '@/app/api/webhooks/clerk/handler';
import type {
  ClerkWebhookDeps,
  ClerkWebhookEvent,
} from '@/src/adapters/controllers/clerk-webhook-controller';
import { ApplicationError } from '@/src/application/errors';

function createTestDeps() {
  const loggerError = vi.fn();
  const loggerWarn = vi.fn();
  const rateLimiter = {
    limit: vi.fn(async () => ({
      success: true,
      limit: 100,
      remaining: 99,
      retryAfterSeconds: 0,
    })),
  };

  const userRepository = {
    findByClerkId: vi.fn(async () => null),
    upsertByClerkId: vi.fn(async () => ({
      id: 'user_1',
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    })),
    deleteByClerkId: vi.fn(async () => false),
  };

  const stripeCustomerRepository = {
    findByUserId: vi.fn(async () => null),
    insert: vi.fn(async () => undefined),
  };

  const createUserRepository = vi.fn(() => userRepository as never);
  const createStripeCustomerRepository = vi.fn(
    () => stripeCustomerRepository as never,
  );

  const createContainer = vi.fn<() => ClerkWebhookRouteContainer>(() => ({
    logger: { error: loggerError, warn: loggerWarn },
    stripe: {
      subscriptions: {
        list: async function* () {},
        cancel: async () => undefined,
      },
    },
    createRateLimiter: () => rateLimiter as never,
    createUserRepository,
    createStripeCustomerRepository,
  }));

  const verifyWebhook = vi.fn();
  const processClerkWebhook =
    vi.fn<
      (deps: ClerkWebhookDeps, event: ClerkWebhookEvent) => Promise<void>
    >();
  const cancelStripeCustomerSubscriptions = vi.fn(async () => undefined);

  return {
    POST: createWebhookHandler(
      createContainer,
      verifyWebhook,
      processClerkWebhook,
      cancelStripeCustomerSubscriptions,
    ),
    createContainer,
    verifyWebhook,
    processClerkWebhook,
    cancelStripeCustomerSubscriptions,
    loggerError,
    loggerWarn,
    createUserRepository,
    createStripeCustomerRepository,
    userRepository,
    stripeCustomerRepository,
    rateLimiter,
  };
}

describe('POST /api/webhooks/clerk', () => {
  it('returns 400 when signature verification fails', async () => {
    const { POST, createContainer, verifyWebhook, processClerkWebhook } =
      createTestDeps();

    verifyWebhook.mockRejectedValue(new Error('bad signature'));

    const res = await POST(
      new Request('http://localhost/api/webhooks/clerk', {
        method: 'POST',
        body: 'raw',
      }),
    );

    expect(res.status).toBe(400);
    expect(createContainer).toHaveBeenCalledTimes(1);
    expect(processClerkWebhook).not.toHaveBeenCalled();
  });

  it('returns 200 and received=true when processing succeeds', async () => {
    const { POST, verifyWebhook, processClerkWebhook } = createTestDeps();

    verifyWebhook.mockResolvedValue({
      type: 'user.updated',
      data: { id: 'clerk_1' },
    });
    processClerkWebhook.mockResolvedValue(undefined);

    const res = await POST(
      new Request('http://localhost/api/webhooks/clerk', {
        method: 'POST',
        body: 'raw',
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
  });

  it('returns 429 when rate limited', async () => {
    const { POST, rateLimiter, processClerkWebhook, verifyWebhook } =
      createTestDeps();

    rateLimiter.limit.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      retryAfterSeconds: 60,
    });

    const res = await POST(
      new Request('http://localhost/api/webhooks/clerk', {
        method: 'POST',
        body: 'raw',
      }),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(verifyWebhook).not.toHaveBeenCalled();
    expect(processClerkWebhook).not.toHaveBeenCalled();
  });

  it('returns 400 when payload validation fails', async () => {
    const { POST, verifyWebhook, processClerkWebhook } = createTestDeps();

    verifyWebhook.mockResolvedValue({
      type: 'user.updated',
      data: { id: 'clerk_1' },
    });
    processClerkWebhook.mockRejectedValue(
      new ApplicationError('INVALID_WEBHOOK_PAYLOAD', 'Invalid payload'),
    );

    const res = await POST(
      new Request('http://localhost/api/webhooks/clerk', {
        method: 'POST',
        body: 'raw',
      }),
    );

    expect(res.status).toBe(400);
  });

  it('returns 500 when processing fails unexpectedly', async () => {
    const { POST, loggerError, verifyWebhook, processClerkWebhook } =
      createTestDeps();

    verifyWebhook.mockResolvedValue({
      type: 'user.updated',
      data: { id: 'clerk_1' },
    });
    processClerkWebhook.mockRejectedValue(new Error('boom'));

    const res = await POST(
      new Request('http://localhost/api/webhooks/clerk', {
        method: 'POST',
        body: 'raw',
      }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'Webhook processing failed',
    });
    expect(loggerError).toHaveBeenCalledTimes(1);
  });
});
