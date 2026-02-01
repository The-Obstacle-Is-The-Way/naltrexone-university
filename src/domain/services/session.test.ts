import { describe, expect, it } from 'vitest';
import { createPracticeSession } from '../test-helpers';
import {
  computeSessionProgress,
  getNextQuestionId,
  shouldShowExplanation,
} from './session';

describe('computeSessionProgress', () => {
  it('returns progress and completion status', () => {
    const session = createPracticeSession({
      questionIds: ['q1', 'q2', 'q3'],
    });

    expect(computeSessionProgress(session, 0)).toEqual({
      current: 0,
      total: 3,
      isComplete: false,
    });

    expect(computeSessionProgress(session, 3)).toEqual({
      current: 3,
      total: 3,
      isComplete: true,
    });
  });
});

describe('shouldShowExplanation', () => {
  it('returns true for tutor mode', () => {
    const session = createPracticeSession({ mode: 'tutor', endedAt: null });
    expect(shouldShowExplanation(session)).toBe(true);
  });

  it('returns false for exam mode when not ended', () => {
    const session = createPracticeSession({ mode: 'exam', endedAt: null });
    expect(shouldShowExplanation(session)).toBe(false);
  });

  it('returns true for exam mode when ended', () => {
    const session = createPracticeSession({
      mode: 'exam',
      endedAt: new Date(),
    });
    expect(shouldShowExplanation(session)).toBe(true);
  });
});

describe('getNextQuestionId', () => {
  it('returns first unanswered question id in order', () => {
    const session = createPracticeSession({
      questionIds: ['q1', 'q2', 'q3'],
    });

    expect(getNextQuestionId(session, [])).toBe('q1');
    expect(getNextQuestionId(session, ['q1'])).toBe('q2');
    expect(getNextQuestionId(session, ['q1', 'q2'])).toBe('q3');
  });

  it('returns null when all questions are answered', () => {
    const session = createPracticeSession({
      questionIds: ['q1', 'q2'],
    });

    expect(getNextQuestionId(session, ['q1', 'q2'])).toBeNull();
  });
});
