import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEARNINGS_REVIEW_ISSUE_TITLE,
  learningReplies,
  readLearningReplies,
  reportLearnings,
  runFromCommandLine,
  suppressesFindings,
} from './coderabbit-learnings-review';
import { MemoryIssues } from './github-alert-issues-test-helpers';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));
const gh = vi.mocked(execFileSync);
afterEach(() => gh.mockReset());

const NOW = new Date('2026-10-20T13:00:00Z');
const PR =
  'https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull';

// A comment as GitHub's REST API returns it.
const comment = (
  url: string,
  createdAt: string,
  body: string,
  login = 'coderabbitai[bot]',
) => ({ html_url: url, created_at: createdAt, body, user: { login } });

// The block CodeRabbit appends to a chat reply when it records a learning.
const recorded = (learning: string) =>
  [
    'Thanks for the clarification.',
    '<details>',
    '<summary>✏️ Learnings added</summary>',
    '',
    '```',
    'Learnt from: The-Obstacle-Is-The-Way',
    'Timestamp: 2026-10-19T10:00:00.000Z',
    `Learning: ${learning}`,
    '```',
    '',
    '> Note: Learnings are effective only in the context of similar code segments.',
    '</details>',
  ].join('\n');

const fact = comment(
  `${PR}/1444#discussion_r4235144831`,
  '2026-10-19T10:00:00Z',
  recorded('Workflow discovery is shared by two\ntests; update both together.'),
);
const leniency = comment(
  `${PR}/1438#issuecomment-6086302277`,
  '2026-10-13T17:52:31Z',
  recorded(
    'Removing notes from an archived record is fine. Do not request their restoration.',
  ),
);

describe('which learnings tell CodeRabbit to stop raising something (DEBT-515)', () => {
  it.each([
    'Do not recommend adding individual workflow paths to that contract.',
    'Do not require a GitHub App token solely for the current watch volume.',
    'The owner explicitly accepts the Vercel Hobby risk until the first sale.',
    'Conservative over-redaction of trailing free text is acceptable.',
    'DEBT-502 item 1 is not a prerequisite for DEBT-511.',
  ])('flags %j', (text) => {
    expect(suppressesFindings(text)).toBe(true);
  });

  it.each([
    'E2E runs use one shared Clerk user; account for session interference.',
    'Workflow discovery is shared by two tests; update both together.',
  ])('leaves %j unflagged', (text) => {
    expect(suppressesFindings(text)).toBe(false);
  });
});

describe('CodeRabbit learnings recorded in the past week (DEBT-515)', () => {
  it('lists replies that record a learning, newest first, with the day a pending one applies by itself', () => {
    expect(learningReplies([[leniency], [fact]], [], NOW)).toEqual([
      {
        url: fact.html_url,
        pullRequest: 1444,
        recordedAt: '2026-10-19',
        appliesOn: '2026-11-18',
        learnings: [
          {
            text: 'Workflow discovery is shared by two tests; update both together.',
            suppresses: false,
          },
        ],
      },
      {
        url: leniency.html_url,
        pullRequest: 1438,
        recordedAt: '2026-10-13',
        appliesOn: '2026-11-12',
        learnings: [
          {
            text: 'Removing notes from an archived record is fine. Do not request their restoration.',
            suppresses: true,
          },
        ],
      },
    ]);
  });

  it('reads review-thread replies as well as PR comments', () => {
    expect(learningReplies([], [[fact]], NOW).map((r) => r.url)).toEqual([
      fact.html_url,
    ]);
  });

  it('ignores cited learnings, other authors, and replies older than eight days', () => {
    const cited = comment(
      `${PR}/1440#issuecomment-1`,
      '2026-10-19T10:00:00Z',
      '<details>\n<summary>🧠 Learnings used</summary>\n</details>',
    );
    const quoted = comment(
      `${PR}/1440#issuecomment-2`,
      '2026-10-19T10:00:00Z',
      recorded('An agent quoting the block.'),
      'The-Obstacle-Is-The-Way',
    );
    const lastWeeks = comment(
      `${PR}/1430#discussion_r4221572828`,
      '2026-10-12T12:59:59Z',
      recorded('Raised by an earlier weekly issue.'),
    );
    expect(learningReplies([[cited, quoted, lastWeeks]], [], NOW)).toEqual([]);
  });

  it('fails closed on malformed comment data', () => {
    expect(() => learningReplies([[{ html_url: 'x' }]], [], NOW)).toThrow(
      'Invalid GitHub comment response',
    );
  });
});

describe('weekly learnings issue (DEBT-515)', () => {
  it('opens one issue with the learnings that stop findings first, quoted, and the rest after', async () => {
    const issues = new MemoryIssues();

    expect(
      await reportLearnings(
        learningReplies([[fact, leniency]], [], NOW),
        issues,
      ),
    ).toBe('created');

    const [issue] = issues.issues;
    const body = issue?.body ?? '';
    expect(issue?.title).toBe(LEARNINGS_REVIEW_ISSUE_TITLE);
    expect(body).toContain('app.coderabbit.ai/learnings');
    expect(body).toContain(
      `[#1438](${leniency.html_url}), recorded 2026-10-13; if still pending, applies by itself 2026-11-12\n  > Removing notes from an archived record is fine. Do not request their restoration.`,
    );
    expect(body).toContain(
      `[#1444](${fact.html_url}), recorded 2026-10-19: Workflow discovery is shared by two tests`,
    );
    expect(body.indexOf('#1438')).toBeLessThan(body.indexOf('#1444'));
  });

  it('closes the issue in a week with no new learning', async () => {
    const issues = new MemoryIssues();
    await reportLearnings(learningReplies([[fact]], [], NOW), issues);

    expect(await reportLearnings([], issues)).toBe('closed');
    expect(issues.issues[0]?.state).toBe('CLOSED');
  });

  it('reads both comment lists for the past eight days, every page', () => {
    gh.mockReturnValueOnce(JSON.stringify([[fact]])).mockReturnValueOnce(
      JSON.stringify([[]]),
    );

    expect(readLearningReplies(NOW).map((r) => r.url)).toEqual([fact.html_url]);
    expect(gh.mock.calls.map(([, args]) => args)).toEqual([
      [
        'api',
        '--paginate',
        '--slurp',
        'repos/{owner}/{repo}/issues/comments?since=2026-10-12T13:00:00.000Z&per_page=100',
      ],
      [
        'api',
        '--paginate',
        '--slurp',
        'repos/{owner}/{repo}/pulls/comments?since=2026-10-12T13:00:00.000Z&per_page=100',
      ],
    ]);
  });

  it('reports without touching GitHub issues on a dry run', async () => {
    gh.mockReturnValueOnce(
      JSON.stringify([[fact, leniency]]),
    ).mockReturnValueOnce(JSON.stringify([]));
    const log = vi.fn();

    expect(
      await runFromCommandLine(['--dry-run'], { log, error: vi.fn() }, NOW),
    ).toBe(0);
    expect(log).toHaveBeenCalledWith(
      'CodeRabbit learnings recorded in the past week: 2, 1 telling it to stop raising something (dry run; no issue touched)',
    );
    expect(gh).toHaveBeenCalledTimes(2);
  });
});
