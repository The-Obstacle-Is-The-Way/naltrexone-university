import {
  OPERATIONAL_ALERT_WATCHER_WORKFLOW,
  PRODUCTION_RELEASE_WATCH_WORKFLOW,
  type ScheduledWorkflow,
  type ScheduledWorkflows,
  ScheduledWorkflowsUnavailable,
  ScheduledWorkflowsUnreadable,
  UPSTREAM_ADVISORY_WATCH_WORKFLOW,
} from '@/src/adapters/jobs/scheduled-checks';
import { validateHeaderSecret } from '@/src/adapters/shared/header-secret';

const API = 'https://api.github.com';
const TIMEOUT_MS = 5_000;

class UnexpectedShape extends ScheduledWorkflowsUnreadable {
  constructor() {
    super('unexpected_shape');
  }
}

// A server error, or a rate limit on a read made with a token, passes. Any
// other refusal needs a person, and so does a rate limit without a token:
// GitHub's anonymous limit is per address, and Vercel's addresses are shared,
// so the fix is the missing token. GitHub marks a rate limit with 429, or
// with 403 and either no requests left or a `retry-after` header.
function failedRead(response: Response, hasToken: boolean): Error {
  const { status } = response;
  const rateLimited =
    status === 429 ||
    (status === 403 &&
      (response.headers.get('x-ratelimit-remaining') === '0' ||
        response.headers.has('retry-after')));
  if (status >= 500 || (rateLimited && hasToken))
    return new ScheduledWorkflowsUnavailable(status);
  return new ScheduledWorkflowsUnreadable(
    rateLimited ? 'rate_limited_without_token' : 'refused',
    status,
  );
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new UnexpectedShape();
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new UnexpectedShape();
  return value;
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new UnexpectedShape();
  return value;
}

function date(value: unknown): Date {
  const at = new Date(text(value));
  if (Number.isNaN(at.getTime())) throw new UnexpectedShape();
  return at;
}

/**
 * DEBT-505: the repository's GitHub Actions workflows, read from GitHub's
 * REST API with a token holding read-only Actions access. The repository is
 * public, so a read without one works until GitHub's per-address limit
 * refuses it, which is reported as the missing token. A read that needs a
 * person rejects as `ScheduledWorkflowsUnreadable`, with its reason; an
 * outage, a timeout, or a rate limit despite the token rejects as
 * `ScheduledWorkflowsUnavailable`. Each names the HTTP status only.
 */
export function createGithubScheduledWorkflows(deps: {
  /** `owner/name` */
  repository: string;
  token: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): ScheduledWorkflows {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  // A value the header would refuse fails every read, so it is reported as
  // a misconfigured token rather than as GitHub being unreachable.
  const tokenUsable = validateHeaderSecret('GITHUB_READ_TOKEN', deps.token, {
    optional: true,
  }).ok;
  const get = async (path: string): Promise<Response> => {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'addiction-boards-scheduled-checks',
    };
    if (deps.token) headers.authorization = `Bearer ${deps.token}`;
    try {
      return await fetchImpl(
        `${API}/repos/${deps.repository}/actions/${path}`,
        { headers, signal: AbortSignal.timeout(timeoutMs) },
      );
    } catch {
      // No answer at all: a timeout or a network failure.
      throw new ScheduledWorkflowsUnavailable();
    }
  };
  const answer = async (response: Response): Promise<unknown> => {
    if (response.status !== 200) {
      await response.body?.cancel();
      throw failedRead(response, Boolean(deps.token));
    }
    try {
      return await response.json();
    } catch {
      throw new UnexpectedShape();
    }
  };

  // The latest successful run in one runs query, dated by `at`, or null
  // when there is none or the workflow is not on the default branch yet.
  const lastSuccess = async (
    workflowPath: string,
    query: string,
    at: (run: Record<string, unknown>) => unknown,
  ): Promise<Date | null> => {
    const file = workflowPath.split('/').at(-1);
    const runs = await get(`workflows/${file}/runs?${query}`);
    if (runs.status === 404) {
      await runs.body?.cancel();
      return null;
    }
    const [latest] = list(record(await answer(runs)).workflow_runs);
    return latest === undefined ? null : date(at(record(latest)));
  };
  // DEBT-523: only a scheduled run shows that a watch's schedule fires. A
  // re-run keeps its run's event and creation time but starts later, so the
  // creation time keeps a re-run of an old run from hiding a stop.
  const lastScheduledSuccess = (workflowPath: string) =>
    lastSuccess(
      workflowPath,
      'event=schedule&status=success&per_page=1',
      (run) => run.created_at,
    );

  return {
    read: async () => {
      if (!tokenUsable)
        throw new ScheduledWorkflowsUnreadable('token_not_header_safe');
      const listed = record(await answer(await get('workflows?per_page=100')));
      const workflows: ScheduledWorkflow[] = list(listed.workflows)
        .map(record)
        .map((workflow) => ({
          path: text(workflow.path),
          state: text(workflow.state),
          createdAt: date(workflow.created_at),
        }));
      // A list cut off at the page size would leave workflows unchecked.
      if (
        typeof listed.total_count === 'number' &&
        listed.total_count > workflows.length
      )
        throw new UnexpectedShape();
      // A re-run keeps the run's creation time; its start time is the try
      // that succeeded.
      const watcherLastSuccessAt = await lastSuccess(
        OPERATIONAL_ALERT_WATCHER_WORKFLOW,
        'status=success&per_page=1',
        (run) => run.run_started_at ?? run.created_at,
      );
      return {
        workflows,
        watcherLastSuccessAt,
        watchLastScheduledSuccessAt: {
          [PRODUCTION_RELEASE_WATCH_WORKFLOW]: await lastScheduledSuccess(
            PRODUCTION_RELEASE_WATCH_WORKFLOW,
          ),
          [UPSTREAM_ADVISORY_WATCH_WORKFLOW]: await lastScheduledSuccess(
            UPSTREAM_ADVISORY_WATCH_WORKFLOW,
          ),
        },
      };
    },
  };
}
