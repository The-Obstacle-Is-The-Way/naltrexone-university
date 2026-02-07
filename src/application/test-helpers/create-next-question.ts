import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import { createChoice, createQuestion } from '@/src/domain/test-helpers';

export function createNextQuestion(
  overrides: Partial<NextQuestion> = {},
): NextQuestion {
  const questionId = overrides.questionId ?? 'q_1';
  const slug = overrides.slug ?? 'q-1';
  const stemMd = overrides.stemMd ?? '#';
  const difficulty = overrides.difficulty ?? 'easy';

  const choice = createChoice({
    id: 'choice_1',
    questionId,
    label: 'A',
    textMd: 'Choice A',
    sortOrder: 1,
  });

  const question = createQuestion({
    id: questionId,
    slug,
    stemMd,
    difficulty,
    choices: [choice],
  });

  return {
    questionId: question.id,
    slug: question.slug,
    stemMd: question.stemMd,
    difficulty: question.difficulty,
    choices: question.choices.map((currentChoice, index) => ({
      id: currentChoice.id,
      label: currentChoice.label,
      textMd: currentChoice.textMd,
      sortOrder: index + 1,
    })),
    session: null,
    ...overrides,
  };
}
