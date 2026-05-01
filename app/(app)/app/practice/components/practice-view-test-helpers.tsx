import { vi } from 'vitest';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

export function createQuestionProps() {
  return createNextQuestion({
    questionId: 'question-1',
    slug: 'question-1',
    stemMd: 'Stem',
    difficulty: 'easy',
  });
}
