import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SEND_RENEWAL_NOTICES_MAX_DURATION_SECONDS,
  SEND_RENEWAL_NOTICES_MONITOR,
} from '@/src/adapters/jobs/send-due-renewal-notices';
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
  anniversaries: 0,
  expiredSetupOperationsPruned: 3,
  queued: 2,
  queueFailures: 0,
  rejectedNotices: 0,
  selected: 2,
  staleUnknown: 0,
  dispatchFailures: 0,
  durationMs: 250,
  alertDrill: 'not_due',
  scheduledChecks: 'running',
} as const;

function createHarness(input?: {
  omitCronSecret?: boolean;
  cronSecret?: string;
  rateLimiter?: FakeRateLimiter;
  jobError?: Error;
}) {
  const logger = new FakeLogger();
  const rateLimiter = input?.rateLimiter ?? new FakeRateLimiter();
  let rateLimiterFactoryCalls = 0;
  let jobCalls = 0;
  const monitored: Array<'ok' | 'error'> = [];
  const dependencies: RenewalNoticeCronHandlerDependencies = {
    cronSecret: input?.omitCronSecret
      ? undefined
      : (input?.cronSecret ?? 'test-secret'),
    logger,
    createRateLimiter: () => {
      rateLimiterFactoryCalls += 1;
      return rateLimiter;
    },
    run: async () => {
      jobCalls += 1;
      if (input?.jobError) throw input.jobError;
      return successResult;
    },
    // Records each run the cron monitor saw and how it ended.
    monitor: async (run) => {
      try {
        const result = await run();
        monitored.push('ok');
        return result;
      } catch (error) {
        monitored.push('error');
        throw error;
      }
    },
  };
  return {
    handle: createRenewalNoticeCronHandler(() => dependencies),
    jobCalls: () => jobCalls,
    monitored,
    logger,
    rateLimiter,
    rateLimiterFactoryCalls: () => rateLimiterFactoryCalls,
  };
}

function authorizedRequest(token = 'test-secret'): Request {
  return new Request('http://localhost/api/cron/send-renewal-notices', {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('renewal notice cron route', () => {
  it('pins the function duration to the bounded provider-call budget', () => {
    const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');

    expect(source).toContain(
      `export const maxDuration = ${SEND_RENEWAL_NOTICES_MAX_DURATION_SECONDS}`,
    );
  });

  // DEBT-505: the cron monitor expects a check-in on the schedule Vercel
  // runs, and counts a run as timed out only after the function would stop.
  it('monitors the job on the schedule vercel.json gives it', () => {
    const vercel = JSON.parse(
      readFileSync(new URL('../../../../vercel.json', import.meta.url), 'utf8'),
    ) as { crons: Array<{ path: string; schedule: string }> };

    expect(
      vercel.crons.find(
        (cron) => cron.path === '/api/cron/send-renewal-notices',
      )?.schedule,
    ).toBe(SEND_RENEWAL_NOTICES_MONITOR.schedule);
    expect(SEND_RENEWAL_NOTICES_MONITOR.maxRuntimeMinutes * 60).toBeGreaterThan(
      SEND_RENEWAL_NOTICES_MAX_DURATION_SECONDS,
    );
  });

  it('uses the stable notice version independently of checkout consent revisions', () => {
    const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
    expect(source).toContain(
      'disclosureVersion: ANNUAL_RENEWAL_NOTICE_VERSION',
    );
    expect(source).not.toContain(
      'disclosureVersion: PRICING_DATA.annual.disclosureVersion',
    );
  });

  it('rejects a missing authorization header', async () => {
    const harness = createHarness();

    const response = await harness.handle(
      new Request('http://localhost/api/cron/send-renewal-notices'),
    );

    expect(response.status).toBe(401);
    expect(harness.jobCalls()).toBe(0);
    expect(harness.rateLimiterFactoryCalls()).toBe(0);
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
    expect(harness.rateLimiterFactoryCalls()).toBe(0);
  });

  it.each([
    {
      label: 'same-length wrong token',
      authorization: 'Bearer wrong-secre',
      reason: 'invalid_token',
    },
    {
      label: 'different-length wrong token',
      authorization: 'Bearer x',
      reason: 'invalid_token',
    },
    {
      label: 'non-Bearer scheme',
      authorization: 'Basic test-secret',
      reason: 'malformed_authorization_header',
    },
    {
      label: 'missing token separator',
      authorization: 'Bearer',
      reason: 'malformed_authorization_header',
    },
  ])('rejects $label', async ({ authorization, reason }) => {
    const harness = createHarness();
    const response = await harness.handle(
      new Request('http://localhost/api/cron/send-renewal-notices', {
        headers: { authorization },
      }),
    );

    expect(response.status).toBe(401);
    expect(harness.jobCalls()).toBe(0);
    expect(harness.rateLimiterFactoryCalls()).toBe(0);
    expect(harness.logger.warnCalls).toEqual([
      {
        context: {
          route: '/api/cron/send-renewal-notices',
          reason,
        },
        msg: 'Unauthorized cron request',
      },
    ]);
  });

  it('rejects a whitespace-tainted secret even when the bearer token matches', async () => {
    const harness = createHarness({ cronSecret: 'secret with spaces' });

    const response = await harness.handle(
      authorizedRequest('secret with spaces'),
    );

    expect(response.status).toBe(401);
    expect(harness.jobCalls()).toBe(0);
    expect(harness.rateLimiterFactoryCalls()).toBe(0);
    expect(harness.logger.errorCalls).toEqual([
      {
        context: { route: '/api/cron/send-renewal-notices' },
        msg: 'CRON_SECRET is not header-safe',
      },
    ]);
  });

  it.each([
    ['leading whitespace', ' secret'],
    ['trailing whitespace', 'secret '],
    ['line feed', 'secret\n'],
    ['tab', 'sec\tret'],
    ['NUL', 'sec\0ret'],
    ['DEL', 'sec\u007fret'],
    ['non-ASCII', 'secret\u0100'],
  ])(
    'fails closed with a value-free configuration error for %s',
    async (_label, cronSecret) => {
      const harness = createHarness({ cronSecret });

      const response = await harness.handle(authorizedRequest());

      expect(response.status).toBe(401);
      expect(harness.jobCalls()).toBe(0);
      expect(harness.rateLimiterFactoryCalls()).toBe(0);
      expect(harness.logger.errorCalls).toEqual([
        {
          context: { route: '/api/cron/send-renewal-notices' },
          msg: 'CRON_SECRET is not header-safe',
        },
      ]);
    },
  );

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

    expect(harness.rateLimiterFactoryCalls()).toBe(1);
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

  it('runs the job inside the cron monitor, so each run checks in', async () => {
    const harness = createHarness();

    await harness.handle(authorizedRequest());

    expect(harness.monitored).toEqual(['ok']);
  });

  it('reports a failed run to the cron monitor', async () => {
    const harness = createHarness({ jobError: new Error('job failed') });

    await harness.handle(authorizedRequest());

    expect(harness.monitored).toEqual(['error']);
  });

  // A request the route turns away is not a run: it must not check in, or a
  // caller without the secret could make a stopped job look alive.
  it('does not check in for a request it rejects or rate-limits', async () => {
    const rejected = createHarness();
    const limited = createHarness({
      rateLimiter: new FakeRateLimiter([
        { success: false, limit: 5, remaining: 0, retryAfterSeconds: 30 },
      ]),
    });

    await rejected.handle(authorizedRequest('wrong-secret'));
    await limited.handle(authorizedRequest());

    expect(rejected.monitored).toEqual([]);
    expect(limited.monitored).toEqual([]);
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
