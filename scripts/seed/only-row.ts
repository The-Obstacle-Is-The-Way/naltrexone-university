// A seed write or lock that must return exactly one row; its absence is a
// broken invariant, reported with the caller's message.
export function onlyRow<T>(rows: readonly T[], message: string): T {
  const [row] = rows;
  if (row === undefined) throw new Error(message);
  return row;
}
