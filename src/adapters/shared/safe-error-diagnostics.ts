import {
  type ApplicationErrorCode,
  isApplicationError,
} from '@/src/application/errors';

const MAX_CAUSE_DEPTH = 8;
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;
const ERROR_CLASS_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const POSTGRES_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;

export type SafeErrorDiagnostics = Readonly<{
  name?: string;
  code?: ApplicationErrorCode;
  sqlState?: string;
  constraint?: string;
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
    return typeof code === 'string' && SQLSTATE_PATTERN.test(code)
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

export function projectSafeErrorDiagnostics(
  error: unknown,
): SafeErrorDiagnostics {
  let name: string | null = null;
  let code: ApplicationErrorCode | null = null;
  let sqlState: string | null = null;
  let constraint: string | null = null;
  let current = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!current || typeof current !== 'object') break;

    name ??= getErrorClassName(current);
    code ??= getApplicationErrorCode(current);
    sqlState ??= getSqlState(current);
    constraint ??= getConstraint(current);

    const cause = getCause(current);
    if (!cause?.found) break;
    current = cause.value;
  }

  return {
    ...(name ? { name } : {}),
    ...(code ? { code } : {}),
    ...(sqlState ? { sqlState } : {}),
    ...(constraint ? { constraint } : {}),
  };
}
