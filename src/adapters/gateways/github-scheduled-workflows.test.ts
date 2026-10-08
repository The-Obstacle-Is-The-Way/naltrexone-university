import { describe, expect, it } from 'vitest';
import {
  OPERATIONAL_ALERT_WATCHER_WORKFLOW,
  ScheduledWorkflowsUnavailable,
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
    expect(headers(withToken.requests[1]).get('authorization')).toBe(
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

  const reading = (answer: Response, token: string | undefined) => {
    const { fetchImpl, requests } = github({
      [`${BASE}?per_page=100`]: answer,
      [WATCHER_RUNS]: json({ workflow_runs: [] }),
    });
    return {
      requests,
      read: createGithubScheduledWorkflows({
        repository: REPOSITORY,
        token,
        fetchImpl,
      }).read(),
    };
  };

  // A refusal, an unexpected shape or a missing token needs a person; the
  // reason and status say which.
  it.each([
    ['a refused token', new Response(null, { status: 401 }), 'refused', 401],
    ['a forbidden read', new Response(null, { status: 403 }), 'refused', 403],
    [
      'an unexpected shape',
      json({ workflows: [{ path: 1 }] }),
      'unexpected_shape',
      undefined,
    ],
    [
      'a list cut off at its page size',
      json({ ...workflowsBody, total_count: 101 }),
      'unexpected_shape',
      undefined,
    ],
  ] as const)(
    'rejects as unreadable on %s',
    async (_case, answer, reason, status) => {
      const { read } = reading(answer, 'read-token');

      await expect(read).rejects.toBeInstanceOf(ScheduledWorkflowsUnreadable);
      await expect(read).rejects.toMatchObject({ reason, status });
    },
  );

  // Without a token, a rate limit is the missing token itself, not a
  // passing condition: GitHub's anonymous limit is per address, and Vercel's
  // addresses are shared.
  it.each([
    [
      'a primary rate limit',
      new Response(null, {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      }),
    ],
    ['a secondary rate limit', new Response(null, { status: 429 })],
  ])(
    'rejects as unreadable on %s without a token, naming the missing token',
    async (_case, answer) => {
      const { read } = reading(answer, undefined);

      await expect(read).rejects.toMatchObject({
        reason: 'rate_limited_without_token',
      });
    },
  );

  it.each([
    [
      'a primary rate limit',
      new Response(null, {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      }),
      403,
    ],
    [
      'a secondary rate limit marked by retry-after',
      new Response(null, {
        status: 403,
        headers: { 'x-ratelimit-remaining': '12', 'retry-after': '60' },
      }),
      403,
    ],
    ['a 429', new Response(null, { status: 429 }), 429],
    ['a server error', new Response(null, { status: 502 }), 502],
  ])(
    'rejects as unavailable on %s with a token, keeping the status',
    async (_case, answer, status) => {
      const { read } = reading(answer, 'read-token');

      await expect(read).rejects.toBeInstanceOf(ScheduledWorkflowsUnavailable);
      await expect(read).rejects.toMatchObject({ status });
    },
  );

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
    ).rejects.toMatchObject({ reason: 'refused', status: 401 });
  });

  // A value the header would refuse fails every read; it is reported as the
  // token's fault, before any request.
  it('rejects as unreadable, without a request, when the token cannot be sent as a header', async () => {
    const { read, requests } = reading(json(workflowsBody), 'read-token\n');

    await expect(read).rejects.toMatchObject({
      reason: 'token_not_header_safe',
    });
    expect(requests).toEqual([]);
  });

  it('gives up after its time limit, as unavailable', async () => {
    const fetchImpl: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        );
      });

    await expect(
      createGithubScheduledWorkflows({
        repository: REPOSITORY,
        token: 'read-token',
        fetchImpl,
        timeoutMs: 20,
      }).read(),
    ).rejects.toBeInstanceOf(ScheduledWorkflowsUnavailable);
  });

  // A re-run keeps its run's creation time; the start time is when the try
  // that succeeded began.
  it("dates the watcher's last success by when its successful try started", async () => {
    const { fetchImpl } = github({
      [`${BASE}?per_page=100`]: json(workflowsBody),
      [WATCHER_RUNS]: json({
        workflow_runs: [
          {
            created_at: '2026-10-17T11:37:00Z',
            run_started_at: '2026-10-19T08:00:00Z',
          },
        ],
      }),
    });

    const status = await createGithubScheduledWorkflows({
      repository: REPOSITORY,
      token: 'read-token',
      fetchImpl,
    }).read();

    expect(status.watcherLastSuccessAt).toEqual(
      new Date('2026-10-19T08:00:00Z'),
    );
  });
});
