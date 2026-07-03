import { describe, expect, it } from 'vitest';
import {
  ApplicationError,
  PracticeSessionConflictReasons,
  practiceSessionAlreadyEndedError,
  practiceSessionStateChangedConcurrentlyError,
} from '@/src/application/errors';
import { shouldCachePracticeSessionStateWriteError } from './practice-session-idempotency-policy';

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
