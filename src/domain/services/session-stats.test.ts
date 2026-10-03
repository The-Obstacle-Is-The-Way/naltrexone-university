import { describe, expect, it } from 'vitest';
import type { PracticeSessionQuestionState } from '../entities';
import {
  computeSessionDurationSeconds,
  computeSessionStats,
} from './session-stats';

describe('computeSessionStats', () => {
  it('returns zeros for empty input', () => {
    expect(computeSessionStats([])).toEqual({ answered: 0, correct: 0 });
  });

  it('returns answered and correct counts', () => {
    const states: PracticeSessionQuestionState[] = [
      {
        questionId: 'q1',
        questionRevisionId: 'q1-revision',
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
        draftSelectedChoiceId: null,
        draftSavedAt: null,
        draftCumulativeMs: 0,
        fairChanceAtEnd: null,
      },
      {
        questionId: 'q2',
        questionRevisionId: 'q2-revision',
        markedForReview: false,
        latestSelectedChoiceId: 'choice_1',
        latestIsCorrect: true,
        latestAnsweredAt: new Date('2026-02-08T00:00:00Z'),
        draftSelectedChoiceId: null,
        draftSavedAt: null,
        draftCumulativeMs: 0,
        fairChanceAtEnd: null,
      },
      {
        questionId: 'q3',
        questionRevisionId: 'q3-revision',
        markedForReview: false,
        latestSelectedChoiceId: 'choice_2',
        latestIsCorrect: false,
        latestAnsweredAt: new Date('2026-02-08T00:00:01Z'),
        draftSelectedChoiceId: null,
        draftSavedAt: null,
        draftCumulativeMs: 0,
        fairChanceAtEnd: null,
      },
      {
        questionId: 'q4',
        questionRevisionId: 'q4-revision',
        markedForReview: false,
        latestSelectedChoiceId: 'choice_3',
        latestIsCorrect: null,
        latestAnsweredAt: new Date('2026-02-08T00:00:02Z'),
        draftSelectedChoiceId: null,
        draftSavedAt: null,
        draftCumulativeMs: 0,
        fairChanceAtEnd: null,
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
