import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';

export function findAdjacentAvailableQuestionId(
  navigator: GetPracticeSessionReviewOutput | null,
  currentQuestionId: string | null,
  direction: -1 | 1,
): string | null {
  if (!navigator || !currentQuestionId) return null;

  const currentIndex = navigator.rows.findIndex(
    (row) => row.questionId === currentQuestionId,
  );
  if (currentIndex < 0) return null;

  for (
    let index = currentIndex + direction;
    index >= 0 && index < navigator.rows.length;
    index += direction
  ) {
    const row = navigator.rows[index];
    if (!row?.isAvailable) continue;
    return row.questionId;
  }

  return null;
}
