import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FakeLogger,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import {
  createRenewalNoticeCronHandler,
  type RenewalNoticeCronHandlerDependencies,
} from './route-handler';

const successResult = {
  subscriptions: 1,
  queued: 2,
  selected: 2,
  staleUnknown: 0,
};

function createHarness(input?: {
  omitCronSecret?: boolean;
  rateLimiter?: FakeRateLimiter;
  jobError?: Error;
}) {
  const logger = new FakeLogger();
  const rateLimiter = input?.rateLimiter ?? new FakeRateLimiter();
  let jobCalls = 0;
  const dependencies: RenewalNoticeCronHandlerDependencies = {
    cronSecret: input?.omitCronSecret ? undefined : 'test-secret',
    logger,
    rateLimiter,
    run: async () => {
      jobCalls += 1;
      if (input?.jobError) throw input.jobError;
      return successResult;
    },
  };
  return {
    handle: createRenewalNoticeCronHandler(() => dependencies),
    jobCalls: () => jobCalls,
    logger,
    rateLimiter,
  };
}

function authorizedRequest(token = 'test-secret'): Request {
  return new Request('http://localhost/api/cron/send-renewal-notices', {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('renewal notice cron route', () => {
  it('rejects a missing authorization header', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      new Request('http://localhost/api/cron/send-renewal-notices'),
    );

    expect(response.status).toBe(401);
    expect(harness.jobCalls()).toBe(0);
    expect(harness.logger.warnCalls).toEqual([
      {
        context: expect.objectContaining({
          reason: 'missing_authorization_header',
        }),
        msg: 'Unauthorized cron request',
      },
    ]);
  });

  it('fails closed when CRON_SECRET is absent', async () => {
    const harness = createHarness({ omitCronSecret: true });

    const response = await harness.handle(authorizedRequest());

    expect(response.status).toBe(401);
    expect(harness.jobCalls()).toBe(0);
  });

  it.each([
    'wrong-secret',
    'x',
  ])('rejects an invalid bearer token with same or different length: %s', async (token) => {
    const harness = createHarness();

    const response = await harness.handle(authorizedRequest(token));

    expect(response.status).toBe(401);
    expect(harness.jobCalls()).toBe(0);
  });

  it('pins the bearer comparison to equal-length hashes and timingSafeEqual', () => {
    const source = readFileSync(
      new URL('./route-handler.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("createHash('sha256').update(token).digest()");
    expect(source).toContain("createHash('sha256').update(secret).digest()");
    expect(source).toContain('timingSafeEqual(tokenHash, secretHash)');
  });

  it('fails closed when the limiter is unavailable', async () => {
    const harness = createHarness({
      rateLimiter: new FakeRateLimiter(new Error('database unavailable')),
    });

    const response = await harness.handle(authorizedRequest());

    expect(response.status).toBe(503);
    expect(harness.jobCalls()).toBe(0);
    expect(harness.logger.errorCalls).toEqual([
      {
        context: {
          route: '/api/cron/send-renewal-notices',
          error: { name: 'Error' },
        },
        msg: 'Renewal notice cron rate limiter failed',
      },
    ]);
  });

  it('returns retry headers when rate limited', async () => {
    const harness = createHarness({
      rateLimiter: new FakeRateLimiter([
        {
          success: false,
          limit: 5,
          remaining: 0,
          retryAfterSeconds: 30,
        },
      ]),
    });

    const response = await harness.handle(authorizedRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(harness.jobCalls()).toBe(0);
  });

  it('uses the dedicated five-per-minute limiter key', async () => {
    const harness = createHarness();

    await harness.handle(authorizedRequest());

    expect(harness.rateLimiter.inputs).toEqual([
      {
        key: 'cron:send-renewal-notices',
        limit: 5,
        windowMs: 60_000,
      },
    ]);
  });

  it('runs the daily job and returns its result', async () => {
    const harness = createHarness();

    const response = await harness.handle(authorizedRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(successResult);
    expect(harness.jobCalls()).toBe(1);
  });

  it('returns a structured 500 without exposing the job error', async () => {
    const harness = createHarness({
      jobError: new Error('provider detail must stay server-side'),
    });

    const response = await harness.handle(authorizedRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal error' });
    expect(harness.logger.errorCalls).toEqual([
      {
        context: {
          route: '/api/cron/send-renewal-notices',
          error: { name: 'Error' },
        },
        msg: 'Renewal notice cron failed',
      },
    ]);
  });
});
