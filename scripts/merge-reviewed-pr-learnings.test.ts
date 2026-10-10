import { describe, expect, it } from 'vitest';
import { linkedLearningReplies } from './merge-reviewed-pr';
import {
  commentPage,
  learningReply,
  pullRequest,
} from './merge-reviewed-pr-test-helpers';

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

  it('refuses a learning CodeRabbit holds for approval, which it labels pending', () => {
    const pr = pullRequest();
    const pending = learningReply(CHAT_REPLY);
    pending.body = pending.body.replace(
      'Learnings added</summary>',
      'Learnings added — pending approval</summary>',
    );
    pr.comments = commentPage(pending);
    expect(() => linkedLearningReplies(pr)).toThrow(CHAT_REPLY);
  });

  it('refuses a link the rendered description hides in an HTML comment', () => {
    const pr = pullRequest();
    pr.comments = commentPage(learningReply(CHAT_REPLY));
    pr.body = `Summary of the change.\n<!-- ${CHAT_REPLY} -->`;
    expect(() => linkedLearningReplies(pr)).toThrow('does not link');
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
