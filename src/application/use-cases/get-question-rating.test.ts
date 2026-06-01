import { describe, expect, it } from 'vitest';
import { FakeQuestionFeedbackRepository } from '@/src/application/test-helpers/fakes';
import { createQuestionRatingFeedback } from '@/src/domain/test-helpers';
import { GetQuestionRatingUseCase } from './get-question-rating';

describe('GetQuestionRatingUseCase', () => {
  it('returns null when no rating exists', async () => {
    const useCase = new GetQuestionRatingUseCase(
      new FakeQuestionFeedbackRepository(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'question-1' }),
    ).resolves.toEqual({ rating: null });
  });

  it('returns the latest rating for the user and question', async () => {
    const useCase = new GetQuestionRatingUseCase(
      new FakeQuestionFeedbackRepository([
        createQuestionRatingFeedback({
          userId: 'user-1',
          questionId: 'question-1',
          rating: 'helpful',
          createdAt: new Date('2026-02-10T00:00:00.000Z'),
        }),
        createQuestionRatingFeedback({
          userId: 'user-1',
          questionId: 'question-1',
          rating: 'not_helpful',
          createdAt: new Date('2026-02-11T00:00:00.000Z'),
        }),
      ]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'question-1' }),
    ).resolves.toEqual({ rating: 'not_helpful' });
  });

  it('returns null when the latest rating is a retraction', async () => {
    const useCase = new GetQuestionRatingUseCase(
      new FakeQuestionFeedbackRepository([
        createQuestionRatingFeedback({
          userId: 'user-1',
          questionId: 'question-1',
          rating: 'helpful',
          createdAt: new Date('2026-02-10T00:00:00.000Z'),
        }),
        createQuestionRatingFeedback({
          userId: 'user-1',
          questionId: 'question-1',
          rating: null,
          createdAt: new Date('2026-02-11T00:00:00.000Z'),
        }),
      ]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'question-1' }),
    ).resolves.toEqual({ rating: null });
  });
});
