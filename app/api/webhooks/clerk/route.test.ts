import { describe, expect, it, vi } from 'vitest';
import type { ClerkWebhookRouteContainer } from '@/app/api/webhooks/clerk/handler';
import { createWebhookHandler } from '@/app/api/webhooks/clerk/handler';
import type { ClerkWebhookDeps } from '@/src/adapters/controllers/clerk-webhook-controller';

function createTestDeps() {
  const loggerError = vi.fn();

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
    logger: { error: loggerError },
    createUserRepository,
    createStripeCustomerRepository,
  }));

  const verifyWebhook = vi.fn();
  const processClerkWebhook =
    vi.fn<(deps: ClerkWebhookDeps) => Promise<void>>();
  const cancelStripeCustomerSubscriptions = vi.fn(async () => undefined);

  return {
    POST: createWebhookHandler(
      createContainer,
      verifyWebhook,
      processClerkWebhook as never,
      cancelStripeCustomerSubscriptions,
    ),
    createContainer,
    verifyWebhook,
    processClerkWebhook,
    cancelStripeCustomerSubscriptions,
    loggerError,
    createUserRepository,
    createStripeCustomerRepository,
    userRepository,
    stripeCustomerRepository,
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
