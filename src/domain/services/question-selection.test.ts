import { describe, expect, it } from 'vitest';
import { selectNextQuestionId } from './question-selection';

describe('selectNextQuestionId', () => {
  it('returns the first unattempted question id in candidate order', () => {
    const candidateIds = ['q1', 'q2', 'q3'] as const;
    const attemptHistory = new Map<string, Date>([
      ['q1', new Date('2026-02-01')],
    ]);

    expect(selectNextQuestionId(candidateIds, attemptHistory)).toBe('q2');
  });

  it('returns the question id with the oldest attempt when all candidates are attempted', () => {
    const candidateIds = ['q1', 'q2', 'q3'] as const;
    const attemptHistory = new Map<string, Date>([
      ['q1', new Date('2026-02-03')],
      ['q2', new Date('2026-02-01')],
      ['q3', new Date('2026-02-02')],
    ]);

    expect(selectNextQuestionId(candidateIds, attemptHistory)).toBe('q2');
  });

  it('breaks oldest-attempt ties by preserving candidate order', () => {
    const candidateIds = ['q1', 'q2'] as const;
    const attemptHistory = new Map<string, Date>([
      ['q1', new Date('2026-02-01')],
      ['q2', new Date('2026-02-01')],
    ]);

    expect(selectNextQuestionId(candidateIds, attemptHistory)).toBe('q1');
  });

  it('returns null when candidateIds is empty', () => {
    expect(selectNextQuestionId([], new Map())).toBeNull();
  });
});
