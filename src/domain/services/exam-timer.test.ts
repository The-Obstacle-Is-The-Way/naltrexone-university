import { describe, expect, it } from 'vitest';
import { createPracticeSession } from '@/src/domain/test-helpers';
import {
  computeExamAllotmentSeconds,
  computeExamDeadline,
  isExamExpired,
  remainingExamSeconds,
} from './exam-timer';
import { EXAM_SECONDS_PER_QUESTION } from './time-constants';

describe('exam timer domain service', () => {
  it('locks the exam per-question allotment to the board-derived constant', () => {
    expect(EXAM_SECONDS_PER_QUESTION).toBe(72);
  });

  it('computes a whole-block allotment for exam sessions only', () => {
    const exam = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1', 'q2', 'q3'],
    });
    const tutor = createPracticeSession({
      mode: 'tutor',
      questionIds: ['q1', 'q2', 'q3'],
    });

    expect(computeExamAllotmentSeconds(exam)).toBe(216);
    expect(computeExamAllotmentSeconds(tutor)).toBeNull();
  });

  it('computes the deadline from startedAt plus the exam allotment', () => {
    const session = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1', 'q2'],
      startedAt: new Date('2026-05-22T12:00:00.000Z'),
    });

    expect(computeExamDeadline(session)).toEqual(
      new Date('2026-05-22T12:02:24.000Z'),
    );
  });

  it('returns null deadline for tutor sessions', () => {
    const session = createPracticeSession({
      mode: 'tutor',
      startedAt: new Date('2026-05-22T12:00:00.000Z'),
    });

    expect(computeExamDeadline(session)).toBeNull();
  });

  it('computes remaining seconds from the absolute deadline and clamps at zero', () => {
    const session = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1'],
      startedAt: new Date('2026-05-22T12:00:00.000Z'),
    });

    expect(
      remainingExamSeconds(session, new Date('2026-05-22T12:00:30.000Z')),
    ).toBe(42);
    expect(
      remainingExamSeconds(session, new Date('2026-05-22T12:01:12.000Z')),
    ).toBe(0);
    expect(
      remainingExamSeconds(session, new Date('2026-05-22T12:01:13.000Z')),
    ).toBe(0);
  });

  it('returns Infinity remaining time and never expires for tutor sessions', () => {
    const session = createPracticeSession({
      mode: 'tutor',
      questionIds: ['q1'],
      startedAt: new Date('2026-05-22T12:00:00.000Z'),
    });

    expect(
      remainingExamSeconds(session, new Date('2026-05-22T13:00:00.000Z')),
    ).toBe(Number.POSITIVE_INFINITY);
    expect(isExamExpired(session, new Date('2026-05-22T13:00:00.000Z'))).toBe(
      false,
    );
  });

  it('expires at and after the server-derived deadline', () => {
    const session = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1'],
      startedAt: new Date('2026-05-22T12:00:00.000Z'),
    });

    expect(isExamExpired(session, new Date('2026-05-22T12:01:11.999Z'))).toBe(
      false,
    );
    expect(isExamExpired(session, new Date('2026-05-22T12:01:12.000Z'))).toBe(
      true,
    );
    expect(isExamExpired(session, new Date('2026-05-22T12:01:13.000Z'))).toBe(
      true,
    );
  });
});
