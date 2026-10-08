import { pathToFileURL } from 'node:url';
import {
  type AlertIssueSync,
  type AlertIssues,
  createGithubAlertIssues,
  syncAlertIssue,
} from './github-alert-issues';

// DEBT-505: operational alerts reach the owner as Sentry email, and the drill
// proves that path once a month. Neither notices its own absence: a stopped
// cron raises no alert and no drill. This daily job reads Sentry with a
// read-only token and raises one GitHub issue, outside Sentry's email, when
// the renewal job stops checking in, the alerts' workflow is disabled or
// changed, no drill has arrived, or the error quota is nearly spent.
export const WATCHER_ISSUE_TITLE =
  'Operational alerts may not be reaching the owner';

export const WATCHED = {
  organization: 'novamindnyc',
  serverProjectId: '4512218274398208',
  errorDetectorId: '10572676',
  workflowId: '6133179',
  monitorSlug: 'send-renewal-notices',
  // The Developer plan's errors per billing period (checked 2026-10-08).
  monthlyErrorQuota: 5_000,
} as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// A daily job, plus the hour within which Vercel's Hobby plan may start it.
const CHECK_IN_STALE_MS = DAY_MS + HOUR_MS;
// A drill goes out each 30-day cycle; two more days allow a late cron and a
// next-day retry.
const DRILL_WINDOW_DAYS = 32;
const QUOTA_WARNING_RATIO = 0.8;
const DROP_WINDOW_DAYS = 2;
const REQUEST_TIMEOUT_MS = 20_000;

export type SentryResponse = { status: number; body: unknown };
export type SentryApi = (
  path: string,
  query?: Record<string, string>,
) => Promise<SentryResponse>;

class UnreadableResponse extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new UnreadableResponse();
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new UnreadableResponse();
  return value;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new UnreadableResponse();
  return value;
}

async function monitorProblems(api: SentryApi, now: Date): Promise<string[]> {
  const response = await api(`monitors/${WATCHED.monitorSlug}/`, {
    environment: 'production',
  });
  if (response.status === 404)
    return [
      'The renewal job has no cron monitor in Sentry. Its first run after a release creates one; if a day has passed since, the job is not running.',
    ];
  if (response.status !== 200) throw new FailedRead(response.status);
  const monitor = record(response.body);
  const production = list(monitor.environments)
    .map(record)
    .find((environment) => environment.name === 'production');
  if (
    monitor.status !== 'active' ||
    monitor.isMuted === true ||
    production?.isMuted === true
  )
    return [
      "The renewal job's Sentry cron monitor is disabled or muted, so a missed run would go unrecorded.",
    ];
  if (!production)
    return ['The renewal job has never checked in from production.'];
  const problems: string[] = [];
  const lastCheckIn = production.lastCheckIn;
  if (typeof lastCheckIn !== 'string' || Number.isNaN(Date.parse(lastCheckIn)))
    throw new UnreadableResponse();
  if (now.getTime() - Date.parse(lastCheckIn) > CHECK_IN_STALE_MS)
    problems.push(
      `The renewal job last checked in at ${lastCheckIn}, more than a day ago: its daily cron may have stopped.`,
    );
  if (production.status !== 'ok')
    problems.push(
      `The renewal job's last run's status is \`${String(production.status)}\` in Sentry.`,
    );
  return problems;
}

// What decides who the workflow emails and when; ids and order do not.
function projectWorkflow(workflow: Record<string, unknown>) {
  const conditions = (group: unknown) =>
    list(record(group).conditions)
      .map(record)
      .map(({ type, comparison, conditionResult }) => ({
        type,
        comparison,
        conditionResult,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    environment: workflow.environment,
    detectorIds: list(workflow.detectorIds).map(String).sort(),
    config: workflow.config,
    triggers: {
      logicType: record(workflow.triggers).logicType,
      conditions: conditions(workflow.triggers),
    },
    actionFilters: list(workflow.actionFilters)
      .map(record)
      .map((filter) => ({
        logicType: filter.logicType,
        conditions: conditions(filter),
        actions: list(filter.actions)
          .map(record)
          .map(({ type, data, config, status }) => ({
            type,
            data,
            config,
            status,
          })),
      })),
  };
}

const condition = (type: string, comparison: unknown = true) => ({
  type,
  comparison,
  conditionResult: true,
});

// The DEBT-505 workflow as set up on 2026-10-08: a new, regressed or
// reappeared issue with an `alert.kind` tag in production emails the owner.
// After an intended change in Sentry, update this to match.
const EXPECTED_WORKFLOW = {
  environment: 'production',
  detectorIds: [WATCHED.errorDetectorId],
  config: { frequency: 0 },
  triggers: {
    logicType: 'any-short',
    conditions: [
      condition('first_seen_event'),
      condition('reappeared_event'),
      condition('regression_event'),
    ],
  },
  actionFilters: [
    {
      logicType: 'all',
      conditions: [
        condition('tagged_event', { key: 'alert.kind', match: 'is' }),
      ],
      actions: [
        {
          type: 'email',
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
};

async function workflowProblems(api: SentryApi, now: Date): Promise<string[]> {
  const response = await api(`workflows/${WATCHED.workflowId}/`);
  if (response.status === 404)
    return ["The alerts' Sentry workflow no longer exists."];
  if (response.status !== 200) throw new FailedRead(response.status);
  const workflow = record(response.body);
  if (workflow.enabled !== true)
    return ["The alerts' Sentry workflow is disabled, so no alert is emailed."];
  const problems: string[] = [];
  const actual = projectWorkflow(workflow);
  const changed = (Object.keys(EXPECTED_WORKFLOW) as Array<keyof typeof actual>)
    .filter(
      (key) =>
        JSON.stringify(actual[key]) !== JSON.stringify(EXPECTED_WORKFLOW[key]),
    )
    .map((key) => `\`${key}\``);
  if (changed.length > 0)
    problems.push(
      `The alerts' Sentry workflow changed (${changed.join(', ')}). If the change was intended, update the expected workflow in scripts/operational-alert-watcher.ts.`,
    );
  const lastTriggered = workflow.lastTriggered;
  if (
    lastTriggered !== null &&
    (typeof lastTriggered !== 'string' ||
      Number.isNaN(Date.parse(lastTriggered)))
  )
    throw new UnreadableResponse();
  if (
    lastTriggered === null ||
    now.getTime() - Date.parse(lastTriggered) > DRILL_WINDOW_DAYS * DAY_MS
  )
    problems.push(
      `The alerts' Sentry workflow has sent nothing in ${DRILL_WINDOW_DAYS} days, though a drill should go out every 30.`,
    );
  return problems;
}

async function drillProblems(api: SentryApi): Promise<string[]> {
  const response = await api('events/', {
    dataset: 'errors',
    field: 'count()',
    query: 'alert.kind:operational_alert_drill',
    project: WATCHED.serverProjectId,
    environment: 'production',
    statsPeriod: `${DRILL_WINDOW_DAYS}d`,
  });
  if (response.status !== 200) throw new FailedRead(response.status);
  const [row] = list(record(response.body).data);
  if (count(record(row)['count()']) > 0) return [];
  return [
    `No alert drill reached Sentry from production in ${DRILL_WINDOW_DAYS} days: the renewal job may not be running, or cannot reach Sentry.`,
  ];
}

async function usageProblems(api: SentryApi): Promise<string[]> {
  const response = await api('stats_v2/', {
    field: 'sum(quantity)',
    category: 'error',
    groupBy: 'outcome',
    statsPeriod: '30d',
    interval: '1d',
  });
  if (response.status !== 200) throw new FailedRead(response.status);
  const groups = list(record(response.body).groups).map(record);
  const outcome = (name: string) =>
    groups.find((group) => record(group.by).outcome === name);
  const problems: string[] = [];
  const accepted = outcome('accepted');
  const used = accepted ? count(record(accepted.totals)['sum(quantity)']) : 0;
  // Counts stay out of the text, so the issue changes only when its findings do.
  if (used >= QUOTA_WARNING_RATIO * WATCHED.monthlyErrorQuota)
    problems.push(
      `Sentry accepted more than 80% of the plan's ${WATCHED.monthlyErrorQuota.toLocaleString('en-US')} monthly errors in the last 30 days. Once the quota runs out, Sentry drops alerts too.`,
    );
  const limited = outcome('rate_limited');
  const recentDrops = limited
    ? list(record(limited.series)['sum(quantity)'])
        .slice(-DROP_WINDOW_DAYS)
        .reduce((total: number, value) => total + count(value), 0)
    : 0;
  if (recentDrops > 0)
    problems.push(
      'Sentry dropped error events in the last two days for quota or rate limits; an operational alert may have been among them.',
    );
  return problems;
}

class FailedRead extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function read(
  what: string,
  check: () => Promise<string[]>,
): Promise<string[]> {
  try {
    return await check();
  } catch (error) {
    // The cause stays out of the issue: it may quote a response or a header.
    const detail = error instanceof FailedRead ? ` (HTTP ${error.status})` : '';
    return [
      `The watcher could not read the ${what} from Sentry${detail}. If the token was revoked or lacks a scope, replace it (docs/dev/logging.md).`,
    ];
  }
}

export async function findAlertPathProblems(
  api: SentryApi,
  now: Date,
): Promise<string[]> {
  const found = await Promise.all([
    read('cron monitor', () => monitorProblems(api, now)),
    read('alerts workflow', () => workflowProblems(api, now)),
    read('alert drills', () => drillProblems(api)),
    read('error usage', () => usageProblems(api)),
  ]);
  return found.flat();
}

export const NOT_CONFIGURED =
  'The watcher has no Sentry token. The owner creates a read-only one and adds it as the repository secret `SENTRY_WATCHER_TOKEN` (docs/dev/logging.md); until then only the monthly drill email shows the alerts work.';

function describeProblems(problems: string[]): string {
  return (
    'The daily watcher found something that may keep operational alerts, including the legal-deadline renewal alerts, from reaching the owner:\n\n' +
    problems.map((problem) => `- ${problem}\n`).join('') +
    '\nFix each one, then let the next daily run close this issue, or run the "Operational alert watcher" workflow by hand. ' +
    'What each check means: docs/dev/logging.md, "Operational alerts".\n'
  );
}

export async function watchOperationalAlerts({
  token,
  api = token ? createSentryApi(token) : undefined,
  issues = createGithubAlertIssues(),
  now = new Date(),
}: {
  token: string | undefined;
  api?: SentryApi | undefined;
  issues?: AlertIssues;
  now?: Date;
}): Promise<AlertIssueSync> {
  const problems =
    token && api ? await findAlertPathProblems(api, now) : [NOT_CONFIGURED];
  return syncAlertIssue(
    issues,
    WATCHER_ISSUE_TITLE,
    problems.length > 0 ? describeProblems(problems) : null,
    {
      resolved: 'Every operational alert check passes again.',
      changed: 'The operational alert findings changed; see the description.',
    },
  );
}

export function createSentryApi(
  token: string,
  fetchImpl: typeof fetch = fetch,
): SentryApi {
  return async (path, query = {}) => {
    const search = new URLSearchParams(query).toString();
    const response = await fetchImpl(
      `https://sentry.io/api/0/organizations/${WATCHED.organization}/${path}${search ? `?${search}` : ''}`,
      {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (response.status !== 200) {
      await response.body?.cancel();
      return { status: response.status, body: null };
    }
    return { status: response.status, body: await response.json() };
  };
}

export async function runOperationalAlertWatcher(
  watch: () => Promise<string>,
  output: Pick<Console, 'log' | 'error'> = console,
): Promise<number> {
  try {
    output.log(`Operational alert watcher: ${await watch()}`);
    return 0;
  } catch {
    output.error(
      'Operational alert watcher failed; inspect GitHub issue access.',
    );
    return 1;
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
// No top-level await: tsx runs this repository's scripts as CommonJS.
if (import.meta.url === executedPath) {
  void runOperationalAlertWatcher(() =>
    watchOperationalAlerts({
      token: process.env.SENTRY_WATCHER_TOKEN || undefined,
    }),
  ).then((code) => {
    process.exitCode = code;
  });
}
