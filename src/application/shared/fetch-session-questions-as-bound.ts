import type { QuestionRepository } from '@/src/application/ports/repositories';
import type { PracticeSession, Question } from '@/src/domain/entities';

// ADR-021: a session's published questions as the revisions its items were
// bound to. A session holds each question once, so a question id identifies
// its item.
export async function fetchSessionQuestionsAsBound(
  repo: QuestionRepository,
  session: Pick<PracticeSession, 'questionStates'>,
): Promise<Map<string, Question>> {
  if (session.questionStates.length === 0) return new Map();

  const questions = await repo.findPublishedByBindings(session.questionStates);
  return new Map(questions.map((question) => [question.id, question]));
}
