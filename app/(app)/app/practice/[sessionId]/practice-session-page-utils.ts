import type { NextQuestion } from '@/src/application/use-cases/get-next-question';

export function isQuestionBookmarked(
  question: NextQuestion | null,
  bookmarkedQuestionIds: Set<string>,
): boolean {
  if (!question) return false;
  return bookmarkedQuestionIds.has(question.questionId);
}
