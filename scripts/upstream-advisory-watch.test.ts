import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import {
  type AdvisoryIssue,
  type AdvisoryIssues,
  createGithubAdvisoryIssues,
  DEPENDENCY_REPOSITORIES,
  directDependencySpecifiers,
  listUpstreamAdvisories,
  raiseUpstreamAdvisories,
  runUpstreamAdvisoryWatch,
  type UpstreamAdvisory,
  WATCH_START,
  watchedRepositories,
  watchUpstreamAdvisories,
} from './upstream-advisory-watch';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

afterEach(() => {
  vi.resetAllMocks();
});

class MemoryIssues implements AdvisoryIssues {
  issues: (AdvisoryIssue & { body: string })[] = [];
  async list() {
    return this.issues;
  }
  async create(title: string, body: string) {
    this.issues.push({
      number: this.issues.length + 1,
      title,
      body,
      state: 'OPEN',
    });
  }
}

const advisory = (
  overrides: Partial<UpstreamAdvisory> = {},
): UpstreamAdvisory => ({
  ghsaId: 'GHSA-aaaa-bbbb-cccc',
  cveId: 'CVE-2026-00001',
  severity: 'critical',
  summary: 'Remote code execution in a fixture',
  url: 'https://github.com/vercel/next.js/security/advisories/GHSA-aaaa-bbbb-cccc',
  publishedAt: '2026-10-08T16:00:00Z',
  vulnerabilities: [
    {
      package: 'next',
      vulnerableRange: '>= 16.0.0 < 16.3.?',
      patchedVersions: '16.3.?',
    },
  ],
  ...overrides,
});

const manifest = { next: '16.3.6' };

describe('raising upstream advisories', () => {
  it('opens one issue for an advisory published after the watch start', async () => {
    const issues = new MemoryIssues();
    expect(
      await raiseUpstreamAdvisories([advisory()], manifest, issues),
    ).toEqual(['GHSA-aaaa-bbbb-cccc']);
    expect(issues.issues.map((issue) => issue.title)).toEqual([
      'Upstream security advisory GHSA-aaaa-bbbb-cccc (critical): next',
    ]);
  });

  it('leaves advisories published before the watch start to manual triage', async () => {
    const issues = new MemoryIssues();
    expect(
      await raiseUpstreamAdvisories(
        [advisory({ publishedAt: '2026-09-30T16:15:36Z' })],
        manifest,
        issues,
      ),
    ).toEqual([]);
    expect(issues.issues).toEqual([]);
    expect(WATCH_START).toBe('2026-10-01T00:00:00Z');
  });

  it.each(['OPEN', 'CLOSED'] as const)(
    'does not reopen or duplicate an advisory whose issue is %s',
    async (state) => {
      const issues = new MemoryIssues();
      issues.issues.push({
        number: 7,
        title: 'Upstream security advisory GHSA-aaaa-bbbb-cccc (high): next',
        body: '',
        state,
      });
      expect(
        await raiseUpstreamAdvisories([advisory()], manifest, issues),
      ).toEqual([]);
      expect(issues.issues).toHaveLength(1);
    },
  );

  it('copies the advisory facts verbatim, including malformed version ranges', async () => {
    const issues = new MemoryIssues();
    await raiseUpstreamAdvisories([advisory()], manifest, issues);
    const body = issues.issues[0]?.body ?? '';
    expect(body).toContain('Remote code execution in a fixture');
    expect(body).toContain(
      'https://github.com/vercel/next.js/security/advisories/GHSA-aaaa-bbbb-cccc',
    );
    expect(body).toContain('CVE-2026-00001');
    expect(body).toContain('`next` `>= 16.0.0 < 16.3.?`, patched in `16.3.?`');
    expect(body).toContain('`package.json` pins `next` at `16.3.6`');
    expect(body).toContain(
      'docs/dev/supply-chain-overrides.md#urgent-cve-patches-before-the-7-day-cooldown',
    );
  });

  it('says so when an affected package is not a direct dependency', async () => {
    const issues = new MemoryIssues();
    await raiseUpstreamAdvisories(
      [
        advisory({
          cveId: null,
          vulnerabilities: [
            {
              package: '@next/env',
              vulnerableRange: null,
              patchedVersions: null,
            },
          ],
        }),
      ],
      manifest,
      issues,
    );
    const [issue] = issues.issues;
    expect(issue?.title).toBe(
      'Upstream security advisory GHSA-aaaa-bbbb-cccc (critical): @next/env',
    );
    expect(issue?.body).toContain('CVE: none assigned');
    expect(issue?.body).toContain(
      '`@next/env` `unknown range`, patched in `no patched version listed`',
    );
    expect(issue?.body).toContain(
      '`@next/env` is not a direct dependency in `package.json`',
    );
  });

  it('raises each new advisory once when the same run lists it twice', async () => {
    const issues = new MemoryIssues();
    expect(
      await raiseUpstreamAdvisories([advisory(), advisory()], manifest, issues),
    ).toEqual(['GHSA-aaaa-bbbb-cccc']);
    expect(issues.issues).toHaveLength(1);
  });

  it('propagates an issue API failure instead of reporting a delivered alert', async () => {
    const issues = new MemoryIssues();
    issues.create = async () => {
      throw new Error('GitHub unavailable');
    };
    await expect(
      raiseUpstreamAdvisories([advisory()], manifest, issues),
    ).rejects.toThrow('GitHub unavailable');
  });
});

describe('package.json specifiers', () => {
  it('reads runtime and development dependencies', () => {
    expect(
      directDependencySpecifiers(
        JSON.stringify({
          dependencies: { next: '16.3.6' },
          devDependencies: { vitest: '^4.1.11' },
        }),
      ),
    ).toEqual({ next: '16.3.6', vitest: '^4.1.11' });
  });

  it.each(['[]', '{"dependencies": []}', '{"dependencies": {"next": 16}}'])(
    'refuses a malformed manifest %s',
    (text) => {
      expect(() => directDependencySpecifiers(text)).toThrow(
        'Invalid package.json dependencies',
      );
    },
  );
});

const apiAdvisory = {
  ghsa_id: 'GHSA-aaaa-bbbb-cccc',
  cve_id: 'CVE-2026-00001',
  severity: 'critical',
  summary: '  Remote code\nexecution  ',
  html_url:
    'https://github.com/vercel/next.js/security/advisories/GHSA-aaaa-bbbb-cccc',
  published_at: '2026-10-08T16:00:00Z',
  state: 'published',
  vulnerabilities: [
    {
      package: { ecosystem: 'npm', name: 'next' },
      vulnerable_version_range: '>= 16.0.0 < 16.3.?',
      patched_versions: '16.3.?',
    },
  ],
};

describe('GitHub advisory source', () => {
  it('reads every page of a watched repository’s published advisories', async () => {
    const commands: string[][] = [];
    const advisories = await listUpstreamAdvisories(
      'vercel/next.js',
      (args) => {
        commands.push(args);
        return JSON.stringify([
          [apiAdvisory],
          [{ ...apiAdvisory, ghsa_id: 'GHSA-dddd-eeee-ffff' }],
        ]);
      },
    );
    expect(commands).toEqual([
      [
        'api',
        '--paginate',
        '--slurp',
        'repos/vercel/next.js/security-advisories?state=published&per_page=100',
      ],
    ]);
    expect(advisories.map((entry) => entry.ghsaId)).toEqual([
      'GHSA-aaaa-bbbb-cccc',
      'GHSA-dddd-eeee-ffff',
    ]);
    expect(advisories[0]).toEqual(
      advisory({ summary: 'Remote code execution' }),
    );
  });

  it.each([
    { ghsa_id: 'not-an-id' },
    { cve_id: 42 },
    { severity: null },
    { summary: null },
    { html_url: 'https://example.com/advisory' },
    { published_at: 'yesterday' },
    { published_at: null },
    { vulnerabilities: null },
    { vulnerabilities: [{ package: null }] },
    { vulnerabilities: [{ package: { name: 'next' }, patched_versions: 3 }] },
  ])('refuses a malformed advisory %j', async (overrides) => {
    await expect(
      listUpstreamAdvisories('vercel/next.js', () =>
        JSON.stringify([[{ ...apiAdvisory, ...overrides }]]),
      ),
    ).rejects.toThrow('Invalid GitHub advisory response');
  });

  it.each([
    { vulnerabilities: null },
    { vulnerabilities: [{ package: null }] },
    { summary: null },
  ])(
    'skips a malformed advisory published before the watch start, so it cannot silence new alerts: %j',
    async (overrides) => {
      const advisories = await listUpstreamAdvisories('vercel/next.js', () =>
        JSON.stringify([
          [
            {
              ...apiAdvisory,
              ...overrides,
              ghsa_id: 'GHSA-oooo-oooo-oooo',
              published_at: '2026-09-30T16:15:36Z',
            },
            apiAdvisory,
          ],
        ]),
      );
      expect(advisories.map((entry) => entry.ghsaId)).toEqual([
        'GHSA-aaaa-bbbb-cccc',
      ]);
    },
  );

  it('validates every advisory published since a caller-supplied start', async () => {
    await expect(
      listUpstreamAdvisories(
        'vercel/next.js',
        () =>
          JSON.stringify([
            [
              {
                ...apiAdvisory,
                vulnerabilities: null,
                published_at: '2026-09-30T16:15:36Z',
              },
            ],
          ]),
        '2026-09-01T00:00:00Z',
      ),
    ).rejects.toThrow('Invalid GitHub advisory response');
  });

  it.each([{}, [null], [{}]].map((data) => ({ data })))(
    'refuses malformed page data $data',
    async ({ data }) => {
      await expect(
        listUpstreamAdvisories('vercel/next.js', () => JSON.stringify(data)),
      ).rejects.toThrow('Invalid GitHub advisory response');
    },
  );
});

describe('GitHub issue adapter', () => {
  it('lists issues directly with pagination, skipping pull requests', async () => {
    const commands: string[][] = [];
    const issues = createGithubAdvisoryIssues((args) => {
      commands.push(args);
      return JSON.stringify([
        [{ number: 42, title: 'Alert', state: 'closed' }],
        [{ number: 43, title: 'PR', state: 'open', pull_request: {} }],
      ]);
    });
    expect(await issues.list()).toEqual([
      { number: 42, title: 'Alert', state: 'CLOSED' },
    ]);
    expect(commands).toEqual([
      [
        'api',
        '--paginate',
        '--slurp',
        'repos/{owner}/{repo}/issues?state=all&per_page=100',
      ],
    ]);
  });

  it.each([
    { number: -1 },
    { number: 1.5 },
    { title: null },
    { state: 'unknown' },
    { pull_request: true },
  ])('refuses malformed issue fields %j', async (overrides) => {
    const issues = createGithubAdvisoryIssues(() =>
      JSON.stringify([
        [{ number: 42, title: 'Alert', state: 'open', ...overrides }],
      ]),
    );
    await expect(issues.list()).rejects.toThrow(
      'Invalid GitHub issue response',
    );
  });

  it('creates an issue through the default runner with a bounded argument list', async () => {
    const run = vi.mocked(execFileSync).mockReturnValue('');
    await createGithubAdvisoryIssues().create('Alert', 'Details');
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['issue', 'create', '--title', 'Alert', '--body', 'Details'],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 32 * 1024 * 1024 },
    );
  });
});

describe('watched repositories', () => {
  // A dependency added without a watch decision fails here, not silently.
  it('maps every direct dependency in package.json, and nothing else', () => {
    const manifest = directDependencySpecifiers(
      readFileSync('package.json', 'utf8'),
    );
    expect(Object.keys(DEPENDENCY_REPOSITORIES).sort()).toEqual(
      Object.keys(manifest).sort(),
    );
  });

  it('names a GitHub owner and repository for each mapped dependency', () => {
    for (const repository of Object.values(DEPENDENCY_REPOSITORIES)) {
      if (repository !== null)
        expect(repository).toMatch(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
    }
  });

  it('leaves unwatched only the dependencies that publish no repository', () => {
    expect(
      Object.entries(DEPENDENCY_REPOSITORIES)
        .filter(([, repository]) => repository === null)
        .map(([name]) => name),
    ).toEqual(['server-only']);
  });

  it('watches each repository once, including the ones whose advisories Dependabot missed', () => {
    const repositories = watchedRepositories();
    expect(new Set(repositories).size).toBe(repositories.length);
    expect(repositories).toEqual([...repositories].sort());
    expect(repositories).toEqual(
      expect.arrayContaining([
        'vercel/next.js',
        'getsentry/sentry-javascript',
        'vitejs/vite',
        'clerk/javascript',
      ]),
    );
  });
});

describe('watching several repositories', () => {
  it('raises what it can read and names the repositories it could not', async () => {
    const issues = new MemoryIssues();
    const outcome = await watchUpstreamAdvisories(
      ['broken/repo', 'vercel/next.js'],
      manifest,
      issues,
      async (repository) => {
        if (repository === 'broken/repo') throw new Error('HTTP 404');
        return [advisory()];
      },
    );
    expect(outcome).toEqual({
      raised: ['GHSA-aaaa-bbbb-cccc'],
      unreadable: ['broken/repo'],
    });
    expect(issues.issues).toHaveLength(1);
  });
});

describe('watch command outcome', () => {
  const output = () => {
    const messages: string[] = [];
    const errors: string[] = [];
    return {
      messages,
      errors,
      sink: {
        log: (message: string) => messages.push(message),
        error: (message: string) => errors.push(message),
      },
    };
  };

  it('reports the advisories raised and returns zero', async () => {
    const { messages, errors, sink } = output();
    expect(
      await runUpstreamAdvisoryWatch(
        async () => ({ raised: ['GHSA-aaaa-bbbb-cccc'], unreadable: [] }),
        sink,
      ),
    ).toBe(0);
    expect(messages).toEqual([
      'Upstream advisories raised: GHSA-aaaa-bbbb-cccc',
    ]);
    expect(errors).toEqual([]);
  });

  it('fails the run, after raising what it could, when a repository is unreadable', async () => {
    const { messages, errors, sink } = output();
    expect(
      await runUpstreamAdvisoryWatch(
        async () => ({
          raised: ['GHSA-aaaa-bbbb-cccc'],
          unreadable: ['broken/repo', 'gone/repo'],
        }),
        sink,
      ),
    ).toBe(1);
    expect(messages).toEqual([
      'Upstream advisories raised: GHSA-aaaa-bbbb-cccc',
    ]);
    expect(errors).toEqual([
      'Could not read advisories for: broken/repo, gone/repo',
    ]);
  });

  it('wires the default check: reads every watched repository, lists issues once, and opens one per new advisory', async () => {
    const run = vi.mocked(execFileSync).mockImplementation((_file, args) => {
      const path = args?.[3] ?? '';
      if (
        path ===
        'repos/vercel/next.js/security-advisories?state=published&per_page=100'
      )
        return JSON.stringify([[apiAdvisory]]);
      if (path.includes('/security-advisories?') || path.includes('/issues?'))
        return JSON.stringify([[]]);
      return '';
    });
    const { messages, errors, sink } = output();
    expect(await runUpstreamAdvisoryWatch(undefined, sink)).toBe(0);
    expect(errors).toEqual([]);
    expect(messages).toEqual([
      'Upstream advisories raised: GHSA-aaaa-bbbb-cccc',
    ]);
    const calls = run.mock.calls.map(([, args]) => args ?? []);
    expect(
      calls
        .map((args) => args[3] ?? '')
        .filter((path) => path.includes('/security-advisories?')),
    ).toEqual(
      watchedRepositories().map(
        (repository) =>
          `repos/${repository}/security-advisories?state=published&per_page=100`,
      ),
    );
    const creates = calls.filter((args) => args[1] === 'create');
    expect(creates).toHaveLength(1);
    expect(creates[0]?.slice(0, 4)).toEqual([
      'issue',
      'create',
      '--title',
      'Upstream security advisory GHSA-aaaa-bbbb-cccc (critical): next',
    ]);
    expect(creates[0]?.[5]).toMatch(/`package\.json` pins `next` at `[^`]+`/);
  });

  it('reports a quiet run', async () => {
    const { messages, sink } = output();
    expect(
      await runUpstreamAdvisoryWatch(
        async () => ({ raised: [], unreadable: [] }),
        sink,
      ),
    ).toBe(0);
    expect(messages).toEqual(['Upstream advisories raised: none']);
  });

  it('returns nonzero with value-free diagnostics when the check fails', async () => {
    const { errors, sink } = output();
    expect(
      await runUpstreamAdvisoryWatch(async () => {
        throw new Error('private fixture detail');
      }, sink),
    ).toBe(1);
    expect(errors).toEqual([
      'Upstream advisory watch failed; inspect the advisory source and GitHub issue access.',
    ]);
  });
});

describe('upstream advisory workflow', () => {
  it('runs every six hours with serialized issue writes and only the needed token scope', () => {
    const workflow = parse(
      readFileSync('.github/workflows/upstream-advisory-watch.yml', 'utf8'),
    );
    expect(workflow.on).toEqual({
      schedule: [{ cron: '23 */6 * * *' }],
      workflow_dispatch: null,
    });
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.concurrency).toEqual({
      group: 'upstream-advisory-watch',
      'cancel-in-progress': false,
    });
    expect(workflow.jobs.watch.permissions).toEqual({
      contents: 'read',
      issues: 'write',
    });
    expect(workflow.jobs.watch['timeout-minutes']).toBe(5);
    for (const step of workflow.jobs.watch.steps) {
      if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
    }
    expect(workflow.jobs.watch.steps.at(-1)).toMatchObject({
      run: 'node scripts/upstream-advisory-watch.ts',
      env: {
        GH_TOKEN: `${'$'}{{ github.token }}`,
        GH_REPO: `${'$'}{{ github.repository }}`,
      },
    });
  });
});
