import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAttempt,
  createBookmark,
  createPracticeSession,
  createQuestion,
  createQuestionRatingFeedback,
  createQuestionReportFeedback,
  createSubscriptionWriteCandidate,
  defaultRevisionIdOf,
} from './index';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('createBookmark', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns defaults when no overrides provided', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-09T12:00:00.000Z'));

    const bookmark = createBookmark();

    expect(bookmark).toEqual({
      userId: expect.any(String),
      questionId: expect.any(String),
      createdAt: new Date('2026-02-09T12:00:00.000Z'),
    });
  });

  it('applies overrides', () => {
    const createdAt = new Date('2026-02-10T00:00:00.000Z');

    const bookmark = createBookmark({
      userId: 'user-2',
      questionId: 'question-2',
      createdAt,
    });

    expect(bookmark).toEqual({
      userId: 'user-2',
      questionId: 'question-2',
      createdAt,
    });
  });
});

// ADR-021: every attempt and session item names a revision of its question.
describe('defaultRevisionIdOf', () => {
  it('derives one UUID-shaped revision id per question id', () => {
    const questionId = crypto.randomUUID();

    expect(defaultRevisionIdOf(questionId)).toMatch(UUID_PATTERN);
    expect(defaultRevisionIdOf('q1')).toMatch(UUID_PATTERN);
    expect(defaultRevisionIdOf(questionId)).toBe(
      defaultRevisionIdOf(questionId),
    );
    expect(defaultRevisionIdOf(questionId)).not.toBe(questionId);
    expect(defaultRevisionIdOf('q1')).not.toBe(defaultRevisionIdOf('q2'));
  });

  it('binds a fixture attempt and session item to their question default revision', () => {
    const question = createQuestion({ id: 'q1' });
    const attempt = createAttempt({ questionId: 'q1' });
    const session = createPracticeSession({ questionIds: ['q1'] });

    expect(question.revisionId).toBe(defaultRevisionIdOf('q1'));
    expect(attempt.questionRevisionId).toBe(question.revisionId);
    expect(session.questionStates[0]?.questionRevisionId).toBe(
      question.revisionId,
    );
  });
});

describe('createPracticeSession', () => {
  it('defaults question states with draft fields when no overrides are provided', () => {
    const session = createPracticeSession({
      questionIds: ['question-1', 'question-2'],
    });

    expect(session.questionStates).toEqual([
      {
        questionId: 'question-1',
        questionRevisionId: defaultRevisionIdOf('question-1'),
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
        draftSelectedChoiceId: null,
        draftSavedAt: null,
        draftCumulativeMs: 0,
      },
      {
        questionId: 'question-2',
        questionRevisionId: defaultRevisionIdOf('question-2'),
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
        draftSelectedChoiceId: null,
        draftSavedAt: null,
        draftCumulativeMs: 0,
      },
    ]);
  });
});

describe('createQuestionRatingFeedback', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns shape-correct rating feedback defaults', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-09T12:00:00.000Z'));

    const feedback = createQuestionRatingFeedback();

    expect(feedback).toEqual({
      id: expect.stringMatching(UUID_PATTERN),
      userId: expect.stringMatching(UUID_PATTERN),
      questionId: expect.stringMatching(UUID_PATTERN),
      attemptId: null,
      practiceSessionId: null,
      kind: 'rating',
      rating: 'helpful',
      category: null,
      comment: null,
      createdAt: new Date('2026-02-09T12:00:00.000Z'),
    });
  });

  it('applies rating feedback overrides', () => {
    const createdAt = new Date('2026-02-10T00:00:00.000Z');

    const feedback = createQuestionRatingFeedback({
      id: 'feedback-1',
      userId: 'user-1',
      questionId: 'question-1',
      attemptId: 'attempt-1',
      practiceSessionId: 'session-1',
      rating: null,
      createdAt,
    });

    expect(feedback).toEqual({
      id: 'feedback-1',
      userId: 'user-1',
      questionId: 'question-1',
      attemptId: 'attempt-1',
      practiceSessionId: 'session-1',
      kind: 'rating',
      rating: null,
      category: null,
      comment: null,
      createdAt,
    });
  });

  it('rejects report-only overrides at compile time', () => {
    // @ts-expect-error rating feedback fixtures cannot accept report categories
    createQuestionRatingFeedback({ category: 'other' });
    // @ts-expect-error rating feedback fixtures cannot accept free-text comments
    createQuestionRatingFeedback({ comment: 'Question wording is unclear.' });
    // @ts-expect-error rating feedback fixtures cannot change the discriminant
    createQuestionRatingFeedback({ kind: 'report' });
  });

  it('reasserts rating invariants after unsafe overrides', () => {
    const feedback = createQuestionRatingFeedback({
      kind: 'report',
      category: 'other',
      comment: 'Question wording is unclear.',
    } as unknown as Parameters<typeof createQuestionRatingFeedback>[0]);

    expect(feedback).toMatchObject({
      kind: 'rating',
      category: null,
      comment: null,
    });
  });
});

describe('createQuestionReportFeedback', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns shape-correct report feedback defaults', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-09T12:00:00.000Z'));

    const feedback = createQuestionReportFeedback();

    expect(feedback).toEqual({
      id: expect.stringMatching(UUID_PATTERN),
      userId: expect.stringMatching(UUID_PATTERN),
      questionId: expect.stringMatching(UUID_PATTERN),
      attemptId: null,
      practiceSessionId: null,
      kind: 'report',
      rating: null,
      category: 'other',
      comment: null,
      createdAt: new Date('2026-02-09T12:00:00.000Z'),
    });
  });

  it('applies report feedback overrides', () => {
    const createdAt = new Date('2026-02-10T00:00:00.000Z');

    const feedback = createQuestionReportFeedback({
      id: 'feedback-1',
      userId: 'user-1',
      questionId: 'question-1',
      attemptId: 'attempt-1',
      practiceSessionId: 'session-1',
      category: 'incorrect_answer',
      comment: 'The keyed answer appears wrong.',
      createdAt,
    });

    expect(feedback).toEqual({
      id: 'feedback-1',
      userId: 'user-1',
      questionId: 'question-1',
      attemptId: 'attempt-1',
      practiceSessionId: 'session-1',
      kind: 'report',
      rating: null,
      category: 'incorrect_answer',
      comment: 'The keyed answer appears wrong.',
      createdAt,
    });
  });

  it('rejects rating-only overrides at compile time', () => {
    // @ts-expect-error report feedback fixtures cannot accept ratings
    createQuestionReportFeedback({ rating: 'helpful' });
    // @ts-expect-error report feedback fixtures cannot change the discriminant
    createQuestionReportFeedback({ kind: 'rating' });
  });

  it('reasserts report invariants after unsafe overrides', () => {
    const feedback = createQuestionReportFeedback({
      kind: 'rating',
      rating: 'helpful',
    } as unknown as Parameters<typeof createQuestionReportFeedback>[0]);

    expect(feedback).toMatchObject({
      kind: 'report',
      rating: null,
    });
  });
});

describe('createSubscriptionWriteCandidate', () => {
  const currentPeriodEnd = new Date('2026-07-12T12:00:00.000Z');

  it('defaults the identity and status around the given period end', () => {
    expect(createSubscriptionWriteCandidate({ currentPeriodEnd })).toEqual({
      subscriptionIdentity: 'sub_current',
      status: 'active',
      currentPeriodEnd,
    });
  });

  it('applies identity and status overrides', () => {
    expect(
      createSubscriptionWriteCandidate({
        subscriptionIdentity: 'sub_other',
        status: 'canceled',
        currentPeriodEnd,
      }),
    ).toEqual({
      subscriptionIdentity: 'sub_other',
      status: 'canceled',
      currentPeriodEnd,
    });
  });

  it('requires the period end every write-guard decision compares', () => {
    // @ts-expect-error a candidate must state its currentPeriodEnd
    createSubscriptionWriteCandidate({ status: 'active' });
  });
});
