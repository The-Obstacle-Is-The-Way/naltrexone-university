// Fixtures shared by the FinalizeExamAnswersUseCase suites.
import type {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import type { FinalizeExamAnswersWriteTransaction } from '@/src/application/use-cases/finalize-exam-answers';
import { createChoice, createQuestion } from '@/src/domain/test-helpers';

export function passthroughTransaction(
  questions: FakeQuestionRepository,
  attempts: FakeAttemptRepository,
  sessions: FakePracticeSessionRepository,
): FinalizeExamAnswersWriteTransaction {
  return async (fn) =>
    fn({
      questions,
      attempts,
      sessions,
    });
}

export function createFinalizeQuestion(
  questionId: string,
  correctChoiceId: string,
  incorrectChoiceId?: string,
  overrides: Partial<ReturnType<typeof createQuestion>> = {},
) {
  const wrongId = incorrectChoiceId ?? `${questionId}-wrong`;
  return createQuestion({
    id: questionId,
    slug: questionId,
    choices: [
      createChoice({
        id: correctChoiceId,
        questionId,
        label: 'A',
        sortOrder: 1,
        isCorrect: true,
      }),
      createChoice({
        id: wrongId,
        questionId,
        label: 'B',
        sortOrder: 2,
        isCorrect: false,
      }),
    ],
    ...overrides,
  });
}
