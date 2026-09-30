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

// The questions of the learner's own attempts, as each binding's revision and
// whatever their status now, keyed by `bindingKey` (ADR-021 §3: a withdrawn
// question stays reviewable by the learner who attempted it). The port omits a
// missing question for every binding of it and yields one question per other
// binding, in order, so the two lists pair up; each pair is checked, revision
// included.
export async function fetchOwnedQuestionsByBinding(
  repo: QuestionRepository,
  bindings: readonly QuestionRevisionBinding[],
): Promise<Map<string, Question>> {
  const unique = [
    ...new Map(
      bindings.map((binding) => [bindingKey(binding), binding]),
    ).values(),
  ];
  if (unique.length === 0) return new Map();

  const questions = await repo.findByIdsForSession(unique);
  const present = new Set(questions.map((question) => question.id));
  const found = unique.filter((binding) => present.has(binding.questionId));
  if (found.length !== questions.length) {
    throw brokenContract();
  }
  return new Map(
    found.map((binding, index) => {
      const question = questions[index];
      if (
        question?.id !== binding.questionId ||
        question.revisionId !== binding.questionRevisionId
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
    'findByIdsForSession did not return one question per binding in order',
  );
}
