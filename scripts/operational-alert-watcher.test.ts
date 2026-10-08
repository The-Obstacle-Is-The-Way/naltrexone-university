import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { OPERATIONAL_ALERT_DRILL_INTERVAL_MS } from '@/src/adapters/jobs/operational-alert-drill';
import { SEND_RENEWAL_NOTICES_MONITOR } from '@/src/adapters/jobs/send-due-renewal-notices';
import { MemoryIssues } from './github-alert-issues-test-helpers';
import {
  createSentryApi,
  findAlertPathProblems,
  runOperationalAlertWatcher,
  type SentryApi,
  WATCHED,
  WATCHER_ISSUE_TITLE,
  watchOperationalAlerts,
} from './operational-alert-watcher';

const NOW = new Date('2026-10-20T11:37:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

// The DEBT-505 workflow as Sentry returns it, ids included.
function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: WATCHED.workflowId,
    name: 'Operational alerts — email the owner (DEBT-505)',
    enabled: true,
    environment: 'production',
    detectorIds: [WATCHED.errorDetectorId],
    lastTriggered: ago(3 * DAY_MS),
    config: { frequency: 0 },
    triggers: {
      id: '1',
      logicType: 'any-short',
      conditions: [
        {
          id: '2',
          type: 'first_seen_event',
          comparison: true,
          conditionResult: true,
        },
        {
          id: '3',
          type: 'regression_event',
          comparison: true,
          conditionResult: true,
        },
        {
          id: '4',
          type: 'reappeared_event',
          comparison: true,
          conditionResult: true,
        },
      ],
      actions: [],
    },
    actionFilters: [
      {
        id: '5',
        logicType: 'all',
        conditions: [
          {
            id: '6',
            type: 'tagged_event',
            comparison: { key: 'alert.kind', match: 'is' },
            conditionResult: true,
          },
        ],
        actions: [
          {
            id: '7',
            type: 'email',
            integrationId: null,
            data: { fallthroughType: 'ActiveMembers' },
            config: {
              targetType: 'issue_owners',
              targetDisplay: null,
              targetIdentifier: null,
            },
            status: 'active',
          },
        ],
      },
    ],
    ...overrides,
  };
}

function monitor(environment: Record<string, unknown> = {}, overrides = {}) {
  return {
    slug: WATCHED.monitorSlug,
    status: 'active',
    isMuted: false,
    environments: [
      {
        name: 'production',
        status: 'ok',
        isMuted: false,
        lastCheckIn: ago(2 * 60 * 60 * 1000),
        ...environment,
      },
    ],
    ...overrides,
  };
}

function stats(accepted: number, rateLimited = [0, 0]) {
  const days = 30;
  const flat = (total: number) => [
    ...Array.from({ length: days - 1 }, () => 0),
    total,
  ];
  return {
    intervals: Array.from({ length: days }, (_, index) =>
      ago((days - index) * DAY_MS),
    ),
    groups: [
      {
        by: { outcome: 'accepted' },
        totals: { 'sum(quantity)': accepted },
        series: { 'sum(quantity)': flat(accepted) },
      },
      {
        by: { outcome: 'rate_limited' },
        totals: { 'sum(quantity)': rateLimited.reduce((a, b) => a + b, 0) },
        series: {
          'sum(quantity)': [
            ...Array.from({ length: days - 2 }, () => 0),
            ...rateLimited,
          ],
        },
      },
    ],
  };
}

type Responses = Partial<
  Record<
    'monitor' | 'workflow' | 'drills' | 'stats',
    { status: number; body: unknown }
  >
>;

// A Sentry API answering each watched read; any read is overridable.
function sentry(overrides: Responses = {}) {
  const reads: Array<{ path: string; query: Record<string, string> }> = [];
  const responses = {
    monitor: { status: 200, body: monitor() },
    workflow: { status: 200, body: workflow() },
    drills: { status: 200, body: { data: [{ 'count()': 1 }] } },
    stats: { status: 200, body: stats(1_200) },
    ...overrides,
  };
  const api: SentryApi = async (path, query = {}) => {
    reads.push({ path, query });
    if (path === `monitors/${WATCHED.monitorSlug}/`) return responses.monitor;
    if (path === `workflows/${WATCHED.workflowId}/`) return responses.workflow;
    if (path === 'events/') return responses.drills;
    if (path === 'stats_v2/') return responses.stats;
    return { status: 404, body: null };
  };
  return { api, reads };
}

describe('alert path problems', () => {
  it('finds none when the job checks in, the workflow is as set up, a drill arrived and quota remains', async () => {
    expect(await findAlertPathProblems(sentry().api, NOW)).toEqual([]);
  });

  it('reports a monitor that does not exist yet', async () => {
    const { api } = sentry({ monitor: { status: 404, body: null } });

    expect(await findAlertPathProblems(api, NOW)).toEqual([
      expect.stringContaining('has no cron monitor in Sentry'),
    ]);
  });

  it('reports a job whose last production check-in is more than a day old', async () => {
    const lastCheckIn = ago(25 * 60 * 60 * 1000 + 60_000);
    const { api } = sentry({
      monitor: { status: 200, body: monitor({ lastCheckIn }) },
    });

    expect(await findAlertPathProblems(api, NOW)).toEqual([
      expect.stringContaining(`last checked in at ${lastCheckIn}`),
    ]);
  });

  it('reports a job that has never checked in from production', async () => {
    const { api } = sentry({
      monitor: { status: 200, body: monitor({ name: 'preview' }) },
    });

    expect(await findAlertPathProblems(api, NOW)).toEqual([
      expect.stringContaining('never checked in from production'),
    ]);
  });

  it.each(['error', 'missed_checkin', 'timeout'])(
    'reports a last run whose status is %s',
    async (status) => {
      const { api } = sentry({
        monitor: { status: 200, body: monitor({ status }) },
      });

      expect(await findAlertPathProblems(api, NOW)).toEqual([
        expect.stringContaining(`last run's status is \`${status}\``),
      ]);
    },
  );

  it('reports a monitor that is disabled or muted', async () => {
    const disabled = sentry({
      monitor: { status: 200, body: monitor({}, { status: 'disabled' }) },
    });
    const muted = sentry({
      monitor: { status: 200, body: monitor({ isMuted: true }) },
    });

    expect(await findAlertPathProblems(disabled.api, NOW)).toEqual([
      expect.stringContaining('monitor is disabled or muted'),
    ]);
    expect(await findAlertPathProblems(muted.api, NOW)).toEqual([
      expect.stringContaining('monitor is disabled or muted'),
    ]);
  });

  it('reports a disabled workflow', async () => {
    const { api } = sentry({
      workflow: { status: 200, body: workflow({ enabled: false }) },
    });

    expect(await findAlertPathProblems(api, NOW)).toEqual([
      expect.stringContaining('workflow is disabled'),
    ]);
  });

  it('reports a workflow whose filter or email action changed, naming the part', async () => {
    const changed = workflow();
    const action = changed.actionFilters[0]?.actions[0];
    if (action) action.status = 'inactive';
    const { api } = sentry({ workflow: { status: 200, body: changed } });

    expect(await findAlertPathProblems(api, NOW)).toEqual([
      expect.stringContaining('workflow changed (`actionFilters`)'),
    ]);
  });

  it('accepts the workflow whatever its ids and condition order', async () => {
    const reordered = workflow();
    reordered.triggers.conditions.reverse();
    reordered.triggers.conditions.forEach((condition, index) => {
      condition.id = `new-${index}`;
    });
    const { api } = sentry({ workflow: { status: 200, body: reordered } });

    expect(await findAlertPathProblems(api, NOW)).toEqual([]);
  });

  it('reports a workflow that has sent nothing in 32 days', async () => {
    const quiet = sentry({
      workflow: {
        status: 200,
        body: workflow({ lastTriggered: ago(32 * DAY_MS + 60_000) }),
      },
    });
    const never = sentry({
      workflow: { status: 200, body: workflow({ lastTriggered: null }) },
    });

    for (const { api } of [quiet, never]) {
      expect(await findAlertPathProblems(api, NOW)).toEqual([
        expect.stringContaining('has sent nothing in 32 days'),
      ]);
    }
  });

  it('reports no drill from production in 32 days, asking Sentry for exactly that', async () => {
    const { api, reads } = sentry({
      drills: { status: 200, body: { data: [{ 'count()': 0 }] } },
    });

    expect(await findAlertPathProblems(api, NOW)).toEqual([
      expect.stringContaining('No alert drill reached Sentry'),
    ]);
    expect(reads.find((read) => read.path === 'events/')?.query).toEqual({
      dataset: 'errors',
      field: 'count()',
      query: 'alert.kind:operational_alert_drill',
      project: WATCHED.serverProjectId,
      environment: 'production',
      statsPeriod: '32d',
    });
  });

  it('reports errors past 80% of the monthly quota, without a count that would change daily', async () => {
    const { api } = sentry({ stats: { status: 200, body: stats(4_000) } });

    const problems = await findAlertPathProblems(api, NOW);

    expect(problems).toEqual([expect.stringContaining('80%')]);
    expect(problems[0]).not.toContain('4000');
    expect(problems[0]).not.toContain('4,000');
  });

  it('reports error events Sentry dropped in the last two days', async () => {
    const { api } = sentry({
      stats: { status: 200, body: stats(1_200, [0, 3]) },
    });

    expect(await findAlertPathProblems(api, NOW)).toEqual([
      expect.stringContaining('dropped error events'),
    ]);
  });

  it('ignores drops older than two days', async () => {
    const old = stats(1_200);
    const limited = old.groups[1]?.series['sum(quantity)'];
    if (limited) limited[0] = 5;
    const { api } = sentry({ stats: { status: 200, body: old } });

    expect(await findAlertPathProblems(api, NOW)).toEqual([]);
  });

  // A revoked token or an API change must surface, never read as healthy.
  it('reports each read that fails, and still makes the others', async () => {
    const { api, reads } = sentry({
      monitor: { status: 401, body: null },
      stats: { status: 200, body: { unexpected: true } },
    });

    expect(await findAlertPathProblems(api, NOW)).toEqual([
      expect.stringContaining(
        'could not read the cron monitor from Sentry (HTTP 401)',
      ),
      expect.stringContaining('could not read the error usage'),
    ]);
    expect(reads).toHaveLength(4);
  });

  it('reports a read that throws', async () => {
    const api: SentryApi = async () => {
      throw new Error('network down');
    };

    const problems = await findAlertPathProblems(api, NOW);

    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).not.toContain('network down');
  });
});

describe('the watcher issue', () => {
  it('opens one issue listing each problem and what to do', async () => {
    const issues = new MemoryIssues();
    const { api } = sentry({
      workflow: { status: 200, body: workflow({ enabled: false }) },
    });

    expect(
      await watchOperationalAlerts({ token: 'token', api, issues, now: NOW }),
    ).toBe('created');
    expect(issues.issues).toHaveLength(1);
    expect(issues.issues[0]?.title).toBe(WATCHER_ISSUE_TITLE);
    expect(issues.issues[0]?.body).toContain('workflow is disabled');
    expect(issues.issues[0]?.body).toContain('docs/dev/logging.md');
  });

  it('keeps the same description while the findings stay the same, whatever the counts', async () => {
    const issues = new MemoryIssues();
    const { api } = sentry({ stats: { status: 200, body: stats(4_100) } });
    await watchOperationalAlerts({ token: 'token', api, issues, now: NOW });
    const next = sentry({ stats: { status: 200, body: stats(4_300) } });

    expect(
      await watchOperationalAlerts({
        token: 'token',
        api: next.api,
        issues,
        now: NOW,
      }),
    ).toBe('unchanged');
  });

  it('closes the issue once every check passes', async () => {
    const issues = new MemoryIssues();
    await issues.create(WATCHER_ISSUE_TITLE, 'old problem');

    expect(
      await watchOperationalAlerts({
        token: 'token',
        api: sentry().api,
        issues,
        now: NOW,
      }),
    ).toBe('closed');
  });

  it('reports itself as not configured, without reading Sentry, when the token is missing', async () => {
    const issues = new MemoryIssues();
    const { api, reads } = sentry();

    await watchOperationalAlerts({ token: undefined, api, issues, now: NOW });

    expect(reads).toEqual([]);
    expect(issues.issues[0]?.body).toContain('SENTRY_WATCHER_TOKEN');
  });
});

describe('the Sentry API', () => {
  it('reads the organization endpoint with the token, a query and a time limit', async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const api = createSentryApi('secret-token', async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    expect(await api('stats_v2/', { category: 'error' })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(requests[0]?.url).toBe(
      `https://sentry.io/api/0/organizations/${WATCHED.organization}/stats_v2/?category=error`,
    );
    expect(new Headers(requests[0]?.init?.headers).get('authorization')).toBe(
      'Bearer secret-token',
    );
    expect(requests[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns the status without a body for a failed read', async () => {
    const api = createSentryApi(
      'secret-token',
      async () => new Response('denied', { status: 403 }),
    );

    expect(await api('monitors/x/')).toEqual({ status: 403, body: null });
  });
});

describe('running the watcher', () => {
  it('logs the outcome and exits zero once the issue is in step', async () => {
    const lines: string[] = [];
    const output = {
      log: (line: string) => lines.push(line),
      error: (line: string) => lines.push(line),
    };

    expect(
      await runOperationalAlertWatcher(async () => 'created', output),
    ).toBe(0);
    expect(lines).toEqual(['Operational alert watcher: created']);
  });

  it('exits nonzero without details when the issue cannot be updated', async () => {
    const lines: string[] = [];
    const output = {
      log: (line: string) => lines.push(line),
      error: (line: string) => lines.push(line),
    };

    expect(
      await runOperationalAlertWatcher(async () => {
        throw new Error('secret-token rejected');
      }, output),
    ).toBe(1);
    expect(lines.join('\n')).not.toContain('secret-token');
  });

  it('watches the renewal job and drill this repository runs', () => {
    expect(WATCHED.monitorSlug).toBe(SEND_RENEWAL_NOTICES_MONITOR.slug);
    // A drill goes out each 30-day cycle; 32 days allows a late cron and a
    // retry.
    expect(OPERATIONAL_ALERT_DRILL_INTERVAL_MS).toBe(30 * DAY_MS);
  });

  it('runs daily after the renewal job, with the token only in its own step', () => {
    const workflowFile = parse(
      readFileSync('.github/workflows/operational-alert-watcher.yml', 'utf8'),
    );

    expect(workflowFile.on.schedule).toEqual([{ cron: '37 11 * * *' }]);
    expect(workflowFile.permissions).toEqual({ contents: 'read' });
    const job = workflowFile.jobs.watch;
    expect(job.permissions).toEqual({ contents: 'read', issues: 'write' });
    const steps = job.steps as Array<{
      env?: Record<string, string>;
      run?: string;
    }>;
    const withToken = steps.filter((step) =>
      JSON.stringify(step).includes('SENTRY_WATCHER_TOKEN'),
    );
    expect(withToken).toEqual([steps.at(-1)]);
    expect(steps.at(-1)?.env?.SENTRY_WATCHER_TOKEN).toBe(
      `\${{ secrets.SENTRY_WATCHER_TOKEN }}`,
    );
    expect(steps.at(-1)?.run).toBe(
      'pnpm exec tsx scripts/operational-alert-watcher.ts',
    );
  });
});
