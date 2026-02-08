import { describe, expect, it } from 'vitest';
import type { PracticeSessionQuestionState } from '../entities';
import {
  computeSessionDurationSeconds,
  computeSessionStats,
  createDefaultQuestionState,
} from './session-stats';

describe('computeSessionStats', () => {
  it('returns zeros for empty input', () => {
    expect(computeSessionStats([])).toEqual({ answered: 0, correct: 0 });
  });

  it('returns answered and correct counts', () => {
    const states: PracticeSessionQuestionState[] = [
      {
        questionId: 'q1',
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
      },
      {
        questionId: 'q2',
        markedForReview: false,
        latestSelectedChoiceId: 'choice_1',
        latestIsCorrect: true,
        latestAnsweredAt: new Date('2026-02-08T00:00:00Z'),
      },
      {
        questionId: 'q3',
        markedForReview: false,
        latestSelectedChoiceId: 'choice_2',
        latestIsCorrect: false,
        latestAnsweredAt: new Date('2026-02-08T00:00:01Z'),
      },
      {
        questionId: 'q4',
        markedForReview: false,
        latestSelectedChoiceId: 'choice_3',
        latestIsCorrect: null,
        latestAnsweredAt: new Date('2026-02-08T00:00:02Z'),
      },
    ];

    expect(computeSessionStats(states)).toEqual({ answered: 3, correct: 1 });
  });
});

describe('computeSessionDurationSeconds', () => {
  it('returns a non-negative integer duration in seconds', () => {
    const startedAt = new Date('2026-02-08T00:00:00.000Z');
    const endedAt = new Date('2026-02-08T00:00:01.900Z');

    expect(computeSessionDurationSeconds(startedAt, endedAt)).toBe(1);
  });

  it('returns 0 when endedAt is before startedAt', () => {
    const startedAt = new Date('2026-02-08T00:00:01.000Z');
    const endedAt = new Date('2026-02-08T00:00:00.000Z');

    expect(computeSessionDurationSeconds(startedAt, endedAt)).toBe(0);
  });

  it('returns 0 when startedAt is invalid', () => {
    const startedAt = new Date('invalid date');
    const endedAt = new Date('2026-02-08T00:00:00.000Z');

    expect(computeSessionDurationSeconds(startedAt, endedAt)).toBe(0);
  });

  it('returns 0 when endedAt is invalid', () => {
    const startedAt = new Date('2026-02-08T00:00:00.000Z');
    const endedAt = new Date('invalid date');

    expect(computeSessionDurationSeconds(startedAt, endedAt)).toBe(0);
  });

  it('returns 0 when startedAt and endedAt are invalid', () => {
    const startedAt = new Date('invalid date');
    const endedAt = new Date('invalid date');

    expect(computeSessionDurationSeconds(startedAt, endedAt)).toBe(0);
  });
});

describe('createDefaultQuestionState', () => {
  it('returns the default question state object', () => {
    expect(createDefaultQuestionState('question_1')).toEqual({
      questionId: 'question_1',
      markedForReview: false,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
      latestAnsweredAt: null,
    });
  });
});
