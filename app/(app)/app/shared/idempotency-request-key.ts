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

type RequestKeySlotState = Readonly<{
  generation: number;
  token: FingerprintBoundIdempotencyKey | null;
}>;

export type RequestKeySlotStore = Map<string, RequestKeySlotState>;

export type RequestKeySlotClaim = Readonly<{
  token: FingerprintBoundIdempotencyKey | null;
  setToken: (token: FingerprintBoundIdempotencyKey) => void;
}>;

type RequestFingerprintPart =
  | string
  | number
  | boolean
  | null
  | readonly RequestFingerprintPart[];

export function createRequestKeySlotStore(): RequestKeySlotStore {
  return new Map();
}

/**
 * Give one invocation ownership of a persisted request-key slot.
 *
 * A later invocation supersedes this claim. Token transitions made by the
 * current invocation remain writable across its internal retry loop, while
 * any completion from an older invocation is ignored.
 */
export function claimRequestKeySlot(
  slots: RequestKeySlotStore,
  slotId: string,
): RequestKeySlotClaim {
  const previous = slots.get(slotId);
  const generation = (previous?.generation ?? 0) + 1;
  const token = previous?.token ?? null;
  slots.set(slotId, { generation, token });

  return {
    token,
    setToken: (nextToken) => {
      if (slots.get(slotId)?.generation !== generation) return;
      slots.set(slotId, { generation, token: nextToken });
    },
  };
}

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
