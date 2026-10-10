import { describe, expect, it, vi } from 'vitest';
import {
  type AdvisoryDatabase,
  closeReviewedIssues,
  raiseUpstreamAdvisories,
  ruledOutByReview,
} from './upstream-advisory-watch';
import {
  advisory,
  MemoryIssues,
  manifest,
  reviewed,
  reviewedAs,
  unreviewed,
} from './upstream-advisory-watch-test-helpers';

// An issue opens on an upstream advisory's own word, which can be wrong about
// its versions. GitHub's review, the data Dependabot reads, settles them later.

const locked = new Map([
  ['brace-expansion', ['1.1.16', '5.0.7']],
  ['next', ['16.3.6']],
  ['canary', ['1.0.0-beta.1']],
]);

describe('GitHub’s review of an advisory', () => {
  it('rules it out when no locked version is in any reviewed range, giving the evidence', () => {
    expect(
      ruledOutByReview(
        reviewed(
          ['brace-expansion', '< 1.1.12'],
          ['brace-expansion', '>= 4.0.0, < 5.0.5'],
        ),
        locked,
      ),
    ).toEqual([
      '`brace-expansion` `< 1.1.12`: `pnpm-lock.yaml` resolves `1.1.16`, `5.0.7`',
      '`brace-expansion` `>= 4.0.0, < 5.0.5`: `pnpm-lock.yaml` resolves `1.1.16`, `5.0.7`',
    ]);
  });

  // GHSA-rgw5-rvv9-x895 as GitHub reviewed it. Upstream joined these four
  // ranges with commas meaning "or", which a reader of GitHub's syntax, where
  // a comma means "and", would take as excluding both locked versions.
  it('does not rule out GHSA-rgw5-rvv9-x895, which affected 1.1.16 and 5.0.7', () => {
    expect(
      ruledOutByReview(
        reviewed(
          ['brace-expansion', '< 1.1.18'],
          ['brace-expansion', '>= 2.0.0, < 2.1.4'],
          ['brace-expansion', '>= 3.0.0, < 3.0.6'],
          ['brace-expansion', '>= 4.0.0, < 5.0.9'],
        ),
        locked,
      ),
    ).toBeNull();
  });

  it.each([
    '< 16.3.7',
    '<= 16.3.6',
    '= 16.3.6',
    '>= 16.3.6',
    '> 16.3.5, < 16.4.0',
    '< 16.10.0',
  ])('finds 16.3.6 in %s', (range) => {
    expect(ruledOutByReview(reviewed(['next', range]), locked)).toBeNull();
  });

  it.each([
    '< 16.3.6',
    '> 16.3.6',
    '= 16.3.5',
    '>= 16.4.0, < 17.0.0',
    '< 2.0.0',
  ])('finds 16.3.6 outside %s', (range) => {
    expect(ruledOutByReview(reviewed(['next', range]), locked)).not.toBeNull();
  });

  it.each([
    ['an advisory GitHub does not have yet', null],
    [
      'an unreviewed advisory',
      { ...reviewed(['next', '< 1.0.0']), reviewed: false },
    ],
    ['an advisory naming no package', reviewed()],
    [
      'another ecosystem',
      {
        reviewed: true,
        vulnerabilities: [
          { ecosystem: 'rust', package: 'next', range: '< 1.0.0' },
        ],
      },
    ],
    // Next.js compiles React's server packages in rather than depending on them.
    [
      'a package the lockfile lacks',
      reviewed(['react-server-dom-webpack', '< 19.2.8']),
    ],
    [
      'a range outside GitHub’s syntax',
      reviewed(['next', '>= 5.0.0-beta.1, < 5.0.0-beta.6']),
    ],
    ['an upstream-style range', reviewed(['next', '7.0.0 < 7.28.0'])],
    ['a missing range', reviewed(['next', null])],
    ['a locked prerelease', reviewed(['canary', '< 0.9.0'])],
    [
      'one ruled-out and one unreadable entry',
      reviewed(['next', '< 1.0.0'], ['next', 'all versions']),
    ],
  ])('does not rule out %s', (_case, advisory) => {
    expect(ruledOutByReview(advisory, locked)).toBeNull();
  });
});

describe('closing issues GitHub’s review rules out', () => {
  const watcherIssue = (number: number, ghsaId: string) => ({
    number,
    title: `Upstream security advisory ${ghsaId} (high): brace-expansion`,
    body: '',
    state: 'OPEN' as const,
    urgent: true,
    comments: [] as string[],
  });

  it('closes the issue with the evidence once no locked version is affected', async () => {
    const issues = new MemoryIssues();
    issues.issues.push(watcherIssue(5, 'GHSA-aaaa-bbbb-cccc'));
    expect(
      await closeReviewedIssues(
        issues,
        locked,
        reviewedAs(['brace-expansion', '>= 4.0.0, < 5.0.5']),
      ),
    ).toEqual({ closed: ['GHSA-aaaa-bbbb-cccc'], failed: [] });
    const [issue] = issues.issues;
    expect(issue?.state).toBe('CLOSED');
    expect(issue?.comments[0]).toContain(
      '`brace-expansion` `>= 4.0.0, < 5.0.5`: `pnpm-lock.yaml` resolves `1.1.16`, `5.0.7`',
    );
    expect(issue?.comments[0]).toContain('Reopen this issue');
  });

  it.each([
    ['GitHub has not reviewed it', unreviewed],
    [
      'a locked version is affected',
      reviewedAs(['brace-expansion', '< 1.1.18']),
    ],
  ])('leaves the issue open while %s', async (_case, database) => {
    const issues = new MemoryIssues();
    issues.issues.push(watcherIssue(5, 'GHSA-aaaa-bbbb-cccc'));
    expect(await closeReviewedIssues(issues, locked, database)).toEqual({
      closed: [],
      failed: [],
    });
    expect(issues.issues[0]?.state).toBe('OPEN');
  });

  it('does not close an issue again after a person reopens it', async () => {
    const issues = new MemoryIssues();
    issues.issues.push(watcherIssue(5, 'GHSA-aaaa-bbbb-cccc'));
    const database = reviewedAs(['brace-expansion', '>= 4.0.0, < 5.0.5']);
    await closeReviewedIssues(issues, locked, database);
    const [issue] = issues.issues;
    if (issue) issue.state = 'OPEN';
    expect(await closeReviewedIssues(issues, locked, database)).toEqual({
      closed: [],
      failed: [],
    });
    expect(issue?.state).toBe('OPEN');
  });

  it('looks only at open issues the watcher titled', async () => {
    const issues = new MemoryIssues();
    issues.issues.push(
      { ...watcherIssue(5, 'GHSA-aaaa-bbbb-cccc'), state: 'CLOSED' },
      {
        ...watcherIssue(6, 'GHSA-dddd-eeee-ffff'),
        title: 'GHSA-dddd-eeee-ffff',
      },
    );
    const find = vi.fn(async () => null);
    await closeReviewedIssues(issues, locked, { find });
    expect(find).not.toHaveBeenCalled();
  });

  it('keeps checking after one advisory cannot be read, and names it', async () => {
    const issues = new MemoryIssues();
    issues.issues.push(
      watcherIssue(5, 'GHSA-aaaa-bbbb-cccc'),
      watcherIssue(6, 'GHSA-dddd-eeee-ffff'),
    );
    const database: AdvisoryDatabase = {
      find: async (ghsaId) => {
        if (ghsaId === 'GHSA-aaaa-bbbb-cccc') throw new Error('HTTP 502');
        return reviewed(['brace-expansion', '>= 4.0.0, < 5.0.5']);
      },
    };
    expect(await closeReviewedIssues(issues, locked, database)).toEqual({
      closed: ['GHSA-dddd-eeee-ffff'],
      failed: ['GHSA-aaaa-bbbb-cccc'],
    });
  });
});

describe('advisories GitHub has already reviewed', () => {
  it('opens no issue when the review rules out every locked version, and checks again on the next run', async () => {
    const issues = new MemoryIssues();
    const database = reviewedAs(['next', '< 16.3.0']);
    expect(
      await raiseUpstreamAdvisories([advisory()], manifest, issues, database),
    ).toEqual({ raised: [], failed: [], ruledOut: ['GHSA-aaaa-bbbb-cccc'] });
    expect(issues.issues).toEqual([]);
    // The lockfile later resolves an affected version.
    const affected = { ...manifest, locked: new Map([['next', ['16.2.0']]]) };
    expect(
      await raiseUpstreamAdvisories([advisory()], affected, issues, database),
    ).toEqual({ raised: ['GHSA-aaaa-bbbb-cccc'], failed: [], ruledOut: [] });
  });

  it('raises the advisory when GitHub’s database cannot be read', async () => {
    const issues = new MemoryIssues();
    expect(
      await raiseUpstreamAdvisories([advisory()], manifest, issues, {
        find: async () => {
          throw new Error('HTTP 502');
        },
      }),
    ).toEqual({ raised: ['GHSA-aaaa-bbbb-cccc'], failed: [], ruledOut: [] });
  });
});
