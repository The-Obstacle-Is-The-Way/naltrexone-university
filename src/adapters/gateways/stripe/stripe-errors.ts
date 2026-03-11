function getStringProp(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string' ? record[key] : null;
}

export function isAlreadyCanceledError(error: unknown): boolean {
  const rawType = getStringProp(error, 'rawType');
  if (rawType !== 'invalid_request_error') {
    return false;
  }

  const code = getStringProp(error, 'code');
  if (code === 'resource_missing') {
    return true;
  }

  const message = getStringProp(error, 'message')?.toLowerCase();
  return (
    message?.includes('already canceled') === true ||
    message?.includes('no such subscription') === true
  );
}
