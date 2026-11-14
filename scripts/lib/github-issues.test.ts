import { describe, expect, it } from 'vitest';
import {
  listRepositoryIssueEntries,
  repositoryOwner,
} from './github-issues.mts';

describe('paginated repository issue transport', () => {
  it('reads all pages on each call and preserves entries for caller-specific validation', () => {
    const requests: string[][] = [];
    let pages = [[{ number: 1 }], [{ number: 2, pull_request: {} }]];
    const run = (args: string[]) => {
      requests.push(args);
      return JSON.stringify(pages);
    };
    expect(listRepositoryIssueEntries(run)).toEqual(pages.flat());
    pages = [[{ number: 3 }]];
    expect(listRepositoryIssueEntries(run)).toEqual([{ number: 3 }]);
    expect(requests).toEqual(
      Array.from({ length: 2 }, () => [
        'api',
        '--paginate',
        '--slurp',
        'repos/{owner}/{repo}/issues?state=all&per_page=100',
      ]),
    );
  });
  it.each(['{}', 'null', '[{}]', '[[],null]', 'invalid-json'])(
    'refuses malformed pages: %s',
    (response) => {
      expect(() => listRepositoryIssueEntries(() => response)).toThrow();
    },
  );
});

describe('the repository owner, whom alert issues are assigned to', () => {
  it('is the owner GitHub Actions names', () => {
    expect(repositoryOwner({ GITHUB_REPOSITORY_OWNER: 'repo-owner' })).toBe(
      'repo-owner',
    );
  });

  it.each([{}, { GITHUB_REPOSITORY_OWNER: '' }])(
    'is no one outside Actions: %j',
    (env) => {
      expect(repositoryOwner(env)).toBeNull();
    },
  );
});
