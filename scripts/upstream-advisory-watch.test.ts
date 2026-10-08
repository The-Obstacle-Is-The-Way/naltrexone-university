import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '../tests/shared/process-env';
import {
  type AdvisoryIssue,
  type AdvisoryIssues,
  createGithubAdvisoryIssues,
  DEPENDENCY_REPOSITORIES,
  type DependencyVersions,
  listUpstreamAdvisories,
  lockfilePackages,
  RepositoryNotFound,
  raiseUpstreamAdvisories,
  runUpstreamAdvisoryWatch,
  type UpstreamAdvisory,
  WATCH_START,
  watchedRepositories,
  watchUpstreamAdvisories,
} from './upstream-advisory-watch';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const originalEnv = snapshotProcessEnv();

afterEach(() => {
  restoreProcessEnv(originalEnv);
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

class MemoryIssues implements AdvisoryIssues {
  issues: (AdvisoryIssue & { body: string; urgent: boolean })[] = [];
  async list() {
    return this.issues;
  }
  async create(title: string, body: string, urgent: boolean) {
    this.issues.push({
      number: this.issues.length + 1,
      title,
      body,
      state: 'OPEN',
      urgent,
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

const manifest: DependencyVersions = {
  direct: { next: '16.3.6' },
  locked: new Map([
    ['next', ['16.3.6']],
    ['undici', ['6.21.0', '7.29.1']],
  ]),
};

describe('raising upstream advisories', () => {
  it('opens one issue for an advisory published after the watch start', async () => {
    const issues = new MemoryIssues();
    expect(
      await raiseUpstreamAdvisories([advisory()], manifest, issues),
    ).toEqual({ raised: ['GHSA-aaaa-bbbb-cccc'], failed: [] });
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
    ).toEqual({ raised: [], failed: [] });
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
        urgent: true,
      });
      expect(
        await raiseUpstreamAdvisories([advisory()], manifest, issues),
      ).toEqual({ raised: [], failed: [] });
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
    expect(body).toContain(
      '`package.json` pins `next` at `16.3.6`, and `pnpm-lock.yaml` resolves `16.3.6`',
    );
    expect(body).toContain(
      'docs/dev/supply-chain-overrides.md#urgent-cve-patches-before-the-7-day-cooldown',
    );
  });

  it('says so when an affected package is not in the lockfile', async () => {
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
    expect(issue?.body).toContain('`@next/env` is not in `pnpm-lock.yaml`');
  });

  // Upstream ranges are free text ("7.0.0 < 7.28.0" means from 7.0.0), so the
  // locked versions are shown beside them rather than compared by a parser.
  it('gives every locked version of an indirect dependency for triage', async () => {
    const issues = new MemoryIssues();
    await raiseUpstreamAdvisories(
      [
        advisory({
          vulnerabilities: [
            {
              package: 'undici',
              vulnerableRange: '< 6.28.1; 7.0.0 < 7.29.1',
              patchedVersions: '6.28.1, 7.29.1',
            },
          ],
        }),
      ],
      manifest,
      issues,
    );
    expect(issues.issues[0]?.body).toContain(
      '`undici` is an indirect dependency; `pnpm-lock.yaml` resolves `6.21.0`, `7.29.1`',
    );
  });

  it('does not read a package named after an Object property as a pin', async () => {
    const issues = new MemoryIssues();
    await raiseUpstreamAdvisories(
      [
        advisory({
          vulnerabilities: [
            {
              package: 'constructor',
              vulnerableRange: null,
              patchedVersions: null,
            },
          ],
        }),
      ],
      manifest,
      issues,
    );
    expect(issues.issues[0]?.body).toContain(
      '`constructor` is not in `pnpm-lock.yaml`',
    );
  });

  it('raises each new advisory once when the same run lists it twice', async () => {
    const issues = new MemoryIssues();
    expect(
      await raiseUpstreamAdvisories([advisory(), advisory()], manifest, issues),
    ).toEqual({ raised: ['GHSA-aaaa-bbbb-cccc'], failed: [] });
    expect(issues.issues).toHaveLength(1);
  });

  // The playbook ships a critical or high fix the same day, so those issues
  // must reach a person directly; medium and low stay in the issue list.
  it.each([
    ['critical', true],
    ['high', true],
    ['medium', false],
    ['low', false],
  ] as const)('marks a %s advisory urgent: %s', async (severity, urgent) => {
    const issues = new MemoryIssues();
    await raiseUpstreamAdvisories([advisory({ severity })], manifest, issues);
    expect(issues.issues.map((issue) => issue.urgent)).toEqual([urgent]);
  });

  // One issue that cannot be opened (a timeout, a rejected assignee) must not
  // stop the advisories after it from being raised in the same run.
  it('keeps raising after one issue cannot be opened, and names the one that failed', async () => {
    const issues = new MemoryIssues();
    const create = issues.create.bind(issues);
    issues.create = async (title, body, urgent) => {
      if (title.includes('GHSA-aaaa-bbbb-cccc'))
        throw new Error('GitHub unavailable');
      await create(title, body, urgent);
    };
    expect(
      await raiseUpstreamAdvisories(
        [advisory(), advisory({ ghsaId: 'GHSA-dddd-eeee-ffff' })],
        manifest,
        issues,
      ),
    ).toEqual({
      raised: ['GHSA-dddd-eeee-ffff'],
      failed: ['GHSA-aaaa-bbbb-cccc'],
    });
    expect(issues.issues.map((issue) => issue.title)).toEqual([
      'Upstream security advisory GHSA-dddd-eeee-ffff (critical): next',
    ]);
  });

  it('fails outright when existing issues cannot be listed, since it could not deduplicate', async () => {
    const issues = new MemoryIssues();
    issues.list = async () => {
      throw new Error('GitHub unavailable');
    };
    await expect(
      raiseUpstreamAdvisories([advisory()], manifest, issues),
    ).rejects.toThrow('GitHub unavailable');
  });
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

  it('reports a repository that no longer exists apart from other failures', async () => {
    const failure = (stderr: string) => () => {
      throw Object.assign(new Error('Command failed'), { stderr });
    };
    await expect(
      listUpstreamAdvisories(
        'substack/node-commondir',
        failure('gh: Not Found (HTTP 404)\n'),
      ),
    ).rejects.toBeInstanceOf(RepositoryNotFound);
    await expect(
      listUpstreamAdvisories(
        'nodejs/undici',
        failure('gh: API rate limit exceeded (HTTP 403)\n'),
      ),
    ).rejects.not.toBeInstanceOf(RepositoryNotFound);
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
    await createGithubAdvisoryIssues(undefined, 'repo-owner').create(
      'Alert',
      'Details',
      false,
    );
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['issue', 'create', '--title', 'Alert', '--body', 'Details'],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 32 * 1024 * 1024 },
    );
  });

  it('assigns an urgent issue, so its assignee is notified whatever their watch setting', async () => {
    const commands: string[][] = [];
    await createGithubAdvisoryIssues((args) => {
      commands.push(args);
      return '';
    }, 'repo-owner').create('Alert', 'Details', true);
    expect(commands).toEqual([
      [
        'issue',
        'create',
        '--title',
        'Alert',
        '--body',
        'Details',
        '--assignee',
        'repo-owner',
      ],
    ]);
  });

  it('still opens an urgent issue when no assignee is configured, as in a local run', async () => {
    const commands: string[][] = [];
    await createGithubAdvisoryIssues((args) => {
      commands.push(args);
      return '';
    }, null).create('Alert', 'Details', true);
    expect(commands).toEqual([
      ['issue', 'create', '--title', 'Alert', '--body', 'Details'],
    ]);
  });
});

describe('watching several repositories', () => {
  it('raises what it can read and names the repositories it could not', async () => {
    const issues = new MemoryIssues();
    const outcome = await watchUpstreamAdvisories(
      { direct: ['broken/repo', 'vercel/next.js'], indirect: [] },
      manifest,
      issues,
      async (repository) => {
        if (repository === 'broken/repo') throw new Error('HTTP 500');
        return [advisory()];
      },
    );
    expect(outcome).toEqual({
      raised: ['GHSA-aaaa-bbbb-cccc'],
      failed: [],
      read: 1,
      unreadable: ['broken/repo'],
      unwatched: [],
    });
    expect(issues.issues).toHaveLength(1);
  });

  // Medium and low advisories from those repositories reach Dependabot in
  // time (106 of 109 in the year to 2026-10-08), so only the ones the
  // same-day rule acts on are raised early. An unknown severity is raised.
  it.each([
    ['critical', true],
    ['high', true],
    ['unknown', true],
    ['medium', false],
    ['low', false],
  ] as const)(
    'raises a %s advisory from a repository reached only indirectly: %s',
    async (severity, raised) => {
      const issues = new MemoryIssues();
      await watchUpstreamAdvisories(
        { direct: [], indirect: ['nodejs/undici'] },
        manifest,
        issues,
        async () => [advisory({ severity })],
      );
      expect(issues.issues).toHaveLength(raised ? 1 : 0);
    },
  );

  it.each(['medium', 'low'])(
    'still raises a %s advisory from a direct dependency’s repository',
    async (severity) => {
      const issues = new MemoryIssues();
      await watchUpstreamAdvisories(
        { direct: ['vercel/next.js'], indirect: [] },
        manifest,
        issues,
        async () => [advisory({ severity })],
      );
      expect(issues.issues).toHaveLength(1);
    },
  );

  // A deleted upstream repository can publish nothing, so it narrows the
  // watch without failing every run; a direct dependency's must be fixed.
  it('lists a missing indirect repository as unwatched, but a missing direct one as unreadable', async () => {
    const outcome = await watchUpstreamAdvisories(
      {
        direct: ['gone/direct'],
        indirect: ['substack/node-commondir', 'nodejs/undici'],
      },
      manifest,
      new MemoryIssues(),
      async (repository) => {
        if (repository === 'nodejs/undici') throw new Error('HTTP 403');
        throw new RepositoryNotFound(repository);
      },
    );
    expect(outcome).toEqual({
      raised: [],
      failed: [],
      read: 0,
      unreadable: ['gone/direct', 'nodejs/undici'],
      unwatched: ['substack/node-commondir'],
    });
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

  const quiet = {
    raised: [],
    failed: [],
    read: 3,
    unreadable: [],
    unwatched: [],
  };

  it('reports the advisories raised and the repositories read, and returns zero', async () => {
    const { messages, errors, sink } = output();
    expect(
      await runUpstreamAdvisoryWatch(
        async () => ({ ...quiet, raised: ['GHSA-aaaa-bbbb-cccc'] }),
        sink,
      ),
    ).toBe(0);
    expect(messages).toEqual([
      'Upstream advisories raised: GHSA-aaaa-bbbb-cccc',
      'Repositories read: 3',
    ]);
    expect(errors).toEqual([]);
  });

  it('names what it cannot watch without failing the run', async () => {
    const { messages, errors, sink } = output();
    expect(
      await runUpstreamAdvisoryWatch(
        async () => ({
          ...quiet,
          unwatched: ['eyes@0.1.8', 'substack/node-commondir'],
        }),
        sink,
      ),
    ).toBe(0);
    expect(messages).toEqual([
      'Upstream advisories raised: none',
      'Repositories read: 3',
      'Not watched, no GitHub repository to read: eyes@0.1.8, substack/node-commondir',
    ]);
    expect(errors).toEqual([]);
  });

  it('fails the run, after raising what it could, when a repository is unreadable', async () => {
    const { messages, errors, sink } = output();
    expect(
      await runUpstreamAdvisoryWatch(
        async () => ({
          ...quiet,
          raised: ['GHSA-aaaa-bbbb-cccc'],
          unreadable: ['broken/repo', 'fast-uri@3.1.8'],
        }),
        sink,
      ),
    ).toBe(1);
    expect(messages).toEqual([
      'Upstream advisories raised: GHSA-aaaa-bbbb-cccc',
      'Repositories read: 3',
    ]);
    expect(errors).toEqual([
      'Could not read advisories for: broken/repo, fast-uri@3.1.8',
    ]);
  });

  it('fails the run, after reporting what it raised, when an issue could not be opened', async () => {
    const { messages, errors, sink } = output();
    expect(
      await runUpstreamAdvisoryWatch(
        async () => ({
          ...quiet,
          raised: ['GHSA-dddd-eeee-ffff'],
          failed: ['GHSA-aaaa-bbbb-cccc'],
        }),
        sink,
      ),
    ).toBe(1);
    expect(messages).toEqual([
      'Upstream advisories raised: GHSA-dddd-eeee-ffff',
      'Repositories read: 3',
    ]);
    expect(errors).toEqual(['Could not open issues for: GHSA-aaaa-bbbb-cccc']);
  });

  it('wires the default check: reads every direct and indirect repository, lists issues once, and opens one per new advisory', async () => {
    // Every package in the lockfile resolves to a watched repository except
    // @next/env, which `next` always locks; it stands in for an indirect one.
    const registry = vi.fn(async (url: string | URL | Request) =>
      Response.json({
        repository: String(url).includes('/@next%2Fenv/')
          ? 'git+https://github.com/example/indirect.git'
          : 'https://github.com/vercel/next.js',
      }),
    );
    vi.stubGlobal('fetch', registry);
    const run = vi.mocked(execFileSync).mockImplementation((_file, args) => {
      const path = args?.[3] ?? '';
      if (
        path ===
        'repos/vercel/next.js/security-advisories?state=published&per_page=100'
      )
        return JSON.stringify([[apiAdvisory]]);
      if (
        path ===
        'repos/example/indirect/security-advisories?state=published&per_page=100'
      )
        return JSON.stringify([
          [
            {
              ...apiAdvisory,
              ghsa_id: 'GHSA-hhhh-hhhh-hhhh',
              severity: 'high',
            },
            {
              ...apiAdvisory,
              ghsa_id: 'GHSA-mmmm-mmmm-mmmm',
              severity: 'medium',
            },
          ],
        ]);
      if (path.includes('/security-advisories?') || path.includes('/issues?'))
        return JSON.stringify([[]]);
      return '';
    });
    process.env.GITHUB_REPOSITORY_OWNER = 'repo-owner';
    const { messages, errors, sink } = output();
    expect(await runUpstreamAdvisoryWatch(undefined, sink)).toBe(0);
    expect(errors).toEqual([]);
    expect(messages).toEqual([
      'Upstream advisories raised: GHSA-aaaa-bbbb-cccc, GHSA-hhhh-hhhh-hhhh',
      `Repositories read: ${watchedRepositories().length + 1}`,
    ]);
    const locked = lockfilePackages(readFileSync('pnpm-lock.yaml', 'utf8'));
    expect(registry).toHaveBeenCalledTimes(
      locked.filter(({ name }) => !Object.hasOwn(DEPENDENCY_REPOSITORIES, name))
        .length,
    );
    const calls = run.mock.calls.map(([, args]) => args ?? []);
    expect(
      calls
        .map((args) => args[3] ?? '')
        .filter((path) => path.includes('/security-advisories?')),
    ).toEqual(
      [...watchedRepositories(), 'example/indirect'].map(
        (repository) =>
          `repos/${repository}/security-advisories?state=published&per_page=100`,
      ),
    );
    const creates = calls.filter((args) => args[1] === 'create');
    expect(creates.map((args) => args[3])).toEqual([
      'Upstream security advisory GHSA-aaaa-bbbb-cccc (critical): next',
      'Upstream security advisory GHSA-hhhh-hhhh-hhhh (high): next',
    ]);
    expect(creates[0]?.[5]).toMatch(
      /`package\.json` pins `next` at `[^`]+`, and `pnpm-lock\.yaml` resolves `[^`]+`/,
    );
    expect(creates[0]?.slice(6)).toEqual(['--assignee', 'repo-owner']);
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
    expect(workflow.jobs.watch['timeout-minutes']).toBe(15);
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
