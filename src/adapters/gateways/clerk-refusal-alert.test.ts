import { describe, expect, it } from 'vitest';
import {
  FakeLogger,
  FakeOperationalAlerts,
} from '@/src/application/test-helpers/fakes';
import { alertWhenClerkRefuses } from './clerk-refusal-alert';
import type { ClerkUserLike } from './clerk-user-provisioner';

// DEBT-503 item 3: Clerk answering 429 means the Backend API allowance every
// signed-in page shares is spent, so the owner hears of it.
describe('alertWhenClerkRefuses', () => {
  const user: ClerkUserLike = { id: 'user_1', emailAddresses: [] };
  const refusal = Object.assign(new Error('Too Many Requests'), {
    status: 429,
  });

  function lookUp(answer: () => Promise<ClerkUserLike | null>) {
    const alerts = new FakeOperationalAlerts();
    const logger = new FakeLogger();
    const lookup = alertWhenClerkRefuses(async () => answer(), {
      alerts: () => alerts,
      logger,
    });
    return { lookup, alerts, logger };
  }

  it('passes an answer through and raises nothing', async () => {
    const { lookup, alerts } = lookUp(async () => user);

    await expect(lookup('user_1')).resolves.toBe(user);
    expect(alerts.raised).toEqual([]);
  });

  it('logs and alerts when Clerk answers 429, then rethrows its error', async () => {
    const { lookup, alerts, logger } = lookUp(async () => {
      throw refusal;
    });

    await expect(lookup('user_1')).rejects.toBe(refusal);
    expect(logger.warnCalls.map(({ context }) => context)).toEqual([
      { event: 'clerk_backend_call_refused', limit: 'clerk' },
    ]);
    expect(alerts.raised).toEqual([
      { kind: 'clerk_backend_calls_refused', count: 1 },
    ]);
  });

  it('rethrows the refusal, and logs, when the alerts cannot be built', async () => {
    const logger = new FakeLogger();
    const lookup = alertWhenClerkRefuses(
      async () => {
        throw refusal;
      },
      {
        alerts: () => {
          throw new Error('alerts unavailable');
        },
        logger,
      },
    );

    await expect(lookup('user_1')).rejects.toBe(refusal);
    expect(logger.errorCalls.map(({ context }) => context)).toEqual([
      expect.objectContaining({ event: 'operational_alert_unavailable' }),
    ]);
  });

  it('rethrows any other failure without an alert', async () => {
    const outage = Object.assign(new Error('Bad Gateway'), { status: 502 });
    const { lookup, alerts } = lookUp(async () => {
      throw outage;
    });

    await expect(lookup('user_1')).rejects.toBe(outage);
    expect(alerts.raised).toEqual([]);
  });
});
