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
  it('does not cache production-shaped bare end or discard conflicts', () => {
    const lifecycleConflicts = [
      new ApplicationError('CONFLICT', 'Practice session already ended'),
      new ApplicationError('CONFLICT', 'Practice session cannot be discarded'),
    ];

    for (const error of lifecycleConflicts) {
      expect(shouldCachePracticeSessionLifecycleError(error)).toBe(false);
    }
  });

  it('does not cache transient or non-conflict lifecycle failures', () => {
    expect(
      shouldCachePracticeSessionLifecycleError(
        practiceSessionStateChangedConcurrentlyError(),
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
