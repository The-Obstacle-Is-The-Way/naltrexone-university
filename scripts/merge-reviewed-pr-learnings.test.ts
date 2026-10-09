import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { linkedLearningReplies, runMergeReviewedPr } from './merge-reviewed-pr';
import {
  commentPage,
  HEAD,
  learningReply,
  MAIN,
  pullRequest,
  review,
} from './merge-reviewed-pr-test-helpers';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

const PR_URL =
  'https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/987';
const CHAT_REPLY = `${PR_URL}#issuecomment-6084464245`;
const THREAD_REPLY = `${PR_URL}#discussion_r4232035464`;

// DEBT-515: CodeRabbit applies a learning to every later review, and agents
// comment as the owner, so each reply that records one must be visible.
describe('CodeRabbit learnings recorded on the PR (DEBT-515)', () => {
  it('finds none on a PR where CodeRabbit recorded no learning', () => {
    expect(linkedLearningReplies(pullRequest())).toEqual([]);
  });

  it('refuses a learning recorded in a PR comment that the description does not link', () => {
    const pr = pullRequest();
    pr.comments = commentPage(learningReply(CHAT_REPLY));
    expect(() => linkedLearningReplies(pr)).toThrow(CHAT_REPLY);
  });

  it('refuses a learning recorded in a review-thread reply that the description does not link', () => {
    const pr = pullRequest();
    pr.reviewThreads.nodes = [
      { isResolved: true, comments: commentPage(learningReply(THREAD_REPLY)) },
    ];
    expect(() => linkedLearningReplies(pr)).toThrow(THREAD_REPLY);
  });

  it('accepts a learning linked by its full URL or by its anchor, and lists each reply', () => {
    const pr = pullRequest();
    pr.comments = commentPage(learningReply(CHAT_REPLY));
    pr.reviewThreads.nodes = [
      { isResolved: true, comments: commentPage(learningReply(THREAD_REPLY)) },
    ];
    pr.body = `CodeRabbit learnings: ${CHAT_REPLY} and #discussion_r4232035464.`;
    expect(linkedLearningReplies(pr)).toEqual([CHAT_REPLY, THREAD_REPLY]);
  });

  it('does not take a longer comment ID for the reply', () => {
    const pr = pullRequest();
    pr.comments = commentPage(learningReply(CHAT_REPLY));
    pr.body = `${CHAT_REPLY}7`;
    expect(() => linkedLearningReplies(pr)).toThrow('does not link');
  });

  it('ignores the learnings CodeRabbit cites as used, and anyone else quoting the marker', () => {
    const pr = pullRequest();
    pr.comments = commentPage(
      {
        author: { login: 'coderabbitai' },
        url: CHAT_REPLY,
        body: '<details>\n<summary>🧠 Learnings used</summary>\n</details>',
      },
      learningReply(THREAD_REPLY, 'The-Obstacle-Is-The-Way'),
    );
    expect(linkedLearningReplies(pr)).toEqual([]);
  });

  it.each([
    ['PR comments', 'comments'],
    ['review-thread replies', 'thread'],
  ] as const)('fails closed on truncated %s', (_label, part) => {
    const pr = pullRequest();
    const truncated = { pageInfo: { hasNextPage: true }, nodes: [] };
    if (part === 'comments') pr.comments = truncated;
    else pr.reviewThreads.nodes = [{ isResolved: true, comments: truncated }];
    expect(() => linkedLearningReplies(pr)).toThrow('Incomplete');
  });

  it('fails closed on malformed comment data', () => {
    const { body: _body, ...withoutBody } = pullRequest();
    expect(() => linkedLearningReplies(withoutBody)).toThrow(
      'Invalid GitHub comment response',
    );
  });
});

describe('merge command with CodeRabbit learnings (DEBT-515)', () => {
  function responses(pr: ReturnType<typeof pullRequest>) {
    vi.mocked(execFileSync)
      .mockReturnValueOnce(
        JSON.stringify({ data: { repository: { pullRequest: pr } } }),
      )
      .mockReturnValueOnce(JSON.stringify([[review()]]))
      .mockReturnValueOnce(
        JSON.stringify({ behind_by: 0, base_commit: { sha: MAIN } }),
      )
      .mockReturnValueOnce('')
      .mockReturnValueOnce('merged');
  }

  it('refuses an unlinked learning before posting a receipt or merging', () => {
    const pr = pullRequest();
    pr.comments = commentPage(learningReply(CHAT_REPLY));
    responses(pr);
    expect(() => runMergeReviewedPr(['987', '--merge'], () => {})).toThrow(
      'does not link',
    );
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it('lists the linked learning replies in the receipt it posts', () => {
    const pr = pullRequest();
    pr.comments = commentPage(learningReply(CHAT_REPLY));
    pr.body = `Learnings CodeRabbit recorded: ${CHAT_REPLY}`;
    responses(pr);
    const receipt = runMergeReviewedPr(['987', '--merge'], () => {});
    expect(receipt).toMatchObject({ head: HEAD, learnings: [CHAT_REPLY] });
    expect(vi.mocked(execFileSync).mock.calls[3]?.[2]).toMatchObject({
      input: expect.stringContaining(`"learnings":["${CHAT_REPLY}"]`),
    });
  });

  it('keeps the receipt unchanged when CodeRabbit recorded no learning', () => {
    responses(pullRequest());
    expect(runMergeReviewedPr(['987'], () => {})).not.toHaveProperty(
      'learnings',
    );
  });
});
