import {
  type RollbackCertainPersistenceError,
  rollbackCertainPersistenceError,
} from '@/src/application/errors';

const QUERY_CANCELED_SQLSTATE = '57014';

export type PostgresFailurePhase = 'transaction_body' | 'transaction_boundary';

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;
const MAX_CAUSE_DEPTH = 8;

export function getPostgresErrorCode(error: unknown): string | null {
  // Only SQLSTATE-shaped codes count: wrapper errors (e.g. ApplicationError)
  // carry their own string `code`, which must not short-circuit traversal to
  // the driver error in their cause chain.
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!current || typeof current !== 'object') return null;

    if ('code' in current) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === 'string' && SQLSTATE_PATTERN.test(code)) return code;
    }

    if (!('cause' in current)) return null;
    current = (current as { cause?: unknown }).cause;
  }

  return null;
}

export function getPostgresConstraintName(error: unknown): string | null {
  const getConstraintName = (value: unknown): string | null => {
    if (!value || typeof value !== 'object') return null;

    if ('constraint' in value) {
      const name = (value as { constraint?: unknown }).constraint;
      if (typeof name === 'string') return name;
    }

    if ('constraint_name' in value) {
      const name = (value as { constraint_name?: unknown }).constraint_name;
      if (typeof name === 'string') return name;
    }

    return null;
  };

  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!current || typeof current !== 'object') return null;

    const constraintName = getConstraintName(current);
    if (constraintName) return constraintName;

    if (!('cause' in current)) return null;
    current = (current as { cause?: unknown }).cause;
  }

  return null;
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return getPostgresErrorCode(error) === '23505';
}

export function toRollbackCertainPersistenceError(
  error: unknown,
  context: { phase: PostgresFailurePhase },
): RollbackCertainPersistenceError | null {
  if (context.phase !== 'transaction_body') return null;
  if (getPostgresErrorCode(error) !== QUERY_CANCELED_SQLSTATE) return null;
  return rollbackCertainPersistenceError({ cause: error });
}
