/**
 * Formats a count with a grammatically-correct noun.
 *
 * Returns `"${count} ${singular}"` when `count === 1`, otherwise
 * `"${count} ${plural}"`. When `plural` is omitted it defaults to
 * `singular + 's'`.
 *
 * @example
 * pluralize(1, 'question') // "1 question"
 * pluralize(2, 'question') // "2 questions"
 * pluralize(1, 'match', 'matches') // "1 match"
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string,
): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}
