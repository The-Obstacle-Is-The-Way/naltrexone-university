const DAY_MS = 86_400_000;

function utcDayNumber(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

/**
 * Compute accuracy ratio (pure function).
 */
export function computeAccuracy(total: number, correct: number): number {
  if (total <= 0) return 0;
  return correct / total;
}

/**
 * Compute current streak in days (pure function).
 * Streak = consecutive UTC days with attempts, ending today.
 */
export function computeStreak(
  attemptDates: readonly Date[],
  now: Date,
): number {
  if (attemptDates.length === 0) return 0;

  const uniqueDays = new Set(attemptDates.map(utcDayNumber));
  const today = utcDayNumber(now);

  if (!uniqueDays.has(today)) return 0;

  let streak = 0;
  for (let day = today; uniqueDays.has(day); day -= 1) {
    streak += 1;
  }

  return streak;
}

/**
 * Filter attempts within N days (pure function).
 */
export function filterAttemptsInWindow<T extends { answeredAt: Date }>(
  attempts: readonly T[],
  days: number,
  now: Date,
): T[] {
  if (days <= 0) return [];

  const cutoff = now.getTime() - days * DAY_MS;
  return attempts.filter((a) => a.answeredAt.getTime() >= cutoff);
}
