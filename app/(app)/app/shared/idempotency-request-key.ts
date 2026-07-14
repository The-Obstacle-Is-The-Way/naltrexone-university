/**
 * An idempotency key bound to the semantic request that minted it.
 *
 * A completed wrapper outcome is replayed before the business action runs, so
 * request-identity checks inside the action cannot protect a reused key. A key
 * may survive an indeterminate outcome, but only for this exact fingerprint.
 */
export type FingerprintBoundIdempotencyKey = Readonly<{
  key: string;
  fingerprint: string;
}>;

type RequestFingerprintPart =
  | string
  | number
  | boolean
  | null
  | readonly RequestFingerprintPart[];

export function createRequestFingerprint(
  parts: readonly RequestFingerprintPart[],
): string {
  return JSON.stringify(parts);
}

/**
 * Reuse a preserved key only for the request that minted it. A different
 * fingerprint is a new intent and receives a fresh key.
 */
export function resolveRequestKey(
  preservedToken: FingerprintBoundIdempotencyKey | null | undefined,
  fingerprint: string,
  createIdempotencyKey: (() => string) | undefined,
  setToken: ((token: FingerprintBoundIdempotencyKey) => void) | undefined,
): string | undefined {
  const preservedKey =
    preservedToken?.fingerprint === fingerprint
      ? preservedToken.key
      : undefined;
  const key = preservedKey ?? createIdempotencyKey?.();

  if (!preservedKey && key) {
    setToken?.({ key, fingerprint });
  }

  return key;
}

/** Replace a consumed or determinate key while retaining its request binding. */
export function mintRequestKey(
  createIdempotencyKey: () => string,
  fingerprint: string,
  setToken: ((token: FingerprintBoundIdempotencyKey) => void) | undefined,
): string {
  const key = createIdempotencyKey();
  setToken?.({ key, fingerprint });
  return key;
}
