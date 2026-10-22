import {
  type ApplicationErrorCode,
  isApplicationError,
} from '@/src/application/errors';

const VENDOR_TYPES = new Set([
  'StripeError',
  'StripeAPIError',
  'StripeConnectionError',
  'StripeAuthenticationError',
  'StripePermissionError',
  'StripeRateLimitError',
  'StripeInvalidRequestError',
  'StripeCardError',
  'StripeIdempotencyError',
  'StripeSignatureVerificationError',
]);
const VENDOR_CODES = new Set([
  'resource_missing',
  'rate_limit',
  'idempotency_key_in_use',
  'parameter_missing',
  'parameter_invalid_integer',
  'parameter_unknown',
  'api_key_expired',
  'card_declined',
]);
const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'EPIPE',
]);
const REQUEST_ID_PATTERN = /^req_[A-Za-z0-9]{1,128}$/;

const MAX_CAUSE_DEPTH = 8;
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;
const ERROR_CLASS_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const POSTGRES_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;

export type SafeErrorDiagnostics = Readonly<{
  name?: string;
  code?: ApplicationErrorCode;
  sqlState?: string;
  constraint?: string;
  vendorType?: string;
  vendorCode?: string;
  networkCode?: string;
  requestId?: string;
  statusCode?: number;
}>;

function safelyInspect<T>(inspect: () => T): T | null {
  try {
    return inspect();
  } catch {
    // Hostile error objects must not turn diagnostics into a second failure.
    return null;
  }
}

function getErrorClassName(value: object): string | null {
  return safelyInspect(() => {
    if (!(value instanceof Error)) return null;
    const name = value.constructor.name;
    return ERROR_CLASS_PATTERN.test(name) ? name : null;
  });
}

function getApplicationErrorCode(value: object): ApplicationErrorCode | null {
  return safelyInspect(() => (isApplicationError(value) ? value.code : null));
}

function getSqlState(value: object): string | null {
  return safelyInspect(() => {
    if (!('code' in value)) return null;
    const code = (value as { code?: unknown }).code;
    // EPIPE also fits the SQLSTATE shape; a network code is never a SQLSTATE.
    return typeof code === 'string' &&
      SQLSTATE_PATTERN.test(code) &&
      !NETWORK_CODES.has(code)
      ? code
      : null;
  });
}

function getConstraint(value: object): string | null {
  const candidate =
    safelyInspect(() =>
      'constraint' in value
        ? (value as { constraint?: unknown }).constraint
        : undefined,
    ) ??
    safelyInspect(() =>
      'constraint_name' in value
        ? (value as { constraint_name?: unknown }).constraint_name
        : undefined,
    );
  return typeof candidate === 'string' &&
    POSTGRES_IDENTIFIER_PATTERN.test(candidate)
    ? candidate
    : null;
}

function getCause(value: object): { found: boolean; value?: unknown } | null {
  return safelyInspect(() =>
    'cause' in value
      ? { found: true, value: (value as { cause?: unknown }).cause }
      : { found: false },
  );
}

function vendorDiagnostics(value: object): Partial<SafeErrorDiagnostics> {
  const read = (key: string) =>
    safelyInspect(() => (value as Record<string, unknown>)[key]);
  const type = read('type');
  const code = read('code');
  const requestId = read('requestId');
  const status = read('statusCode') ?? read('status');
  return {
    ...(typeof type === 'string' && VENDOR_TYPES.has(type)
      ? { vendorType: type }
      : {}),
    ...(typeof code === 'string' && VENDOR_CODES.has(code)
      ? { vendorCode: code }
      : {}),
    ...(typeof code === 'string' && NETWORK_CODES.has(code)
      ? { networkCode: code }
      : {}),
    ...(typeof requestId === 'string' && REQUEST_ID_PATTERN.test(requestId)
      ? { requestId }
      : {}),
    ...(typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599
      ? { statusCode: status }
      : {}),
  };
}

export function projectSafeErrorDiagnostics(
  error: unknown,
): SafeErrorDiagnostics {
  let name: string | null = null;
  let code: ApplicationErrorCode | null = null;
  let sqlState: string | null = null;
  let constraint: string | null = null;
  let current = error;
  let vendor: Partial<SafeErrorDiagnostics> = {};

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!current || typeof current !== 'object') break;

    name ??= getErrorClassName(current);
    code ??= getApplicationErrorCode(current);
    sqlState ??= getSqlState(current);
    constraint ??= getConstraint(current);
    vendor = { ...vendorDiagnostics(current), ...vendor };

    const cause = getCause(current);
    if (!cause?.found) break;
    current = cause.value;
  }

  return {
    ...vendor,
    ...(name ? { name } : {}),
    ...(code ? { code } : {}),
    ...(sqlState ? { sqlState } : {}),
    ...(constraint ? { constraint } : {}),
  };
}
