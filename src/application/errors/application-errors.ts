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

export const PracticeSessionConflictReasons = {
  AlreadyEnded: 'practice_session_already_ended',
  ExamTimeExpired: 'exam_time_expired',
  StateChangedConcurrently: 'practice_session_state_changed_concurrently',
} as const;

export type PracticeSessionConflictReason =
  (typeof PracticeSessionConflictReasons)[keyof typeof PracticeSessionConflictReasons];

export const PracticeSessionConflictMessages = {
  AlreadyEnded: 'Practice session already ended',
  StateChangedConcurrently:
    'Practice session state changed concurrently; please retry.',
} as const;

export type ApplicationErrorDetails = Readonly<{
  reason?: PracticeSessionConflictReason;
}>;

const practiceSessionConflictReasonValues = new Set<string>(
  Object.values(PracticeSessionConflictReasons),
);

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
