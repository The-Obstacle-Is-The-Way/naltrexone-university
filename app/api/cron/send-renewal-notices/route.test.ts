import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimiter } from '@/src/application/ports';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';

const { createContainer, sendDueRenewalNotices } = vi.hoisted(() => ({
  createContainer: vi.fn(),
  sendDueRenewalNotices: vi.fn(),
}));

vi.mock('@/lib/container', () => ({ createContainer }));
vi.mock('@/src/adapters/jobs/send-due-renewal-notices', async (original) => ({
  ...(await original<
    typeof import('@/src/adapters/jobs/send-due-renewal-notices')
  >()),
  sendDueRenewalNotices,
}));

import { GET, POST } from './route';

function createMockContainer(input?: {
  omitCronSecret?: boolean;
  rateLimiter?: RateLimiter;
}) {
  const rows = [
    {
      externalSubscriptionId: 'sub_annual_123',
      renewalAt: new Date('2026-09-06T12:00:00.000Z'),
      destination: 'subscriber@example.com',
    },
  ];
  const limit = vi.fn(async () => rows);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  const select = vi.fn(() => ({ from }));
  const logger = { warn: vi.fn(), error: vi.fn() };
  return {
    env: {
      CRON_SECRET: input?.omitCronSecret ? undefined : 'test-secret',
      NEXT_PUBLIC_APP_URL: 'https://addictionboards.com',
      NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_annual',
    },
    logger,
    db: { select },
    createRateLimiter: () => input?.rateLimiter ?? new FakeRateLimiter(),
    createSendDueRenewalNoticesUseCase: vi.fn(() => ({ execute: vi.fn() })),
    query: { from, innerJoin, where, orderBy, limit, rows, select },
  };
}

describe('renewal notice cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendDueRenewalNotices.mockResolvedValue({
      subscriptions: 0,
      queued: 0,
      selected: 0,
      staleUnknown: 0,
    });
  });

  it('rejects a missing authorization header', async () => {
    const container = createMockContainer();
    createContainer.mockReturnValue(container);

    const response = await GET(
      new Request('http://localhost/api/cron/send-renewal-notices'),
    );

    expect(response.status).toBe(401);
    expect(sendDueRenewalNotices).not.toHaveBeenCalled();
    expect(container.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'missing_authorization_header' }),
      'Unauthorized cron request',
    );
  });

  it('fails closed when CRON_SECRET is absent', async () => {
    const container = createMockContainer({ omitCronSecret: true });
    createContainer.mockReturnValue(container);

    const response = await POST(
      new Request('http://localhost/api/cron/send-renewal-notices', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
      }),
    );

    expect(response.status).toBe(401);
    expect(sendDueRenewalNotices).not.toHaveBeenCalled();
  });

  it('uses a constant-time check to reject a wrong bearer token', async () => {
    const container = createMockContainer();
    createContainer.mockReturnValue(container);

    const response = await GET(
      new Request('http://localhost/api/cron/send-renewal-notices', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );

    expect(response.status).toBe(401);
    expect(sendDueRenewalNotices).not.toHaveBeenCalled();
  });

  it('pins the bearer comparison to equal-length hashes and timingSafeEqual', () => {
    const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');

    expect(source).toContain("createHash('sha256').update(token).digest()");
    expect(source).toContain("createHash('sha256').update(secret).digest()");
    expect(source).toContain('timingSafeEqual(tokenHash, secretHash)');
  });

  it('pins the production source query to active, renewing annual rows in the supplied window', () => {
    const source = readFileSync(
      new URL('./route.ts', import.meta.url),
      'utf8',
    ).replaceAll(/\s+/g, ' ');

    expect(source).toContain("eq(stripeSubscriptions.status, 'active')");
    expect(source).toContain(
      'eq( stripeSubscriptions.priceId, container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL, )',
    );
    expect(source).toContain(
      'eq(stripeSubscriptions.cancelAtPeriodEnd, false)',
    );
    expect(source).toContain(
      'gte(stripeSubscriptions.currentPeriodEnd, renewalAtOrAfter)',
    );
    expect(source).toContain(
      'lte(stripeSubscriptions.currentPeriodEnd, renewalAtOrBefore)',
    );
  });

  it('fails closed when the limiter is unavailable', async () => {
    const rateLimiter: RateLimiter = {
      limit: async () => {
        throw new Error('database unavailable');
      },
      pruneExpiredWindows: async () => 0,
    };
    const container = createMockContainer({ rateLimiter });
    createContainer.mockReturnValue(container);

    const response = await GET(
      new Request('http://localhost/api/cron/send-renewal-notices', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );

    expect(response.status).toBe(503);
    expect(sendDueRenewalNotices).not.toHaveBeenCalled();
    expect(container.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/api/cron/send-renewal-notices' }),
      'Renewal notice cron rate limiter failed',
    );
  });

  it('returns retry headers when rate limited', async () => {
    const rateLimiter: RateLimiter = {
      limit: async () => ({
        success: false,
        limit: 5,
        remaining: 0,
        retryAfterSeconds: 30,
      }),
      pruneExpiredWindows: async () => 0,
    };
    createContainer.mockReturnValue(createMockContainer({ rateLimiter }));

    const response = await GET(
      new Request('http://localhost/api/cron/send-renewal-notices', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(sendDueRenewalNotices).not.toHaveBeenCalled();
  });

  it('uses the dedicated five-per-minute limiter key', async () => {
    const rateLimiter = new FakeRateLimiter();
    createContainer.mockReturnValue(createMockContainer({ rateLimiter }));

    await GET(
      new Request('http://localhost/api/cron/send-renewal-notices', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );

    expect(rateLimiter.inputs).toEqual([
      {
        key: 'cron:send-renewal-notices',
        limit: 5,
        windowMs: 60_000,
      },
    ]);
  });

  it('runs the daily job and supplies the active annual subscription query', async () => {
    const container = createMockContainer();
    createContainer.mockReturnValue(container);
    sendDueRenewalNotices.mockImplementationOnce(async (_input, deps) => {
      const subscriptions = await deps.listAnnualSubscriptionsDue({
        renewalAtOrAfter: new Date('2026-08-22T12:00:00.000Z'),
        renewalAtOrBefore: new Date('2026-09-21T12:00:00.000Z'),
        limit: 100,
      });
      expect(subscriptions).toEqual(container.query.rows);
      return {
        subscriptions: 1,
        queued: 2,
        selected: 2,
        staleUnknown: 0,
      };
    });

    const response = await GET(
      new Request('http://localhost/api/cron/send-renewal-notices', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      subscriptions: 1,
      queued: 2,
      selected: 2,
      staleUnknown: 0,
    });
    expect(sendDueRenewalNotices).toHaveBeenCalledWith(
      { limit: 100 },
      expect.objectContaining({
        annualPlan: expect.objectContaining({
          amountCents: 19900,
          disclosureVersion: '2026-08-05',
        }),
      }),
    );
    expect(container.query.select).toHaveBeenCalledWith(
      expect.objectContaining({
        externalSubscriptionId: expect.anything(),
        renewalAt: expect.anything(),
        destination: expect.anything(),
      }),
    );
    expect(container.query.limit).toHaveBeenCalledWith(100);
  });

  it('returns a structured 500 without exposing the job error', async () => {
    const container = createMockContainer();
    createContainer.mockReturnValue(container);
    sendDueRenewalNotices.mockRejectedValueOnce(
      new Error('provider detail must stay server-side'),
    );

    const response = await GET(
      new Request('http://localhost/api/cron/send-renewal-notices', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal error' });
    expect(container.logger.error).toHaveBeenCalledWith(
      {
        route: '/api/cron/send-renewal-notices',
        error: { name: 'Error' },
      },
      'Renewal notice cron failed',
    );
  });
});
