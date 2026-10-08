import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { OPERATIONAL_ALERT_DRILL_INTERVAL_MS } from '@/src/adapters/jobs/operational-alert-drill';
import { SEND_RENEWAL_NOTICES_MONITOR } from '@/src/adapters/jobs/send-due-renewal-notices';
import { MemoryIssues } from './github-alert-issues-test-helpers';
import {
  createSentryApi,
  DRILL_WINDOW_DAYS,
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

const outcome = (name: string, total: number) => ({
  by: { outcome: name },
  totals: { 'sum(quantity)': total },
});

// The organization's accepted errors over 30 days.
const usage = (accepted: number) => ({
  groups: [outcome('accepted', accepted), outcome('filtered', 4_000)],
});

// The server project's dropped errors over two days.
const drops = (rateLimited: number) => ({
  groups: [outcome('accepted', 12), outcome('rate_limited', rateLimited)],
});

type Responses = Partial<
  Record<
    'monitor' | 'workflow' | 'usage' | 'drops',
    { status: number; body: unknown }
  >
>;

// A Sentry API answering each watched read; any read is overridable.
function sentry(overrides: Responses = {}) {
  const reads: Array<{ path: string; query: Record<string, string> }> = [];
  const responses = {
    monitor: { status: 200, body: monitor() },
    workflow: { status: 200, body: workflow() },
    usage: { status: 200, body: usage(1_200) },
    drops: { status: 200, body: drops(0) },
    ...overrides,
  };
  const api: SentryApi = async (path, query = {}) => {
    reads.push({ path, query });
    if (path === `monitors/${WATCHED.monitorSlug}/`) return responses.monitor;
    if (path === `workflows/${WATCHED.workflowId}/`) return responses.workflow;
    if (path === 'stats_v2/')
      return query.project ? responses.drops : responses.usage;
    return { status: 404, body: null };
  };
  return { api, reads };
}

describe('alert path problems', () => {
  it('finds none when the job checks in, the workflow is as set up and has sent lately, and quota remains', async () => {
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

  // The drill's own event is kept for 30 days only, so the workflow's last
  // send carries the 32-day check, and the issue says where to look.
  it('points a silent workflow at the drill', async () => {
    const { api } = sentry({
      workflow: { status: 200, body: workflow({ lastTriggered: null }) },
    });

    expect(await findAlertPathProblems(api, NOW)).toEqual([
      expect.stringContaining('alert.kind:operational_alert_drill'),
    ]);
  });

  it('allows a drill cycle, a late cron and a retry before calling the workflow silent', () => {
    expect(DRILL_WINDOW_DAYS * DAY_MS).toBeGreaterThan(
      OPERATIONAL_ALERT_DRILL_INTERVAL_MS + DAY_MS,
    );
  });

  it('ignores a field Sentry adds to the workflow later', async () => {
    const extended = workflow();
    const action = extended.actionFilters[0]?.actions[0];
    if (action)
      Object.assign(action.config, { targetDisplay: 'Owner', newField: 1 });
    const { api } = sentry({ workflow: { status: 200, body: extended } });

    expect(await findAlertPathProblems(api, NOW)).toEqual([]);
  });

  it('reports errors past 80% of the monthly quota, without a count that would change daily', async () => {
    const { api, reads } = sentry({
      usage: { status: 200, body: usage(4_000) },
    });

    const problems = await findAlertPathProblems(api, NOW);

    expect(problems).toEqual([expect.stringContaining('80%')]);
    expect(problems[0]).not.toContain('4000');
    expect(problems[0]).not.toContain('4,000');
    // The quota is the organization's, so no project is named.
    expect(
      reads.find((read) => read.path === 'stats_v2/' && !read.query.project)
        ?.query.statsPeriod,
    ).toBe('30d');
  });

  it("reports the server project's errors Sentry dropped in the last two days", async () => {
    const { api, reads } = sentry({ drops: { status: 200, body: drops(3) } });

    expect(await findAlertPathProblems(api, NOW)).toEqual([
      expect.stringContaining('dropped server error events'),
    ]);
    expect(reads.find((read) => read.query.project)?.query).toMatchObject({
      project: WATCHED.serverProjectId,
      statsPeriod: '2d',
    });
  });

  // A revoked token or an API change must surface, never read as healthy.
  it('reports each read that fails, and still makes the others', async () => {
    const { api, reads } = sentry({
      monitor: { status: 401, body: null },
      usage: { status: 200, body: { unexpected: true } },
    });

    expect(await findAlertPathProblems(api, NOW)).toEqual([
      expect.stringContaining(
        'could not read the cron monitor from Sentry (HTTP 401)',
      ),
      expect.stringContaining('could not read the error usage'),
    ]);
    // A refusal or a malformed answer is not retried.
    expect(reads).toHaveLength(4);
  });

  it('tries a read once more after a server error, so a passing outage opens no issue', async () => {
    let monitorReads = 0;
    const { api: healthy } = sentry();
    const api: SentryApi = async (path, query) => {
      if (path.startsWith('monitors/') && monitorReads++ === 0)
        return { status: 502, body: null };
      return healthy(path, query);
    };

    expect(await findAlertPathProblems(api, NOW, 0)).toEqual([]);
    expect(monitorReads).toBe(2);
  });

  it('reports a read that fails twice in words that stay the same whatever the cause', async () => {
    const { api: healthy } = sentry();
    let monitorReads = 0;
    const api: SentryApi = async (path, query) =>
      path.startsWith('monitors/')
        ? { status: monitorReads++ === 0 ? 502 : 503, body: null }
        : healthy(path, query);
    const thrown: SentryApi = async () => {
      throw new Error('network down');
    };

    const [fromStatus] = await findAlertPathProblems(api, NOW, 0);
    const fromThrow = await findAlertPathProblems(thrown, NOW, 0);

    expect(fromStatus).toBe(
      "Sentry did not answer the watcher's read of the cron monitor, twice. If this persists, check Sentry's status page.",
    );
    expect(fromThrow).toHaveLength(4);
    expect(fromThrow[0]).toBe(fromStatus);
    expect(fromThrow.join('\n')).not.toContain('network down');
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
    const { api } = sentry({ usage: { status: 200, body: usage(4_100) } });
    await watchOperationalAlerts({ token: 'token', api, issues, now: NOW });
    const next = sentry({ usage: { status: 200, body: usage(4_300) } });

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

  it('watches the cron monitor the renewal job checks in with', () => {
    expect(WATCHED.monitorSlug).toBe(SEND_RENEWAL_NOTICES_MONITOR.slug);
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
