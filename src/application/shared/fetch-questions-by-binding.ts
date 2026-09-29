import { ApplicationError } from '@/src/application/errors';
import type {
  QuestionRepository,
  QuestionRevisionBinding,
} from '@/src/application/ports/repositories';
import type { Question } from '@/src/domain/entities';

// ADR-021: one key per question and bound revision, so two attempts of one
// question at different revisions never share a question.
export function bindingKey(binding: QuestionRevisionBinding): string {
  return JSON.stringify([binding.questionId, binding.questionRevisionId]);
}

// Published questions as each binding's revision, keyed by `bindingKey`. The
// port omits an unpublished question for every binding of it and yields one
// question per other binding, in order, so the two lists pair up; each pair is
// checked, including a bound binding's revision.
export async function fetchQuestionsByBinding(
  repo: QuestionRepository,
  bindings: readonly QuestionRevisionBinding[],
): Promise<Map<string, Question>> {
  const unique = [
    ...new Map(
      bindings.map((binding) => [bindingKey(binding), binding]),
    ).values(),
  ];
  if (unique.length === 0) return new Map();

  const questions = await repo.findPublishedByBindings(unique);
  const published = new Set(questions.map((question) => question.id));
  const found = unique.filter((binding) => published.has(binding.questionId));
  if (found.length !== questions.length) {
    throw brokenContract();
  }
  return new Map(
    found.map((binding, index) => {
      const question = questions[index];
      if (
        question?.id !== binding.questionId ||
        (binding.questionRevisionId !== null &&
          question.revisionId !== binding.questionRevisionId)
      ) {
        throw brokenContract();
      }
      return [bindingKey(binding), question];
    }),
  );
}

function brokenContract() {
  return new ApplicationError(
    'INTERNAL_ERROR',
    'findPublishedByBindings did not return one question per binding in order',
  );
}
