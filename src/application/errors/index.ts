export {
  ApplicationError,
  type ApplicationErrorCode,
  ApplicationErrorCodes,
  type ApplicationErrorDetails,
  isApplicationError,
  isPracticeSessionConflictReason,
  PracticeSessionConflictMessages,
  type PracticeSessionConflictReason,
  PracticeSessionConflictReasons,
  practiceSessionAlreadyEndedError,
  practiceSessionStateChangedConcurrentlyError,
} from './application-errors';
