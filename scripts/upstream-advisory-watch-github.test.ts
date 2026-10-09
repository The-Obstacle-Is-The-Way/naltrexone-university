import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGithubAdvisoryIssues,
  githubAdvisoryDatabase,
  listUpstreamAdvisories,
  RateLimited,
  RepositoryNotFound,
} from './upstream-advisory-watch';
import { advisory, apiAdvisory } from './upstream-advisory-watch-test-helpers';

// The GitHub adapters: advisory listing, issues, and GitHub's database.
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

afterEach(() => {
  vi.resetAllMocks();
});

const watcher = { login: 'github-actions[bot]' };

const notFound = () => {
  throw Object.assign(new Error('Command failed'), {
    stderr: 'gh: Not Found (HTTP 404)\n',
  });
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
        failure('gh: Server Error (HTTP 500)\n'),
      ),
    ).rejects.not.toBeInstanceOf(RepositoryNotFound);
  });

  it.each([
    'gh: API rate limit exceeded for installation ID 1. (HTTP 403)\n',
    'gh: You have exceeded a secondary rate limit. (HTTP 429)\n',
  ])('reports a spent API rate limit as such: %s', async (stderr) => {
    await expect(
      listUpstreamAdvisories('nodejs/undici', () => {
        throw Object.assign(new Error('Command failed'), { stderr });
      }),
    ).rejects.toBeInstanceOf(RateLimited);
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
        [{ number: 42, title: 'Alert', state: 'closed', user: watcher }],
        [
          {
            number: 43,
            title: 'PR',
            state: 'open',
            user: watcher,
            pull_request: {},
          },
        ],
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
    { user: null },
    { user: { login: 7 } },
  ])('refuses malformed issue fields %j', async (overrides) => {
    const issues = createGithubAdvisoryIssues(() =>
      JSON.stringify([
        [
          {
            number: 42,
            title: 'Alert',
            state: 'open',
            user: watcher,
            ...overrides,
          },
        ],
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

// Anyone can open an issue in a public repository. Only the watcher's own
// issues, and the owner's, may settle an advisory or be closed by the watcher,
// so an issue titled with a GHSA ID cannot silence its alert.
describe('GitHub issue authors', () => {
  it('lists only the watcher’s and the repository owner’s issues', async () => {
    const issues = createGithubAdvisoryIssues(
      () =>
        JSON.stringify([
          [
            { number: 1, title: 'Bot', state: 'open', user: watcher },
            {
              number: 2,
              title: 'Owner',
              state: 'open',
              user: { login: 'repo-owner' },
            },
            {
              number: 3,
              title: 'Upstream security advisory GHSA-aaaa-bbbb-cccc',
              state: 'open',
              user: { login: 'stranger' },
            },
          ],
        ]),
      'repo-owner',
    );
    expect((await issues.list()).map((issue) => issue.number)).toEqual([1, 2]);
  });

  it('trusts only the watcher when no owner is configured, as in a local run', async () => {
    const issues = createGithubAdvisoryIssues(
      () =>
        JSON.stringify([
          [
            { number: 1, title: 'Bot', state: 'open', user: watcher },
            {
              number: 2,
              title: 'Person',
              state: 'open',
              user: { login: 'repo-owner' },
            },
          ],
        ]),
      null,
    );
    expect((await issues.list()).map((issue) => issue.number)).toEqual([1]);
  });
});

describe('closing and reading issues', () => {
  it('closes an issue as not planned, with its comment', async () => {
    const commands: string[][] = [];
    await createGithubAdvisoryIssues((args) => {
      commands.push(args);
      return '';
    }, 'repo-owner').close(42, 'Reviewed');
    expect(commands).toEqual([
      [
        'issue',
        'close',
        '42',
        '--reason',
        'not planned',
        '--comment',
        'Reviewed',
      ],
    ]);
  });

  it('reads every page of an issue’s comments', async () => {
    const commands: string[][] = [];
    const issues = createGithubAdvisoryIssues((args) => {
      commands.push(args);
      return JSON.stringify([[{ body: 'first' }], [{ body: 'second' }]]);
    }, 'repo-owner');
    expect(await issues.comments(42)).toEqual(['first', 'second']);
    expect(commands).toEqual([
      [
        'api',
        '--paginate',
        '--slurp',
        'repos/{owner}/{repo}/issues/42/comments?per_page=100',
      ],
    ]);
  });

  it.each([[[{ body: 7 }]], [[null]], [{}]])(
    'refuses malformed comments %j',
    async (data) => {
      const issues = createGithubAdvisoryIssues(
        () => JSON.stringify(data),
        'repo-owner',
      );
      await expect(issues.comments(42)).rejects.toThrow(
        'Invalid GitHub comment response',
      );
    },
  );
});

describe('GitHub advisory database', () => {
  it('reads an advisory’s reviewed npm ranges', async () => {
    const commands: string[][] = [];
    const found = await githubAdvisoryDatabase((args) => {
      commands.push(args);
      return JSON.stringify({
        ghsa_id: 'GHSA-aaaa-bbbb-cccc',
        github_reviewed_at: '2026-10-08T20:30:00Z',
        vulnerabilities: [
          {
            package: { ecosystem: 'npm', name: 'brace-expansion' },
            vulnerable_version_range: '>= 4.0.0, < 5.0.9',
          },
        ],
      });
    }).find('GHSA-aaaa-bbbb-cccc');
    expect(commands).toEqual([['api', 'advisories/GHSA-aaaa-bbbb-cccc']]);
    expect(found).toEqual({
      reviewed: true,
      vulnerabilities: [
        {
          ecosystem: 'npm',
          package: 'brace-expansion',
          range: '>= 4.0.0, < 5.0.9',
        },
      ],
    });
  });

  it('reports an unreviewed advisory as unreviewed', async () => {
    const found = await githubAdvisoryDatabase(() =>
      JSON.stringify({
        ghsa_id: 'GHSA-aaaa-bbbb-cccc',
        github_reviewed_at: null,
        vulnerabilities: [],
      }),
    ).find('GHSA-aaaa-bbbb-cccc');
    expect(found).toEqual({ reviewed: false, vulnerabilities: [] });
  });

  it('returns null for an advisory the database does not have yet', async () => {
    expect(
      await githubAdvisoryDatabase(notFound).find('GHSA-aaaa-bbbb-cccc'),
    ).toBeNull();
  });

  it('refuses an identifier that is not a GHSA ID, since it becomes an API path', async () => {
    const run = vi.fn(() => '{}');
    await expect(
      githubAdvisoryDatabase(run).find('../repos/x/y'),
    ).rejects.toThrow('Invalid GHSA ID');
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    { github_reviewed_at: 7 },
    { vulnerabilities: null },
    { vulnerabilities: [{ package: null }] },
    {
      vulnerabilities: [
        {
          package: { ecosystem: 'npm', name: 'x' },
          vulnerable_version_range: 7,
        },
      ],
    },
  ])('refuses a malformed database response %j', async (overrides) => {
    await expect(
      githubAdvisoryDatabase(() =>
        JSON.stringify({
          ghsa_id: 'GHSA-aaaa-bbbb-cccc',
          github_reviewed_at: null,
          vulnerabilities: [],
          ...overrides,
        }),
      ).find('GHSA-aaaa-bbbb-cccc'),
    ).rejects.toThrow('Invalid GitHub advisory database response');
  });
});
