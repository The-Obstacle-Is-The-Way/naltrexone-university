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

export class ApplicationError extends Error {
  readonly _tag = 'ApplicationError' as const;

  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = 'ApplicationError';

    if (options?.cause !== undefined) {
      (this as unknown as { cause: unknown }).cause = options.cause;
    }
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}
