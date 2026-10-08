import { describe, expect, it } from 'vitest';
import {
  OPERATIONAL_ALERT_WATCHER_WORKFLOW,
  ScheduledWorkflowsUnreadable,
} from '@/src/adapters/jobs/scheduled-checks';
import { createGithubScheduledWorkflows } from './github-scheduled-workflows';

// DEBT-505: the renewal job reads the repository's workflows from GitHub's
// REST API. Shape only: the answers below are GitHub's documented fields.
const REPOSITORY = 'owner/repo';
const BASE = `https://api.github.com/repos/${REPOSITORY}/actions/workflows`;
const WATCHER_RUNS = `${BASE}/operational-alert-watcher.yml/runs?status=success&per_page=1`;

const workflowsBody = {
  total_count: 2,
  workflows: [
    {
      id: 1,
      path: OPERATIONAL_ALERT_WATCHER_WORKFLOW,
      state: 'active',
      created_at: '2026-10-09T00:00:00Z',
    },
    {
      id: 2,
      path: '.github/workflows/security-txt-renewal.yml',
      state: 'disabled_inactivity',
      created_at: '2026-09-01T00:00:00Z',
    },
  ],
};

function github(answers: Record<string, Response>) {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return answers[String(url)] ?? new Response(null, { status: 500 });
  };
  return { fetchImpl, requests };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('createGithubScheduledWorkflows', () => {
  it("reads every workflow's state and the watcher's last successful run", async () => {
    const { fetchImpl } = github({
      [`${BASE}?per_page=100`]: json(workflowsBody),
      [WATCHER_RUNS]: json({
        workflow_runs: [{ created_at: '2026-10-19T11:37:00Z' }],
      }),
    });

    await expect(
      createGithubScheduledWorkflows({
        repository: REPOSITORY,
        token: undefined,
        fetchImpl,
      }).read(),
    ).resolves.toEqual({
      workflows: [
        {
          path: OPERATIONAL_ALERT_WATCHER_WORKFLOW,
          state: 'active',
          createdAt: new Date('2026-10-09T00:00:00Z'),
        },
        {
          path: '.github/workflows/security-txt-renewal.yml',
          state: 'disabled_inactivity',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        },
      ],
      watcherLastSuccessAt: new Date('2026-10-19T11:37:00Z'),
    });
  });

  it('sends the API version, a user agent and a time limit, and the token only when one is set', async () => {
    const answers = () => ({
      [`${BASE}?per_page=100`]: json(workflowsBody),
      [WATCHER_RUNS]: json({ workflow_runs: [] }),
    });
    const anonymous = github(answers());
    const withToken = github(answers());

    await createGithubScheduledWorkflows({
      repository: REPOSITORY,
      token: undefined,
      fetchImpl: anonymous.fetchImpl,
    }).read();
    await createGithubScheduledWorkflows({
      repository: REPOSITORY,
      token: 'read-token',
      fetchImpl: withToken.fetchImpl,
    }).read();

    const headers = (request: { init: RequestInit | undefined } | undefined) =>
      new Headers(request?.init?.headers);
    expect(headers(anonymous.requests[0]).get('x-github-api-version')).toBe(
      '2022-11-28',
    );
    expect(headers(anonymous.requests[0]).get('user-agent')).toBeTruthy();
    expect(headers(anonymous.requests[0]).has('authorization')).toBe(false);
    expect(headers(withToken.requests[0]).get('authorization')).toBe(
      'Bearer read-token',
    );
    expect(anonymous.requests[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('reads a watcher with no successful run, or none on the default branch yet, as never succeeded', async () => {
    for (const runs of [
      json({ workflow_runs: [] }),
      new Response(null, { status: 404 }),
    ]) {
      const { fetchImpl } = github({
        [`${BASE}?per_page=100`]: json(workflowsBody),
        [WATCHER_RUNS]: runs,
      });

      const status = await createGithubScheduledWorkflows({
        repository: REPOSITORY,
        token: undefined,
        fetchImpl,
      }).read();

      expect(status.watcherLastSuccessAt).toBeNull();
    }
  });

  // A refusal or an unexpected shape needs a person: a token expired or was
  // revoked, or GitHub's API changed. A rate limit or an outage passes.
  it.each([
    ['a refused token', new Response(null, { status: 401 })],
    ['a forbidden read', new Response(null, { status: 403 })],
    ['an unexpected shape', json({ workflows: [{ path: 1 }] })],
  ])(
    'rejects as unreadable on %s, naming only the status',
    async (_case, answer) => {
      const { fetchImpl } = github({
        [`${BASE}?per_page=100`]: answer,
        [WATCHER_RUNS]: json({ workflow_runs: [] }),
      });

      const read = createGithubScheduledWorkflows({
        repository: REPOSITORY,
        token: 'read-token',
        fetchImpl,
      }).read();

      await expect(read).rejects.toBeInstanceOf(ScheduledWorkflowsUnreadable);
      await expect(read).rejects.toThrow(
        /^GitHub (answered \d+|returned an unexpected shape)$/,
      );
    },
  );

  it.each([
    [
      'a rate limit',
      new Response(null, {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      }),
    ],
    ['a secondary rate limit', new Response(null, { status: 429 })],
    ['a server error', new Response(null, { status: 502 })],
  ])('rejects as passing on %s with a token', async (_case, answer) => {
    const { fetchImpl } = github({
      [`${BASE}?per_page=100`]: answer,
      [WATCHER_RUNS]: json({ workflow_runs: [] }),
    });

    const read = createGithubScheduledWorkflows({
      repository: REPOSITORY,
      token: 'read-token',
      fetchImpl,
    }).read();

    await expect(read).rejects.toThrow(/^GitHub answered \d+$/);
    await expect(read).rejects.not.toBeInstanceOf(ScheduledWorkflowsUnreadable);
  });

  it("rejects as unreadable when the watcher's runs are refused", async () => {
    const { fetchImpl } = github({
      [`${BASE}?per_page=100`]: json(workflowsBody),
      [WATCHER_RUNS]: new Response(null, { status: 401 }),
    });

    await expect(
      createGithubScheduledWorkflows({
        repository: REPOSITORY,
        token: 'read-token',
        fetchImpl,
      }).read(),
    ).rejects.toBeInstanceOf(ScheduledWorkflowsUnreadable);
  });

  // Without a token, a rate limit is the missing token itself, not a
  // passing condition: GitHub's anonymous limit is per address, and Vercel's
  // addresses are shared.
  it('rejects as unreadable on a rate limit without a token, so the missing token is reported', async () => {
    const { fetchImpl } = github({
      [`${BASE}?per_page=100`]: new Response(null, {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      }),
      [WATCHER_RUNS]: json({ workflow_runs: [] }),
    });

    await expect(
      createGithubScheduledWorkflows({
        repository: REPOSITORY,
        token: undefined,
        fetchImpl,
      }).read(),
    ).rejects.toBeInstanceOf(ScheduledWorkflowsUnreadable);
  });
});
