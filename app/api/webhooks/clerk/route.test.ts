import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { ClerkWebhookRouteContainer } from '@/app/api/webhooks/clerk/handler';
import { createWebhookHandler } from '@/app/api/webhooks/clerk/handler';
import type {
  ClerkWebhookDeps,
  ClerkWebhookEvent,
} from '@/src/adapters/controllers/clerk-webhook-controller';
import { ApplicationError } from '@/src/application/errors';
import type { RateLimiter } from '@/src/application/ports/gateways';
import {
  FakeClerkEventRepository,
  FakeDeletedClerkUserRepository,
  FakeLogger,
  FakePendingStripeCustomerCleanupRepository,
  FakeStripeCustomerRepository,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';

type ClerkVerifyWebhook = typeof import('@clerk/nextjs/webhooks').verifyWebhook;

function createTestDeps() {
  const logger = new FakeLogger();
  const limit = vi.fn<RateLimiter['limit']>(async () => ({
    success: true,
    limit: 100,
    remaining: 99,
    retryAfterSeconds: 0,
  }));
  const pruneExpiredWindows = vi.fn(async () => 0);
  const rateLimiter: RateLimiter & { limit: typeof limit } = {
    limit,
    pruneExpiredWindows,
  };

  const userRepository = new FakeUserRepository();
  const stripeCustomerRepository = new FakeStripeCustomerRepository();
  const clerkEvents = new FakeClerkEventRepository();
  const deletedClerkUsers = new FakeDeletedClerkUserRepository();
  const pendingStripeCustomerCleanups =
    new FakePendingStripeCustomerCleanupRepository();
  const transaction = vi.fn(async (fn) =>
    fn({
      clerkEvents,
      deletedClerkUsers,
      pendingStripeCustomerCleanups,
      userRepository,
      stripeCustomerRepository,
    }),
  );

  const createContainer = vi.fn<() => ClerkWebhookRouteContainer>(() => ({
    logger,
    stripe: {
      customers: {
        del: async () => ({ deleted: true }),
      },
    },
    createRateLimiter: () => rateLimiter,
    getClerkUserById: async () => null,
    transaction,
  }));

  const verifyWebhook = vi.fn();
  const processClerkWebhook =
    vi.fn<
      (deps: ClerkWebhookDeps, event: ClerkWebhookEvent) => Promise<void>
    >();
  const deleteStripeCustomer = vi.fn(async () => undefined);

  return {
    POST: createWebhookHandler(
      createContainer,
      verifyWebhook,
      processClerkWebhook,
      deleteStripeCustomer,
    ),
    createContainer,
    verifyWebhook,
    processClerkWebhook,
    deleteStripeCustomer,
    logger,
    userRepository,
    stripeCustomerRepository,
    transaction,
    rateLimiter,
  };
}

describe('POST /api/webhooks/clerk', () => {
  it('requires a replay key at the local Clerk webhook boundary', () => {
    expectTypeOf<ClerkWebhookEvent>().toMatchObjectType<{ eventId: string }>();
  });

  it('still requires an input cast for a standard Web Request', () => {
    const request = new Request('http://localhost/api/webhooks/clerk', {
      method: 'POST',
    });

    // @ts-expect-error Clerk RequestLike currently omits the standard Web Request type.
    const requestLike: Parameters<ClerkVerifyWebhook>[0] = request;

    void requestLike;
  });

  it('returns 400 when signature verification fails', async () => {
    const {
      POST,
      createContainer,
      verifyWebhook,
      processClerkWebhook,
      logger,
    } = createTestDeps();

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
    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]).toMatchObject({
      context: {
        route: '/api/webhooks/clerk',
        error: { name: 'Error' },
      },
      msg: 'Clerk webhook signature verification failed',
    });
  });

  it('returns 200 and received=true when processing succeeds', async () => {
    const { POST, verifyWebhook, processClerkWebhook } = createTestDeps();

    verifyWebhook.mockResolvedValue({
      eventId: 'evt_1',
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
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(verifyWebhook).not.toHaveBeenCalled();
    expect(processClerkWebhook).not.toHaveBeenCalled();
  });

  it('returns 503 when rate limiter throws', async () => {
    const { POST, rateLimiter, verifyWebhook, processClerkWebhook, logger } =
      createTestDeps();

    rateLimiter.limit.mockRejectedValue(new Error('rate limiter down'));

    const res = await POST(
      new Request('http://localhost/api/webhooks/clerk', {
        method: 'POST',
        body: 'raw',
      }),
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: 'Rate limiter unavailable',
    });
    expect(verifyWebhook).not.toHaveBeenCalled();
    expect(processClerkWebhook).not.toHaveBeenCalled();
    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]?.context).toEqual({
      error: { name: 'Error' },
    });
  });

  it('returns 400 when payload validation fails', async () => {
    const { POST, verifyWebhook, processClerkWebhook, logger } =
      createTestDeps();

    verifyWebhook.mockResolvedValue({
      eventId: 'evt_1',
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
    await expect(res.json()).resolves.toEqual({
      error: 'Webhook validation failed',
    });
    expect(logger.errorCalls[0]?.context).toEqual({
      error: {
        name: 'ApplicationError',
        code: 'INVALID_WEBHOOK_PAYLOAD',
      },
    });
  });

  it('returns 500 when processing fails unexpectedly', async () => {
    const { POST, logger, verifyWebhook, processClerkWebhook } =
      createTestDeps();

    verifyWebhook.mockResolvedValue({
      eventId: 'evt_1',
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
    expect(logger.errorCalls).toHaveLength(1);
    expect(logger.errorCalls[0]?.context).toEqual({
      error: { name: 'Error' },
    });
  });
});
