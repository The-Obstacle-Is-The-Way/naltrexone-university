import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGithubAlertIssues, syncAlertIssue } from './github-alert-issues';
import { MemoryIssues } from './github-alert-issues-test-helpers';

// Only execFileSync, which runs gh, is replaced.
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));
const gh = vi.mocked(execFileSync);

afterEach(() => {
  gh.mockReset();
});

const TITLE = 'Operational alert check';
const messages = { resolved: 'Cleared.', changed: 'Changed.' };

describe('one alert issue per title', () => {
  it('does nothing when the condition is clear and no issue is open', async () => {
    const issues = new MemoryIssues();

    expect(await syncAlertIssue(issues, TITLE, null, messages)).toBe('none');
    expect(issues.writes).toBe(0);
  });

  it('opens an issue with the description while the condition holds', async () => {
    const issues = new MemoryIssues();

    expect(await syncAlertIssue(issues, TITLE, 'Body', messages)).toBe(
      'created',
    );
    expect(issues.issues).toEqual([
      { number: 1, title: TITLE, body: 'Body', state: 'OPEN' },
    ]);
  });

  it('ignores an issue whose title only contains the alert title', async () => {
    const issues = new MemoryIssues();
    await issues.create(`${TITLE} (old)`, 'Body');

    expect(await syncAlertIssue(issues, TITLE, 'Body', messages)).toBe(
      'created',
    );
  });

  it('leaves an open issue with the same description unchanged', async () => {
    const issues = new MemoryIssues();
    await issues.create(TITLE, 'Body');
    issues.writes = 0;

    expect(await syncAlertIssue(issues, TITLE, 'Body', messages)).toBe(
      'unchanged',
    );
    expect(issues.writes).toBe(0);
  });

  it('updates the description and comments, since an edit notifies nobody', async () => {
    const issues = new MemoryIssues();
    await issues.create(TITLE, 'Body');

    expect(await syncAlertIssue(issues, TITLE, 'New body', messages)).toBe(
      'updated',
    );
    expect(issues.issues[0]?.body).toBe('New body');
    expect(issues.comments).toEqual(['Changed.']);
  });

  it('reopens a closed issue when the condition returns', async () => {
    const issues = new MemoryIssues();
    await issues.create(TITLE, 'Body');
    await issues.close(1, 'Cleared.');

    expect(await syncAlertIssue(issues, TITLE, 'Body', messages)).toBe(
      'updated',
    );
    expect(issues.issues[0]?.state).toBe('OPEN');
  });

  it('closes the open issue with a comment once the condition clears', async () => {
    const issues = new MemoryIssues();
    await issues.create(TITLE, 'Body');

    expect(await syncAlertIssue(issues, TITLE, null, messages)).toBe('closed');
    expect(issues.issues[0]?.state).toBe('CLOSED');
    expect(issues.comments).toEqual(['Cleared.']);
  });

  it('refuses to guess between two issues with the alert title', async () => {
    const issues = new MemoryIssues();
    await issues.create(TITLE, 'a');
    await issues.create(TITLE, 'b');

    await expect(
      syncAlertIssue(issues, TITLE, 'Body', messages),
    ).rejects.toThrow(`Multiple "${TITLE}" issues require consolidation`);
  });
});

describe('GitHub alert issues', () => {
  it('searches for the alert by title on the server, not by listing every issue', async () => {
    const calls: string[][] = [];
    const issues = createGithubAlertIssues((args) => {
      calls.push(args);
      return JSON.stringify([
        { number: 7, title: TITLE, body: 'b', state: 'OPEN' },
        { number: 8, title: 'Unrelated', body: null, state: 'CLOSED' },
      ]);
    });

    expect(await issues.find(TITLE)).toEqual([
      { number: 7, title: TITLE, body: 'b', state: 'OPEN' },
      { number: 8, title: 'Unrelated', body: '', state: 'CLOSED' },
    ]);
    expect(calls[0]).toEqual([
      'issue',
      'list',
      '--state',
      'all',
      '--search',
      `in:title "${TITLE}"`,
      '--json',
      'number,title,body,state',
      '--limit',
      '100',
    ]);
  });

  // A search capped at its limit may have dropped the existing alert, and
  // the job would then open a duplicate; it fails instead.
  it('fails closed when the search may have been cut off at its limit', async () => {
    const issues = createGithubAlertIssues(() =>
      JSON.stringify(
        Array.from({ length: 100 }, (_, index) => ({
          number: index + 1,
          title: `${TITLE} ${index}`,
          body: '',
          state: 'CLOSED',
        })),
      ),
    );

    await expect(issues.find(TITLE)).rejects.toThrow(
      'Too many matching issues',
    );
  });

  it('runs gh with a bounded time and output buffer', async () => {
    gh.mockReturnValue('[]');

    await createGithubAlertIssues().find(TITLE);

    expect(gh).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['issue', 'list']),
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );
  });

  it('rejects a malformed search response', async () => {
    const issues = createGithubAlertIssues(() => '[{"number":"7"}]');

    await expect(issues.find(TITLE)).rejects.toThrow(
      'Invalid GitHub issue response',
    );
  });

  it('creates, updates, comments on and closes issues through gh', async () => {
    const calls: string[][] = [];
    const issues = createGithubAlertIssues((args) => {
      calls.push(args);
      return '';
    });

    await issues.create('T', 'B');
    await issues.update(7, 'B2');
    await issues.comment(7, 'C');
    await issues.close(7, 'D');

    expect(calls).toEqual([
      ['issue', 'create', '--title', 'T', '--body', 'B'],
      [
        'api',
        '--method',
        'PATCH',
        'repos/{owner}/{repo}/issues/7',
        '-f',
        'state=open',
        '-f',
        'body=B2',
      ],
      ['issue', 'comment', '7', '--body', 'C'],
      ['issue', 'close', '7', '--comment', 'D'],
    ]);
  });
});
