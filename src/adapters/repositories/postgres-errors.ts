import {
  type RollbackCertainPersistenceError,
  rollbackCertainPersistenceError,
} from '@/src/application/errors';

const QUERY_CANCELED_SQLSTATE = '57014';

export function getPostgresErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;

  if ('code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }

  if ('cause' in error) {
    const cause = (error as { cause?: unknown }).cause;
    if (!cause || typeof cause !== 'object') return null;

    const code = (cause as { code?: unknown }).code;
    if (typeof code === 'string') return code;
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

  if (!error || typeof error !== 'object') return null;

  const topLevelName = getConstraintName(error);
  if (topLevelName) return topLevelName;

  if ('cause' in error) {
    const cause = (error as { cause?: unknown }).cause;
    const causeName = getConstraintName(cause);
    if (causeName) return causeName;
  }

  return null;
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return getPostgresErrorCode(error) === '23505';
}

export function toRollbackCertainPersistenceError(
  error: unknown,
): RollbackCertainPersistenceError | null {
  if (getPostgresErrorCode(error) !== QUERY_CANCELED_SQLSTATE) return null;
  return rollbackCertainPersistenceError({ cause: error });
}
