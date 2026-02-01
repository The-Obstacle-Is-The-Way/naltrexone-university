/**
 * Fisher-Yates shuffle with seeded PRNG (pure function).
 * Deterministic: same seed = same output.
 */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];

  if (result.length <= 1) {
    return result;
  }

  let state = seed | 0;

  // Mulberry32 PRNG
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * Create a deterministic numeric seed from user id + timestamp (pure function).
 *
 * Note: This is NOT a cryptographic hash. It's used only for deterministic shuffling.
 */
export function createSeed(userId: string, timestamp: number): number {
  const str = `${userId}:${timestamp}`;
  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }

  return Math.abs(hash);
}
