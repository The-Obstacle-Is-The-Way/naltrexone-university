export async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!(limit >= 1)) {
    throw new Error('mapWithConcurrencyLimit: limit must be >= 1');
  }
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      if (!(index in items)) {
        throw new Error(
          `mapWithConcurrencyLimit: missing item at index ${index}`,
        );
      }
      const item = items[index] as T;
      results[index] = await fn(item);
    }
  });

  await Promise.all(workers);
  return results;
}
