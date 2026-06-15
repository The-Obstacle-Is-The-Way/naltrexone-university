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
    if (i === j) continue;

    // Use splice instead of tuple destructuring: strict indexed access types
    // each read as T | undefined, while these guarded indices are valid and
    // splice preserves the Fisher-Yates exchange without non-null assertions.
    const itemsAtJ = result.splice(j, 1);
    const itemsAtI = result.splice(i - 1, 1, ...itemsAtJ);
    result.splice(j, 0, ...itemsAtI);
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
  return hashString(str);
}

/**
 * Create a deterministic numeric seed from user id + question id (pure function).
 *
 * This ensures the same user always sees the same choice order for a given question,
 * but different users see different orders.
 *
 * Note: This is NOT a cryptographic hash. It's used only for deterministic shuffling.
 */
export function createQuestionSeed(userId: string, questionId: string): number {
  const str = `${userId}:${questionId}`;
  return hashString(str);
}

function hashString(str: string): number {
  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }

  // Convert signed int32 hash to an unsigned 32-bit integer (0..2^32-1) without
  // collapsing the sign bit (e.g., via Math.abs()).
  return hash >>> 0;
}
