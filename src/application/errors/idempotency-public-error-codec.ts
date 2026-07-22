import {
  ApplicationError,
  type ApplicationErrorCode,
  ApplicationErrorCodes,
  type ApplicationErrorDetails,
  isApplicationConflictReason,
} from './application-errors';

export const MAX_PUBLIC_ERROR_TEXT_LENGTH = 1_000;
export const MAX_ERROR_FIELDS = 32;
export const MAX_ERROR_FIELD_NAME_LENGTH = 128;
export const MAX_MESSAGES_PER_FIELD = 8;

export type IdempotencyPublicError = {
  code: ApplicationErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
  details?: ApplicationErrorDetails;
};

const applicationErrorCodeValues = new Set<string>(ApplicationErrorCodes);
const allowedTopLevelKeys = new Set([
  'code',
  'message',
  'fieldErrors',
  'details',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBoundedText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PUBLIC_ERROR_TEXT_LENGTH
  );
}

function invalidRecord(reason: string): never {
  throw new ApplicationError(
    'INTERNAL_ERROR',
    'Idempotency public error record is invalid',
    undefined,
    { cause: new Error(reason) },
  );
}

function decodeFieldErrors(value: unknown): Record<string, string[]> {
  if (!isPlainObject(value)) {
    invalidRecord('fieldErrors must be a plain object');
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_ERROR_FIELDS) {
    invalidRecord('fieldErrors exceeds the field-count bound');
  }

  const fieldErrorEntries: Array<[string, string[]]> = [];
  for (const [fieldName, messages] of entries) {
    if (
      fieldName.length === 0 ||
      fieldName.length > MAX_ERROR_FIELD_NAME_LENGTH
    ) {
      invalidRecord('fieldErrors contains an invalid field name');
    }
    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > MAX_MESSAGES_PER_FIELD
    ) {
      invalidRecord('fieldErrors contains an invalid message array');
    }
    if (!messages.every(isBoundedText)) {
      invalidRecord('fieldErrors contains an invalid message');
    }

    fieldErrorEntries.push([fieldName, [...messages]]);
  }

  return Object.fromEntries(fieldErrorEntries);
}

function decodeDetails(value: unknown): ApplicationErrorDetails {
  if (!isPlainObject(value)) {
    invalidRecord('details must be a plain object');
  }

  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'reason') {
    invalidRecord('details must contain only reason');
  }
  if (!isApplicationConflictReason(value.reason)) {
    invalidRecord('details contains an invalid reason');
  }

  return { reason: value.reason };
}

/**
 * Validates the exact, unversioned durable public-error shape. Completed rows
 * remain fail-loud on malformed data; INTERNAL_ERROR is the sole legacy
 * normalization and always loses its persisted diagnostic message.
 */
export function decodeIdempotencyPublicError(
  value: unknown,
): IdempotencyPublicError {
  if (!isPlainObject(value)) {
    invalidRecord('record must be a plain object');
  }

  for (const key of Object.keys(value)) {
    if (!allowedTopLevelKeys.has(key)) {
      invalidRecord('record contains an unknown key');
    }
  }

  if (
    typeof value.code !== 'string' ||
    !applicationErrorCodeValues.has(value.code)
  ) {
    invalidRecord('record contains an invalid code');
  }
  if (!isBoundedText(value.message)) {
    invalidRecord('record contains an invalid message');
  }

  const code = value.code as ApplicationErrorCode;
  return {
    code,
    message: code === 'INTERNAL_ERROR' ? 'Internal error' : value.message,
    ...(Object.hasOwn(value, 'fieldErrors')
      ? { fieldErrors: decodeFieldErrors(value.fieldErrors) }
      : {}),
    ...(Object.hasOwn(value, 'details')
      ? { details: decodeDetails(value.details) }
      : {}),
  };
}

/** Persistence-boundary alias: encoding and decoding share one exact schema. */
export const encodeIdempotencyPublicError = decodeIdempotencyPublicError;
