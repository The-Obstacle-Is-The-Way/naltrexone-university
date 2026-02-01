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

export function isPostgresUniqueViolation(error: unknown): boolean {
  return getPostgresErrorCode(error) === '23505';
}
