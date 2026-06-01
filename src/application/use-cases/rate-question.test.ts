import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeQuestionFeedbackRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import { createQuestion } from '@/src/domain/test-helpers';
import { RateQuestionUseCase } from './rate-question';

describe('RateQuestionUseCase', () => {
  it('returns NOT_FOUND when the question is missing', async () => {
    const feedback = new FakeQuestionFeedbackRepository();
    const useCase = new RateQuestionUseCase(
      feedback,
      new FakeQuestionRepository([]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'missing',
        attemptId: null,
        practiceSessionId: null,
        rating: 'helpful',
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));
    expect(feedback.recordCalls).toEqual([]);
  });

  it('records a rating event and returns the rating', async () => {
    const feedback = new FakeQuestionFeedbackRepository();
    const useCase = new RateQuestionUseCase(
      feedback,
      new FakeQuestionRepository([
        createQuestion({ id: 'question-1', status: 'published' }),
      ]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'question-1',
        attemptId: 'attempt-1',
        practiceSessionId: 'session-1',
        rating: 'not_helpful',
      }),
    ).resolves.toEqual({ rating: 'not_helpful' });

    expect(feedback.recordCalls).toEqual([
      {
        userId: 'user-1',
        questionId: 'question-1',
        attemptId: 'attempt-1',
        practiceSessionId: 'session-1',
        kind: 'rating',
        rating: 'not_helpful',
        category: null,
        comment: null,
      },
    ]);
    await expect(
      feedback.findLatestRatingByUser('user-1', 'question-1'),
    ).resolves.toMatchObject({ rating: 'not_helpful' });
  });

  it('records a null rating event for retraction', async () => {
    const feedback = new FakeQuestionFeedbackRepository();
    const useCase = new RateQuestionUseCase(
      feedback,
      new FakeQuestionRepository([
        createQuestion({ id: 'question-1', status: 'published' }),
      ]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'question-1',
        attemptId: null,
        practiceSessionId: null,
        rating: null,
      }),
    ).resolves.toEqual({ rating: null });

    expect(feedback.recordCalls).toEqual([
      {
        userId: 'user-1',
        questionId: 'question-1',
        attemptId: null,
        practiceSessionId: null,
        kind: 'rating',
        rating: null,
        category: null,
        comment: null,
      },
    ]);
  });
});
