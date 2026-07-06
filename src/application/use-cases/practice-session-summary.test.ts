import { describe, expect, it } from 'vitest';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { projectPracticeSessionSummary } from './practice-session-summary';

describe('projectPracticeSessionSummary', () => {
  it('returns stable totals when no questions were answered', () => {
    const endedAt = new Date('2026-02-01T00:10:00Z');
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'tutor',
      questionIds: ['q1', 'q2'],
      questionStates: [
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
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    expect(projectPracticeSessionSummary(session, endedAt)).toEqual({
      sessionId: 'session-1',
      mode: 'tutor',
      questionCount: 2,
      endedAt: '2026-02-01T00:10:00.000Z',
      totals: {
        answered: 0,
        correct: 0,
        accuracy: 0,
        durationSeconds: 600,
      },
    });
  });

  it('returns total question count as the accuracy denominator when the session ends early', () => {
    const endedAt = new Date('2026-02-01T00:10:00Z');
    const session = createPracticeSession({
      id: 'session-2',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1', 'q2', 'q3'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'choice-1',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:03:00Z'),
        },
        {
          questionId: 'q2',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
        {
          questionId: 'q3',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    expect(projectPracticeSessionSummary(session, endedAt)).toMatchObject({
      questionCount: 3,
      totals: {
        answered: 1,
        correct: 1,
        accuracy: 1 / 3,
        durationSeconds: 600,
      },
    });
  });

  it('returns a stable summary for zero-question sessions', () => {
    const endedAt = new Date('2026-02-01T00:00:30Z');
    const session = createPracticeSession({
      id: 'session-3',
      userId: 'user-1',
      mode: 'tutor',
      questionIds: [],
      questionStates: [],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    expect(projectPracticeSessionSummary(session, endedAt)).toEqual({
      sessionId: 'session-3',
      mode: 'tutor',
      questionCount: 0,
      endedAt: '2026-02-01T00:00:30.000Z',
      totals: {
        answered: 0,
        correct: 0,
        accuracy: 0,
        durationSeconds: 30,
      },
    });
  });

  it('throws INTERNAL_ERROR when normalized question state is missing', () => {
    const endedAt = new Date('2026-02-01T00:10:00Z');
    const session = createPracticeSession({
      id: 'session-missing-state',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1', 'q2'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'choice-1',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:03:00Z'),
        },
      ],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    expect(() => projectPracticeSessionSummary(session, endedAt)).toThrow(
      /missing normalized question state/,
    );
  });

  it('returns canonical totals when persisted state includes out-of-band rows', () => {
    const endedAt = new Date('2026-02-01T00:10:00Z');
    const session = createPracticeSession({
      id: 'session-4',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1', 'q2'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'choice-1',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:03:00Z'),
        },
        {
          questionId: 'q2',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
        {
          questionId: 'q-extra',
          markedForReview: false,
          latestSelectedChoiceId: 'choice-extra',
          latestIsCorrect: true,
          latestAnsweredAt: new Date('2026-02-01T00:04:00Z'),
        },
      ],
      startedAt: new Date('2026-02-01T00:00:00Z'),
      endedAt,
    });

    expect(projectPracticeSessionSummary(session, endedAt)).toMatchObject({
      questionCount: 2,
      totals: {
        answered: 1,
        correct: 1,
        accuracy: 0.5,
        durationSeconds: 600,
      },
    });
  });
});
