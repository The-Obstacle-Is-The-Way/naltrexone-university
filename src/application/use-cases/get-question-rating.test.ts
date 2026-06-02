import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeQuestionFeedbackRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createQuestion,
  createQuestionRatingFeedback,
} from '@/src/domain/test-helpers';
import { GetQuestionRatingUseCase } from './get-question-rating';

describe('GetQuestionRatingUseCase', () => {
  it('returns NOT_FOUND when the question is missing', async () => {
    const useCase = new GetQuestionRatingUseCase(
      new FakeQuestionFeedbackRepository(),
      new FakeQuestionRepository([]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'missing' }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));
  });

  it('returns null when no rating exists', async () => {
    const useCase = new GetQuestionRatingUseCase(
      new FakeQuestionFeedbackRepository(),
      new FakeQuestionRepository([
        createQuestion({ id: 'question-1', status: 'published' }),
      ]),
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
      new FakeQuestionRepository([
        createQuestion({ id: 'question-1', status: 'published' }),
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
      new FakeQuestionRepository([
        createQuestion({ id: 'question-1', status: 'published' }),
      ]),
    );

    await expect(
      useCase.execute({ userId: 'user-1', questionId: 'question-1' }),
    ).resolves.toEqual({ rating: null });
  });
});
