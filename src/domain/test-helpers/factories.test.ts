import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBookmark, createPracticeSession } from './index';

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

describe('createPracticeSession', () => {
  it('defaults question states with draft fields when no overrides are provided', () => {
    const session = createPracticeSession({
      questionIds: ['question-1', 'question-2'],
    });

    expect(session.questionStates).toEqual([
      {
        questionId: 'question-1',
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
