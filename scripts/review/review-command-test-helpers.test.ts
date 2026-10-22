import { describe, expect, it } from 'vitest';
import { GitHistory, ReviewHost } from './review-command-test-helpers';

// The command tests rely on these doubles failing loudly on any call their
// fixtures did not set up, so an unplanned request cannot pass silently.
describe('review command doubles refuse unplanned calls', () => {
  it.each([
    [['api', 'graphql', '-F', 'number=9'], 'Unexpected PR read: 9'],
    [['api', 'repos/o/r/pulls/9'], 'Unexpected API request: repos/o/r/pulls/9'],
    [['issue', 'list'], 'Unexpected command: issue list'],
    [['pr', 'close', '9'], 'Unexpected command: pr close 9'],
  ])('gh %j', (args, message) => {
    expect(() => new ReviewHost().gh(args)).toThrow(message);
  });

  it('refuses a merge whose head is not the fixture head', () => {
    const host = new ReviewHost();
    host.prs.set('9', { headRefOid: 'abc' });
    expect(() =>
      host.gh(['pr', 'merge', '9', '--match-head-commit', 'def']),
    ).toThrow('Head changed');
    expect(host.merges).toEqual([]);
  });

  it('refuses a Git command without a reply', () => {
    expect(() => new GitHistory().run(['status'])).toThrow(
      'Unexpected Git command: status',
    );
  });
});
