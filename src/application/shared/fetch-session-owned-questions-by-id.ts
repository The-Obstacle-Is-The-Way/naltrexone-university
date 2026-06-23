import type { QuestionRepository } from '@/src/application/ports/repositories';
import type { Question } from '@/src/domain/entities';

export async function fetchSessionOwnedQuestionsById(
  repo: QuestionRepository,
  ids: readonly string[],
): Promise<Map<string, Question>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return new Map();

  const questions = await repo.findByIdsForSession(uniqueIds);
  return new Map(questions.map((question) => [question.id, question]));
}
