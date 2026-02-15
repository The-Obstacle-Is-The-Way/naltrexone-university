import { describe, expect, it } from 'vitest';
import { createQuestion, createTag } from '@/src/domain/test-helpers';
import { FakeQuestionRepository } from '../test-helpers/fakes';
import { CountAvailableQuestionsUseCase } from './count-available-questions';

describe('CountAvailableQuestionsUseCase', () => {
  it('returns the repository count for the requested filters', async () => {
    const tag = createTag({ id: 'tag_1', slug: 'opioids' });
    const questions = [
      createQuestion({
        id: 'q1',
        difficulty: 'easy',
        tags: [tag],
      }),
      createQuestion({
        id: 'q2',
        difficulty: 'hard',
        tags: [tag],
      }),
    ];

    const questionRepository = new FakeQuestionRepository(questions);
    const useCase = new CountAvailableQuestionsUseCase(questionRepository);

    await expect(
      useCase.execute({
        userId: 'user_1',
        tagSlugs: ['opioids'],
        difficulties: ['easy'],
        statuses: ['unanswered'],
      }),
    ).resolves.toEqual({ count: 1 });

    expect(questionRepository.countPublishedCandidateIdsCalls[0]).toEqual({
      userId: 'user_1',
      tagSlugs: ['opioids'],
      difficulties: ['easy'],
      statuses: ['unanswered'],
    });
  });
});
