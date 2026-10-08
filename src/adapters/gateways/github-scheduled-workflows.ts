import {
  OPERATIONAL_ALERT_WATCHER_WORKFLOW,
  type ScheduledWorkflow,
  type ScheduledWorkflows,
} from '@/src/adapters/jobs/scheduled-checks';

const API = 'https://api.github.com';
const TIMEOUT_MS = 5_000;

class UnexpectedShape extends Error {
  constructor() {
    super('GitHub returned an unexpected shape');
  }
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
 * REST API. The repository is public, so a token is optional; one with
 * read-only Actions access avoids the per-address limit on anonymous calls.
 * A refusal, a rate limit or an unexpected shape rejects, naming the status
 * only, so the caller treats it as no answer rather than a stopped check.
 */
export function createGithubScheduledWorkflows(deps: {
  /** `owner/name` */
  repository: string;
  token: string | undefined;
  fetchImpl?: typeof fetch;
}): ScheduledWorkflows {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const get = async (path: string): Promise<Response> => {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'addiction-boards-scheduled-checks',
    };
    if (deps.token) headers.authorization = `Bearer ${deps.token}`;
    return fetchImpl(`${API}/repos/${deps.repository}/actions/${path}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  };
  const answer = async (response: Response): Promise<unknown> => {
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(`GitHub answered ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new UnexpectedShape();
    }
  };

  return {
    read: async () => {
      const workflows: ScheduledWorkflow[] = list(
        record(await answer(await get('workflows?per_page=100'))).workflows,
      )
        .map(record)
        .map((workflow) => ({
          path: text(workflow.path),
          state: text(workflow.state),
          createdAt: date(workflow.created_at),
        }));
      const watcherFile = OPERATIONAL_ALERT_WATCHER_WORKFLOW.split('/').at(-1);
      const runs = await get(
        `workflows/${watcherFile}/runs?status=success&per_page=1`,
      );
      // No such workflow on the default branch yet: it has never succeeded.
      if (runs.status === 404) {
        await runs.body?.cancel();
        return { workflows, watcherLastSuccessAt: null };
      }
      const [lastSuccess] = list(record(await answer(runs)).workflow_runs);
      return {
        workflows,
        watcherLastSuccessAt:
          lastSuccess === undefined
            ? null
            : date(record(lastSuccess).created_at),
      };
    },
  };
}
