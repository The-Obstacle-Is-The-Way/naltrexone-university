import { vi } from 'vitest';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';

const fixtureQuestion1Id = crypto.randomUUID();
vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

export function createQuestionProps() {
  return createNextQuestion({
    questionId: fixtureQuestion1Id,
    slug: 'question-1',
    stemMd: 'Stem',
    difficulty: 'easy',
  });
}
