const PERCENT_SCALE = 100;

/** A positive scored denominator gives a percentage, including 0% correct. */
export function formatScorePercentage({
  scored,
  accuracy,
}: {
  scored: number;
  accuracy: number;
}): string {
  return scored > 0 ? `${Math.round(accuracy * PERCENT_SCALE)}%` : '—';
}
