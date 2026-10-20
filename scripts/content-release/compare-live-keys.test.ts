import { describe, expect, it } from 'vitest';
import { parseCompareArgs } from './compare-live-keys';

const COMMIT = 'a'.repeat(40);

describe('parseCompareArgs', () => {
  it('reads the repository and the full commit', () => {
    expect(
      parseCompareArgs(['--repo', '/content', '--commit', COMMIT]),
    ).toEqual({ repository: '/content', commit: COMMIT });
  });
  it('refuses a missing repository path', () => {
    expect(() => parseCompareArgs(['--repo'])).toThrow(
      /--repo needs a repository path/,
    );
  });
  it('requires both the repository and the commit', () => {
    expect(() => parseCompareArgs(['--repo', '/content'])).toThrow(
      /--repo and --commit are required/,
    );
  });
});
