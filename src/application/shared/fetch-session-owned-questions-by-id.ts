import type {
  QuestionRepository,
  SessionItemBinding,
} from '@/src/application/ports/repositories';
import type { Question } from '@/src/domain/entities';

// A session holds each question once, so a question id identifies its item.
export async function fetchSessionOwnedQuestionsById(
  repo: QuestionRepository,
  items: readonly SessionItemBinding[],
): Promise<Map<string, Question>> {
  const uniqueItems = [
    ...new Map(items.map((item) => [item.questionId, item])).values(),
  ];
  if (uniqueItems.length === 0) return new Map();

  const questions = await repo.findByIdsForSession(uniqueItems);
  return new Map(questions.map((question) => [question.id, question]));
}
