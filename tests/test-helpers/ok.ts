export function ok<T>(data: T) {
  return { ok: true as const, data };
}
