import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '../../tests/shared/process-env';
import { ghRunnerFailure } from '../lib/github-cli-test-helpers';
import {
  DEPENDENCY_REPOSITORIES,
  lockfilePackages,
  RateLimited,
  RepositoryNotFound,
  raiseUpstreamAdvisories,
  runUpstreamAdvisoryWatch,
  WATCH_START,
  watchedRepositories,
  watchLockfile,
  watchUpstreamAdvisories,
} from './upstream-advisory-watch.mjs';
import {
  advisory,
  apiAdvisory,
  MemoryIssues,
  manifest,
  unreviewed,
} from './upstream-advisory-watch-test-helpers';

const originalEnv = snapshotProcessEnv();

afterEach(() => {
  restoreProcessEnv(originalEnv);
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('raising upstream advisories', () => {
  it('opens one issue for an advisory published after the watch start', async () => {
    const issues = new MemoryIssues();
    expect(
      await raiseUpstreamAdvisories([advisory()], manifest, issues, unreviewed),
    ).toEqual({
      raised: ['GHSA-aaaa-bbbb-cccc'],
      failed: [],
      ruledOut: [],
      unreviewed: [],
    });
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
    ).toEqual({ raised: [], failed: [], ruledOut: [], unreviewed: [] });
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
        comments: [],
      });
      expect(
        await raiseUpstreamAdvisories([advisory()], manifest, issues),
      ).toEqual({ raised: [], failed: [], ruledOut: [], unreviewed: [] });
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
      'docs/policies/supply-chain.md#urgent-cve-patches-before-the-7-day-cooldown',
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
      await raiseUpstreamAdvisories(
        [advisory(), advisory()],
        manifest,
        issues,
        unreviewed,
      ),
    ).toEqual({
      raised: ['GHSA-aaaa-bbbb-cccc'],
      failed: [],
      ruledOut: [],
      unreviewed: [],
    });
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
        unreviewed,
      ),
    ).toEqual({
      raised: ['GHSA-dddd-eeee-ffff'],
      failed: ['GHSA-aaaa-bbbb-cccc'],
      ruledOut: [],
      unreviewed: [],
    });
    expect(issues.issues.map((issue) => issue.title)).toEqual([
      'Upstream security advisory GHSA-dddd-eeee-ffff (critical): next',
    ]);
  });

  it('names gh’s reason beside an issue it could not open and a review it could not read', async () => {
    const refused = await ghRunnerFailure(
      'GraphQL: Resource not accessible by integration (createIssue)\n',
    );
    const unread = await ghRunnerFailure(
      'gh: Resource not accessible by integration (HTTP 403)\n',
    );
    const issues = new MemoryIssues();
    issues.create = async () => {
      throw refused;
    };
    expect(
      await raiseUpstreamAdvisories([advisory()], manifest, issues, {
        find: async () => {
          throw unread;
        },
      }),
    ).toEqual({
      raised: [],
      failed: [
        'GHSA-aaaa-bbbb-cccc (GraphQL: Resource not accessible by integration (createIssue))',
      ],
      ruledOut: [],
      unreviewed: [
        'GHSA-aaaa-bbbb-cccc (gh: Resource not accessible by integration (HTTP 403))',
      ],
    });
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

describe('watching several repositories', () => {
  // BUG-344's hosted logs show newly created issues can be missing from the
  // next listing. Reporting a refused lookup must not depend on that listing.
  it.each([false, true])(
    'reports a refused review and fails after raising, with new issues visible: %s',
    async (visible) => {
      const issues = new MemoryIssues();
      if (!visible) issues.list = async () => [];
      const errors: string[] = [];

      const code = await runUpstreamAdvisoryWatch(
        () =>
          watchUpstreamAdvisories(
            { direct: ['vercel/next.js'], indirect: [] },
            manifest,
            issues,
            async () => [advisory()],
            {
              find: async () => {
                throw new Error('HTTP 403');
              },
            },
          ),
        { log: () => {}, error: (message) => errors.push(message) },
      );

      expect(issues.issues).toHaveLength(1);
      expect(issues.issues[0]?.state).toBe('OPEN');
      expect(code).toBe(1);
      expect(errors).toEqual([
        'Could not read GitHub’s review of: GHSA-aaaa-bbbb-cccc',
      ]);
    },
  );

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
      unreviewed,
    );
    expect(outcome).toEqual({
      raised: ['GHSA-aaaa-bbbb-cccc'],
      failed: [],
      ruledOut: [],
      closed: [],
      unreviewed: [],
      read: 1,
      unreadable: ['broken/repo'],
      unwatched: [],
    });
    expect(issues.issues).toHaveLength(1);
  });

  // A read that fails for any other reason, such as the passing 502 that
  // failed the scheduled run of 2026-10-11 12:58Z, is tried once more, as a
  // package manifest is, so one bad answer among ~390 reads does not fail it.
  it('reads a repository once more after a failed read, and fails nothing when that read works', async () => {
    const issues = new MemoryIssues();
    const read: string[] = [];
    const outcome = await watchUpstreamAdvisories(
      { direct: [], indirect: ['nodejs/undici'] },
      manifest,
      issues,
      async (repository) => {
        read.push(repository);
        if (read.length === 1) throw new Error('gh: Server Error (HTTP 502)');
        return [advisory()];
      },
      unreviewed,
    );
    expect(read).toEqual(['nodejs/undici', 'nodejs/undici']);
    expect(outcome).toMatchObject({
      raised: ['GHSA-aaaa-bbbb-cccc'],
      read: 1,
      unreadable: [],
    });
  });

  it('names a repository unreadable when its second read fails too', async () => {
    const read: string[] = [];
    const outcome = await watchUpstreamAdvisories(
      { direct: ['broken/repo'], indirect: [] },
      manifest,
      new MemoryIssues(),
      async (repository) => {
        read.push(repository);
        throw new Error('gh: Server Error (HTTP 502)');
      },
      unreviewed,
    );
    expect(read).toEqual(['broken/repo', 'broken/repo']);
    expect(outcome).toMatchObject({ read: 0, unreadable: ['broken/repo'] });
  });

  it('names gh’s reason beside a repository it could not read', async () => {
    const failure = await ghRunnerFailure('gh: Server Error (HTTP 502)\n');
    const outcome = await watchUpstreamAdvisories(
      { direct: ['broken/repo'], indirect: [] },
      manifest,
      new MemoryIssues(),
      async () => {
        throw failure;
      },
      unreviewed,
    );
    expect(outcome).toMatchObject({
      read: 0,
      unreadable: ['broken/repo (gh: Server Error (HTTP 502))'],
    });
  });

  // A missing repository stays missing, so it is not asked for twice.
  it('reads a missing repository only once', async () => {
    const read: string[] = [];
    await watchUpstreamAdvisories(
      { direct: ['gone/direct'], indirect: ['substack/node-commondir'] },
      manifest,
      new MemoryIssues(),
      async (repository) => {
        read.push(repository);
        throw new RepositoryNotFound(repository);
      },
      unreviewed,
    );
    expect(read).toEqual(['gone/direct', 'substack/node-commondir']);
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
        unreviewed,
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
        unreviewed,
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
      unreviewed,
    );
    expect(outcome).toEqual({
      raised: [],
      failed: [],
      ruledOut: [],
      closed: [],
      unreviewed: [],
      read: 0,
      unreadable: ['gone/direct', 'nodejs/undici'],
      unwatched: ['substack/node-commondir'],
    });
  });

  // Once the token's hourly requests are spent, every later read and issue
  // write would be refused too, so the run stops instead of listing them all.
  it('stops at the first read refused for the rate limit, raising nothing', async () => {
    const issues = new MemoryIssues();
    const read: string[] = [];
    await expect(
      watchUpstreamAdvisories(
        { direct: ['vercel/next.js', 'facebook/react'], indirect: ['a/b'] },
        manifest,
        issues,
        async (repository) => {
          read.push(repository);
          if (repository === 'facebook/react') throw new RateLimited();
          return [advisory()];
        },
        unreviewed,
      ),
    ).rejects.toBeInstanceOf(RateLimited);
    expect(read).toEqual(['vercel/next.js', 'facebook/react']);
    expect(issues.issues).toEqual([]);
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
    ruledOut: [],
    closed: [],
    unreviewed: [],
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
    expect(errors).toEqual([
      'Could not open or close issues for: GHSA-aaaa-bbbb-cccc',
    ]);
  });

  // BUG-344: a review lookup GitHub refused read as a failed issue write.
  it('names an advisory whose review it could not read, and returns nonzero', async () => {
    const { messages, errors, sink } = output();
    expect(
      await runUpstreamAdvisoryWatch(
        async () => ({ ...quiet, unreviewed: ['GHSA-aaaa-bbbb-cccc'] }),
        sink,
      ),
    ).toBe(1);
    expect(messages).toEqual([
      'Upstream advisories raised: none',
      'Repositories read: 3',
    ]);
    expect(errors).toEqual([
      'Could not read GitHub’s review of: GHSA-aaaa-bbbb-cccc',
    ]);
  });

  it('reports the advisories GitHub’s review ruled out and the issues it closed', async () => {
    const { messages, errors, sink } = output();
    expect(
      await runUpstreamAdvisoryWatch(
        async () => ({
          ...quiet,
          ruledOut: ['GHSA-dddd-eeee-ffff'],
          closed: ['GHSA-aaaa-bbbb-cccc'],
        }),
        sink,
      ),
    ).toBe(0);
    expect(messages).toEqual([
      'Upstream advisories raised: none',
      'Not raised, ruled out by GitHub’s review: GHSA-dddd-eeee-ffff',
      'Closed after GitHub’s review: GHSA-aaaa-bbbb-cccc',
      'Repositories read: 3',
    ]);
    expect(errors).toEqual([]);
  });

  it('wires the lockfile check: reads direct and indirect repositories and opens one issue per new advisory', async () => {
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
    const run = vi.fn((args: string[]) => {
      // GitHub's database has neither advisory yet.
      if (args?.[0] === 'api' && args[1]?.startsWith('advisories?'))
        return '[]';
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
    expect(await runUpstreamAdvisoryWatch(() => watchLockfile(run), sink)).toBe(
      0,
    );
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
    const calls = run.mock.calls.map(([args]) => args);
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
    expect(calls.filter((args) => args[1]?.startsWith('advisories'))).toEqual([
      ['api', 'advisories?ghsa_id=GHSA-aaaa-bbbb-cccc'],
      ['api', 'advisories?ghsa_id=GHSA-hhhh-hhhh-hhhh'],
    ]);
  });

  it('says the rate limit ran out, and returns nonzero', async () => {
    const { errors, sink } = output();
    expect(
      await runUpstreamAdvisoryWatch(async () => {
        throw new RateLimited();
      }, sink),
    ).toBe(1);
    expect(errors).toEqual([
      'GitHub’s API rate limit ran out, so nothing was raised; the next run reads every repository again.',
    ]);
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

  it('adds gh’s own line when a gh call fails', async () => {
    const failure = await ghRunnerFailure('gh: Bad credentials (HTTP 401)\n');
    const { errors, sink } = output();
    expect(
      await runUpstreamAdvisoryWatch(async () => {
        throw failure;
      }, sink),
    ).toBe(1);
    expect(errors).toEqual([
      'Upstream advisory watch failed; inspect the advisory source and GitHub issue access. Cause: gh: Bad credentials (HTTP 401)',
    ]);
  });
});

describe('upstream advisory workflow', () => {
  it('runs every three hours with serialized issue writes and only the needed token scope', () => {
    const workflow = parse(
      readFileSync('.github/workflows/upstream-advisory-watch.yml', 'utf8'),
    );
    expect(workflow.on).toEqual({
      schedule: [{ cron: '23 */3 * * *' }],
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
      run: 'node scripts/watchers/upstream-advisory-watch.mts',
      env: {
        GH_TOKEN: `${'$'}{{ github.token }}`,
        GH_REPO: `${'$'}{{ github.repository }}`,
      },
    });
  });
});
