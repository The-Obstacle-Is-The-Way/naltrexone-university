import { describe, expect, it } from 'vitest';
import {
  ApplicationError,
  PracticeSessionConflictReasons,
  practiceSessionAlreadyEndedError,
  practiceSessionStateChangedConcurrentlyError,
} from '@/src/application/errors';
import {
  shouldCachePracticeSessionLifecycleError,
  shouldCachePracticeSessionStateWriteError,
} from './practice-session-idempotency-policy';

describe('shouldCachePracticeSessionStateWriteError', () => {
  it('does not cache transient practice-session state conflicts', () => {
    expect(
      shouldCachePracticeSessionStateWriteError(
        practiceSessionStateChangedConcurrentlyError(),
      ),
    ).toBe(false);
  });

  it('caches terminal practice-session conflicts', () => {
    expect(
      shouldCachePracticeSessionStateWriteError(
        practiceSessionAlreadyEndedError(),
      ),
    ).toBe(true);
  });

  it('caches generic and malformed errors', () => {
    expect(shouldCachePracticeSessionStateWriteError(new Error('boom'))).toBe(
      true,
    );
    expect(
      shouldCachePracticeSessionStateWriteError(
        new ApplicationError('CONFLICT', 'Plain conflict'),
      ),
    ).toBe(true);
    expect(
      shouldCachePracticeSessionStateWriteError(
        new ApplicationError('CONFLICT', 'Malformed reason', undefined, {
          details: {
            reason: PracticeSessionConflictReasons.ExamTimeExpired,
          },
        }),
      ),
    ).toBe(true);
  });
});

describe('shouldCachePracticeSessionLifecycleError', () => {
  it('caches only monotone terminal practice-session conflicts', () => {
    expect(
      shouldCachePracticeSessionLifecycleError(
        practiceSessionAlreadyEndedError(),
      ),
    ).toBe(true);
    expect(
      shouldCachePracticeSessionLifecycleError(
        new ApplicationError('CONFLICT', 'Exam time expired', undefined, {
          details: {
            reason: PracticeSessionConflictReasons.ExamTimeExpired,
          },
        }),
      ),
    ).toBe(true);
  });

  it('does not cache transient, unmapped, or non-terminal lifecycle failures', () => {
    expect(
      shouldCachePracticeSessionLifecycleError(
        practiceSessionStateChangedConcurrentlyError(),
      ),
    ).toBe(false);
    expect(
      shouldCachePracticeSessionLifecycleError(
        new ApplicationError('CONFLICT', 'Plain conflict'),
      ),
    ).toBe(false);
    expect(
      shouldCachePracticeSessionLifecycleError(
        new ApplicationError('INTERNAL_ERROR', 'deadlock victim'),
      ),
    ).toBe(false);
    expect(
      shouldCachePracticeSessionLifecycleError(
        new ApplicationError('NOT_FOUND', 'Practice session not found'),
      ),
    ).toBe(false);
    expect(shouldCachePracticeSessionLifecycleError(new Error('40P01'))).toBe(
      false,
    );
  });
});
