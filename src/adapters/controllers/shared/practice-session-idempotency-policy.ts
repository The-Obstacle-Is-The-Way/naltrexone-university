import {
  isApplicationError,
  PracticeSessionConflictReasons,
} from '@/src/application/errors';

export function shouldCachePracticeSessionStateWriteError(
  error: unknown,
): boolean {
  return !(
    isApplicationError(error) &&
    error.details?.reason ===
      PracticeSessionConflictReasons.StateChangedConcurrently
  );
}
