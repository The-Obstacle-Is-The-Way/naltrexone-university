import { pathToFileURL } from 'node:url';
import {
  type AlertIssueSync,
  type AlertIssues,
  createGithubAlertIssues,
  syncAlertIssue,
} from './github-alert-issues';

// DEBT-505: operational alerts reach the owner as Sentry email, and a monthly
// drill proves that path, but neither notices its own absence. This daily job
// reads Sentry with a read-only token and keeps one GitHub issue open, outside
// Sentry's email, while a check fails. The checks and what to do about each:
// docs/dev/logging.md, "Operational alerts", Watcher.
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
// A drill makes the workflow send at least once per 30-day cycle; two more
// days allow a late cron and a next-day retry. The workflow's last send is
// read, not the drill's event, which the plan keeps for only 30 days.
export const DRILL_WINDOW_DAYS = 32;
const QUOTA_WARNING_RATIO = 0.8;
const DROP_WINDOW_DAYS = 2;
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 5_000;

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
  // Only the fields read here are compared, so a field Sentry adds later does
  // not read as a change.
  const conditions = (group: unknown) =>
    list(record(group).conditions)
      .map(record)
      .map(({ type, comparison, conditionResult }) => ({
        type,
        comparison:
          comparison && typeof comparison === 'object'
            ? {
                key: record(comparison).key,
                match: record(comparison).match,
                value: record(comparison).value,
              }
            : comparison,
        conditionResult,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    environment: workflow.environment,
    detectorIds: list(workflow.detectorIds).map(String).sort(),
    config: { frequency: record(workflow.config).frequency },
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
            fallthroughType: record(data).fallthroughType,
            targetType: record(config).targetType,
            targetIdentifier: record(config).targetIdentifier,
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
          fallthroughType: 'ActiveMembers',
          targetType: 'issue_owners',
          targetIdentifier: null,
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
      `The alerts' Sentry workflow has sent nothing in ${DRILL_WINDOW_DAYS} days, though the drill should make it send every 30: check the renewal job's \`alertDrill\` result and the server project's issues for \`alert.kind:operational_alert_drill\`.`,
    );
  return problems;
}

function outcomes(response: SentryResponse) {
  if (response.status !== 200) throw new FailedRead(response.status);
  const groups = list(record(response.body).groups).map(record);
  return (name: string) =>
    groups.find((group) => record(group.by).outcome === name);
}

// The quota is the organization's, so every project's errors count.
async function usageProblems(api: SentryApi): Promise<string[]> {
  const accepted = outcomes(
    await api('stats_v2/', {
      field: 'sum(quantity)',
      category: 'error',
      groupBy: 'outcome',
      statsPeriod: '30d',
    }),
  )('accepted');
  const used = accepted ? count(record(accepted.totals)['sum(quantity)']) : 0;
  // Counts stay out of the text, so the issue changes only when its findings do.
  if (used < QUOTA_WARNING_RATIO * WATCHED.monthlyErrorQuota) return [];
  return [
    `Sentry accepted more than 80% of the plan's ${WATCHED.monthlyErrorQuota.toLocaleString('en-US')} monthly errors in the last 30 days. Once the quota runs out, Sentry drops alerts too.`,
  ];
}

// Only the server project's drops matter here: the browser's errors and CSP
// reports go to the web project and never carry an alert.
async function dropProblems(api: SentryApi): Promise<string[]> {
  const limited = outcomes(
    await api('stats_v2/', {
      field: 'sum(quantity)',
      category: 'error',
      groupBy: 'outcome',
      project: WATCHED.serverProjectId,
      statsPeriod: `${DROP_WINDOW_DAYS}d`,
    }),
  )('rate_limited');
  if (!limited || count(record(limited.totals)['sum(quantity)']) === 0)
    return [];
  return [
    'Sentry dropped server error events in the last two days for quota or rate limits; an operational alert may have been among them.',
  ];
}

class FailedRead extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

// A server error, a rate limit or no answer at all may pass, so it is tried
// once more; a refusal or an unexpected shape will not.
function isTransient(error: unknown): boolean {
  if (error instanceof FailedRead)
    return error.status === 429 || error.status >= 500;
  return !(error instanceof UnreadableResponse);
}

function describeFailedRead(what: string, error: unknown): string {
  // The cause stays out of the issue: it may quote a response or a header,
  // and a changing status would rewrite the issue each day.
  if (isTransient(error))
    return `Sentry did not answer the watcher's read of the ${what}, twice. If this persists, check Sentry's status page.`;
  if (error instanceof FailedRead)
    return `The watcher could not read the ${what} from Sentry (HTTP ${error.status}). If the token was revoked or lacks a scope, replace it (docs/dev/logging.md).`;
  return `The watcher could not read the ${what} from Sentry: the answer was not in the shape it expects. Sentry's API may have changed.`;
}

async function read(
  what: string,
  check: () => Promise<string[]>,
  retryDelayMs: number,
): Promise<string[]> {
  try {
    return await check();
  } catch (error) {
    if (!isTransient(error)) return [describeFailedRead(what, error)];
  }
  await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  try {
    return await check();
  } catch (error) {
    return [describeFailedRead(what, error)];
  }
}

export async function findAlertPathProblems(
  api: SentryApi,
  now: Date,
  retryDelayMs = RETRY_DELAY_MS,
): Promise<string[]> {
  const found = await Promise.all([
    read('cron monitor', () => monitorProblems(api, now), retryDelayMs),
    read('alerts workflow', () => workflowProblems(api, now), retryDelayMs),
    read('error usage', () => usageProblems(api), retryDelayMs),
    read('dropped errors', () => dropProblems(api), retryDelayMs),
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
    // A 200 that is not JSON is a changed shape, not an outage.
    try {
      return { status: response.status, body: await response.json() };
    } catch {
      throw new UnreadableResponse();
    }
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
