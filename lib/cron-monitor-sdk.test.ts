import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withCronMonitor } from '@/src/adapters/shared/cron-monitor';
import {
  SENTRY_DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
  withoutProcessSession,
} from './sentry-data-collection';

// DEBT-505: a scheduled job's check-ins are proven through the real SDK and
// the server's settings. The transport keeps each envelope, a moment after
// the SDK hands it over as a network send would, and sends nothing.
let sent: string[] = [];
const sending = new Set<Promise<unknown>>();

beforeAll(() => {
  Sentry.init({
    dsn: 'https://public@sentry.invalid/1',
    // CI and Vercel give Sentry a release; set one so every run sees the same.
    release: 'cron-monitor-test',
    environment: 'production',
    integrations: withoutProcessSession,
    dataCollection: SENTRY_DATA_COLLECTION,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    transport: () => ({
      send: (envelope: unknown) => {
        const delivery = new Promise<object>((resolve) => {
          setTimeout(() => {
            sent.push(JSON.stringify(envelope));
            resolve({});
          }, 20);
        });
        sending.add(delivery);
        void delivery.then(() => sending.delete(delivery));
        return delivery;
      },
      flush: async () => {
        await Promise.all(sending);
        return true;
      },
    }),
  });
});

afterAll(async () => {
  await Sentry.close();
});

function sentCheckIns(): Array<Record<string, unknown>> {
  return sent.flatMap((envelope) => {
    const [, items] = JSON.parse(envelope) as [
      unknown,
      Array<[{ type: string }, Record<string, unknown>]>,
    ];
    return items
      .filter(([header]) => header.type === 'check_in')
      .map(([, payload]) => payload);
  });
}

const monitor = {
  slug: 'test-job',
  schedule: '0 9 * * *',
  checkinMarginMinutes: 90,
  maxRuntimeMinutes: 6,
};

describe('withCronMonitor', () => {
  it('checks in when a run starts, with the monitor schedule, and again when it succeeds', async () => {
    sent = [];

    const result = await withCronMonitor(monitor, async () => 'done');

    expect(result).toBe('done');
    const [started, finished] = sentCheckIns();
    expect(started).toMatchObject({
      monitor_slug: 'test-job',
      status: 'in_progress',
      environment: 'production',
      monitor_config: {
        schedule: { type: 'crontab', value: '0 9 * * *' },
        timezone: 'Etc/UTC',
        checkin_margin: 90,
        max_runtime: 6,
        failure_issue_threshold: 1,
        recovery_threshold: 1,
      },
    });
    expect(finished).toMatchObject({
      monitor_slug: 'test-job',
      status: 'ok',
      check_in_id: started?.check_in_id,
    });
    expect(typeof finished?.duration).toBe('number');
  });

  it('checks in an error and rethrows when a run fails', async () => {
    sent = [];
    const failure = new Error('job failed');

    await expect(
      withCronMonitor(monitor, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(sentCheckIns().map((checkIn) => checkIn.status)).toEqual([
      'in_progress',
      'error',
    ]);
  });

  // The check-in goes out before the serverless instance can freeze.
  it('has sent both check-ins by the time it resolves', async () => {
    sent = [];

    await withCronMonitor(monitor, async () => undefined);

    expect(sentCheckIns()).toHaveLength(2);
  });

  it('sends the monitor fields only, whatever the surrounding scope holds', async () => {
    sent = [];

    await Sentry.withIsolationScope(async (scope) => {
      scope.setUser({ id: 'USER-MARKER' });
      scope.setExtra('userId', 'EXTRA-MARKER');
      scope.setTag('route', 'TAG-MARKER');
      await withCronMonitor(monitor, async () => undefined);
    });

    const envelope = sent.join('\n');
    for (const marker of ['USER-MARKER', 'EXTRA-MARKER', 'TAG-MARKER']) {
      expect(envelope).not.toContain(marker);
    }
    const allowed = new Set([
      'check_in_id',
      'monitor_slug',
      'status',
      'duration',
      'release',
      'environment',
      'monitor_config',
      'contexts',
    ]);
    const checkIns = sentCheckIns();
    expect(checkIns).toHaveLength(2);
    for (const checkIn of checkIns) {
      expect(Object.keys(checkIn).filter((key) => !allowed.has(key))).toEqual(
        [],
      );
      expect(Object.keys(checkIn.contexts ?? {})).toEqual(['trace']);
    }
  });
});
