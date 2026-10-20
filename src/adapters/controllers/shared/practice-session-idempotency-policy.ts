import {
  isApplicationError,
  PracticeSessionConflictReasons,
} from '@/src/application/errors';

export function shouldCachePracticeSessionStateWriteError(
  error: unknown,
): boolean {
  return !(
    isApplicationError(error) &&
    (error.details?.reason ===
      PracticeSessionConflictReasons.StateChangedConcurrently ||
      error.details?.reason === PracticeSessionConflictReasons.ExamNotExpired)
  );
}

export function shouldCachePracticeSessionLifecycleError(
  _error: unknown,
): boolean {
  return false;
}
