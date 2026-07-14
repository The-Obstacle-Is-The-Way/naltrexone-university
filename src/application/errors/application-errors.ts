export const ApplicationErrorCodes = [
  'UNAUTHENTICATED',
  'ALREADY_SUBSCRIBED',
  'UNSUBSCRIBED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'STRIPE_ERROR',
  'INVALID_WEBHOOK_SIGNATURE',
  'INVALID_WEBHOOK_PAYLOAD',
  'INTERNAL_ERROR',
] as const;

export type ApplicationErrorCode = (typeof ApplicationErrorCodes)[number];

export const ApplicationConflictReasons = {
  AlreadyEnded: 'practice_session_already_ended',
  ExamTimeExpired: 'exam_time_expired',
  StateChangedConcurrently: 'practice_session_state_changed_concurrently',
  ConcurrentRequestInProgress: 'concurrent_request_in_progress',
  IncompleteSessionExists: 'incomplete_practice_session_exists',
  UserEmailOwnedByAnotherIdentity: 'user_email_owned_by_another_identity',
  FeedbackRequestReused: 'feedback_request_token_reused',
} as const;

export type ApplicationConflictReason =
  (typeof ApplicationConflictReasons)[keyof typeof ApplicationConflictReasons];

export const PracticeSessionConflictReasons = {
  AlreadyEnded: ApplicationConflictReasons.AlreadyEnded,
  ExamTimeExpired: ApplicationConflictReasons.ExamTimeExpired,
  StateChangedConcurrently: ApplicationConflictReasons.StateChangedConcurrently,
} as const;

export type PracticeSessionConflictReason =
  (typeof PracticeSessionConflictReasons)[keyof typeof PracticeSessionConflictReasons];

export const PracticeSessionConflictMessages = {
  AlreadyEnded: 'Practice session already ended',
  StateChangedConcurrently:
    'Practice session state changed concurrently; please retry.',
} as const;

export const AttemptConflictMessages = {
  AlreadyAnsweredInSession:
    'This question has already been answered in this session',
} as const;

export const UserConflictMessages = {
  EmailOwnedByAnotherIdentity:
    'Email is already associated with another identity',
} as const;

export type ApplicationErrorDetails = Readonly<{
  reason?: ApplicationConflictReason;
}>;

const applicationConflictReasonValues = new Set<string>(
  Object.values(ApplicationConflictReasons),
);

const practiceSessionConflictReasonValues = new Set<string>(
  Object.values(PracticeSessionConflictReasons),
);

export function isApplicationConflictReason(
  value: unknown,
): value is ApplicationConflictReason {
  return (
    typeof value === 'string' && applicationConflictReasonValues.has(value)
  );
}

export function isPracticeSessionConflictReason(
  value: unknown,
): value is PracticeSessionConflictReason {
  return (
    typeof value === 'string' && practiceSessionConflictReasonValues.has(value)
  );
}

export class ApplicationError extends Error {
  readonly _tag = 'ApplicationError' as const;
  readonly details?: ApplicationErrorDetails;

  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
    options?: { cause?: unknown; details?: ApplicationErrorDetails },
  ) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = 'ApplicationError';
    if (options?.details !== undefined) {
      this.details = options.details;
    }
  }
}

/**
 * Marks a persistence failure whose owning transaction is known to have
 * rolled back. Construct this only while handling an error thrown from inside
 * a transaction body, before control returns to the COMMIT boundary.
 * Idempotency policies may safely abort the claim for this error while keeping
 * transaction-boundary INTERNAL_ERROR failures conservatively fenced.
 */
export class RollbackCertainPersistenceError extends ApplicationError {
  readonly determinacy = 'rollback_certain' as const;

  constructor(options?: { cause?: unknown }) {
    super(
      'INTERNAL_ERROR',
      'Persistence operation was rolled back; please retry.',
      undefined,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = 'RollbackCertainPersistenceError';
  }
}

export function rollbackCertainPersistenceError(options?: {
  cause?: unknown;
}): RollbackCertainPersistenceError {
  return new RollbackCertainPersistenceError(options);
}

export function isRollbackCertainPersistenceError(
  error: unknown,
): error is RollbackCertainPersistenceError {
  return error instanceof RollbackCertainPersistenceError;
}

export class UserEmailOwnershipConflictError extends ApplicationError {
  constructor(
    public readonly existingClerkUserId: string,
    options?: { cause?: unknown },
  ) {
    super(
      'CONFLICT',
      UserConflictMessages.EmailOwnedByAnotherIdentity,
      undefined,
      {
        ...(options?.cause !== undefined ? { cause: options.cause } : {}),
        details: {
          reason: ApplicationConflictReasons.UserEmailOwnedByAnotherIdentity,
        },
      },
    );
  }
}

export function isUserEmailOwnershipConflictError(
  error: unknown,
): error is UserEmailOwnershipConflictError {
  return error instanceof UserEmailOwnershipConflictError;
}

export class SubscriptionUserMissingError extends ApplicationError {
  readonly reason = 'user_missing' as const;

  constructor(
    public readonly userId: string,
    options?: { cause?: unknown },
  ) {
    super(
      'NOT_FOUND',
      'Subscription user does not exist',
      undefined,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = 'SubscriptionUserMissingError';
  }
}

export function isSubscriptionUserMissingError(
  error: unknown,
): error is SubscriptionUserMissingError {
  return error instanceof SubscriptionUserMissingError;
}

export class SubscriptionObservationAttemptsExhaustedError extends ApplicationError {
  readonly reason = 'version_conflict_attempts_exhausted' as const;

  constructor(public readonly attempts: number) {
    super(
      'CONFLICT',
      `Subscription observation version conflicted after ${attempts} attempts`,
    );
    this.name = 'SubscriptionObservationAttemptsExhaustedError';
  }
}

export function isSubscriptionObservationAttemptsExhaustedError(
  error: unknown,
): error is SubscriptionObservationAttemptsExhaustedError {
  return error instanceof SubscriptionObservationAttemptsExhaustedError;
}

export function practiceSessionAlreadyEndedError(options?: {
  cause?: unknown;
}): ApplicationError {
  return new ApplicationError(
    'CONFLICT',
    PracticeSessionConflictMessages.AlreadyEnded,
    undefined,
    {
      ...(options?.cause !== undefined ? { cause: options.cause } : {}),
      details: {
        reason: PracticeSessionConflictReasons.AlreadyEnded,
      },
    },
  );
}

export function practiceSessionStateChangedConcurrentlyError(options?: {
  cause?: unknown;
}): ApplicationError {
  return new ApplicationError(
    'CONFLICT',
    PracticeSessionConflictMessages.StateChangedConcurrently,
    undefined,
    {
      ...(options?.cause !== undefined ? { cause: options.cause } : {}),
      details: {
        reason: PracticeSessionConflictReasons.StateChangedConcurrently,
      },
    },
  );
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}
