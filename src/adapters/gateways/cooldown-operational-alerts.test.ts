import { describe, expect, it } from 'vitest';
import type { OperationalAlert } from '@/src/application/ports/operational-alerts';
import {
  FakeLogger,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import type { OperationalAlertEvent } from '../shared/operational-alert-events';
import {
  CooldownOperationalAlerts,
  LocalAlertCooldown,
  OPERATIONAL_ALERT_COOLDOWN_MS,
} from './cooldown-operational-alerts';

// DEBT-505: at most one event per kind per six-hour window across instances,
// through the shared limiter; and when that limiter fails, at most one per
// kind per instance per six hours, through the in-process cooldown.

const missedDeadline: OperationalAlert = {
  kind: 'renewal_notice_deadline_missed',
  count: 3,
};

function allowed() {
  return { success: true, limit: 1, remaining: 0, retryAfterSeconds: 0 };
}

function taken() {
  return { success: false, limit: 1, remaining: 0, retryAfterSeconds: 60 };
}

function setup(
  limiterResults: ConstructorParameters<typeof FakeRateLimiter>[0] = [],
  options: { failSend?: Error } = {},
) {
  const sent: OperationalAlertEvent[] = [];
  const rateLimiter = new FakeRateLimiter(limiterResults);
  const logger = new FakeLogger();
  const clock = { now: new Date('2026-10-08T01:00:00Z') };
  const localCooldown = new LocalAlertCooldown();
  const alerts = new CooldownOperationalAlerts({
    rateLimiter,
    send: async (event) => {
      if (options.failSend) throw options.failSend;
      sent.push(event);
    },
    logger,
    now: () => clock.now,
    localCooldown,
    keyPrefix: 'operational-alert:',
  });
  const advance = (ms: number) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };
  return { alerts, sent, rateLimiter, logger, advance };
}

describe('CooldownOperationalAlerts', () => {
  it('sends the first alert of a kind once it holds the shared cooldown', async () => {
    const { alerts, sent, rateLimiter } = setup([allowed()]);

    await alerts.raise(missedDeadline);

    expect(rateLimiter.inputs).toEqual([
      {
        key: 'operational-alert:renewal_notice_deadline_missed',
        limit: 1,
        windowMs: OPERATIONAL_ALERT_COOLDOWN_MS,
      },
    ]);
    expect(sent).toEqual([
      {
        kind: 'renewal_notice_deadline_missed',
        count: 3,
        sharedCooldown: 'held',
      },
    ]);
  });

  it('sends nothing when another instance already took the shared cooldown', async () => {
    const { alerts, sent } = setup([taken()]);

    await alerts.raise(missedDeadline);

    expect(sent).toEqual([]);
  });

  it('asks the shared cooldown at most once per kind per instance in six hours', async () => {
    const { alerts, sent, rateLimiter, advance } = setup([
      allowed(),
      allowed(),
    ]);

    await alerts.raise(missedDeadline);
    advance(OPERATIONAL_ALERT_COOLDOWN_MS - 1);
    await alerts.raise(missedDeadline);
    expect(rateLimiter.inputs).toHaveLength(1);

    advance(1);
    await alerts.raise(missedDeadline);
    expect(rateLimiter.inputs).toHaveLength(2);
    expect(sent).toHaveLength(2);
  });

  it('keeps each kind on its own cooldown', async () => {
    const { alerts, sent } = setup([allowed(), allowed()]);

    await alerts.raise(missedDeadline);
    await alerts.raise({ kind: 'renewal_notice_outcome_unknown', count: 1 });

    expect(sent.map((event) => event.kind)).toEqual([
      'renewal_notice_deadline_missed',
      'renewal_notice_outcome_unknown',
    ]);
  });

  // BUG-323's alert reports the same database failing, so suppressing the
  // event when the limiter fails would silence it.
  it('still sends, tagged, when the shared cooldown is unavailable, and only once per instance in six hours', async () => {
    const { alerts, sent, rateLimiter, logger } = setup([
      new Error('connection refused'),
    ]);

    await alerts.raise({ kind: 'clerk_backend_call_limiter_failed', count: 1 });
    await alerts.raise({ kind: 'clerk_backend_call_limiter_failed', count: 1 });

    expect(sent).toEqual([
      {
        kind: 'clerk_backend_call_limiter_failed',
        count: 1,
        sharedCooldown: 'unavailable',
      },
    ]);
    expect(rateLimiter.inputs).toHaveLength(1);
    expect(logger.warnCalls).toEqual([
      {
        context: {
          alertKind: 'clerk_backend_call_limiter_failed',
          error: expect.objectContaining({ name: 'Error' }),
        },
        msg: 'operational_alert_shared_cooldown_unavailable',
      },
    ]);
  });

  it('resolves, and logs the kind only, when the event cannot be sent', async () => {
    const { alerts, logger } = setup([allowed()], {
      failSend: new Error('transport down'),
    });

    await expect(alerts.raise(missedDeadline)).resolves.toBeUndefined();

    expect(logger.errorCalls).toEqual([
      {
        context: {
          alertKind: 'renewal_notice_deadline_missed',
          error: expect.objectContaining({ name: 'Error' }),
        },
        msg: 'operational_alert_send_failed',
      },
    ]);
  });
});
