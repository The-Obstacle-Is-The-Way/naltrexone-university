export type AttemptHistory = ReadonlyMap<string, Date>;

/**
 * Select the next question id from a deterministic candidate list.
 *
 * Rules:
 * 1) Prefer the first question the user has never attempted (in candidate order).
 * 2) If all candidates have been attempted, select the one with the oldest last attempt timestamp.
 */
export function selectNextQuestionId(
  candidateIds: readonly string[],
  attemptHistory: AttemptHistory,
): string | null {
  for (const questionId of candidateIds) {
    if (!attemptHistory.has(questionId)) return questionId;
  }

  let oldestQuestionId: string | null = null;
  let oldestAnsweredAt: Date | null = null;

  for (const questionId of candidateIds) {
    const answeredAt = attemptHistory.get(questionId);
    if (!answeredAt) continue;

    if (!oldestAnsweredAt || answeredAt < oldestAnsweredAt) {
      oldestAnsweredAt = answeredAt;
      oldestQuestionId = questionId;
    }
  }

  return oldestQuestionId;
}
