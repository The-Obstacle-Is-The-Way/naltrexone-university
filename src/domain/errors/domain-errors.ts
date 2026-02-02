export const DomainErrorCodes = ['INVALID_QUESTION', 'INVALID_CHOICE'] as const;

export type DomainErrorCode = (typeof DomainErrorCodes)[number];

export class DomainError extends Error {
  readonly _tag = 'DomainError' as const;

  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
