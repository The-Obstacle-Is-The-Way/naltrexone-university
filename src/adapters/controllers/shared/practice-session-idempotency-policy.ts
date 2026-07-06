import {
  isApplicationError,
  isPracticeSessionConflictReason,
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

export function shouldCachePracticeSessionLifecycleError(
  error: unknown,
): boolean {
  if (!isApplicationError(error) || error.code !== 'CONFLICT') return false;

  const reason = error.details?.reason;
  if (!isPracticeSessionConflictReason(reason)) return false;

  return (
    reason === PracticeSessionConflictReasons.AlreadyEnded ||
    reason === PracticeSessionConflictReasons.ExamTimeExpired
  );
}
