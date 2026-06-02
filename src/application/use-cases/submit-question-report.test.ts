import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeQuestionFeedbackRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import { createQuestion } from '@/src/domain/test-helpers';
import { SubmitQuestionReportUseCase } from './submit-question-report';

describe('SubmitQuestionReportUseCase', () => {
  it('returns NOT_FOUND when the question is missing', async () => {
    const feedback = new FakeQuestionFeedbackRepository();
    const useCase = new SubmitQuestionReportUseCase(
      feedback,
      new FakeQuestionRepository([]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'missing',
        attemptId: null,
        practiceSessionId: null,
        category: 'incorrect_answer',
        comment: null,
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));
    expect(feedback.recordCalls).toEqual([]);
  });

  it('records a report event and returns its feedback id', async () => {
    const feedback = new FakeQuestionFeedbackRepository();
    const useCase = new SubmitQuestionReportUseCase(
      feedback,
      new FakeQuestionRepository([
        createQuestion({ id: 'question-1', status: 'published' }),
      ]),
    );

    const result = await useCase.execute({
      userId: 'user-1',
      questionId: 'question-1',
      attemptId: 'attempt-1',
      practiceSessionId: 'session-1',
      category: 'ambiguous_wording',
      comment: 'Two answers could be correct.',
    });

    expect(result.feedbackId).toEqual(expect.any(String));
    expect(feedback.recordCalls).toEqual([
      {
        userId: 'user-1',
        questionId: 'question-1',
        attemptId: 'attempt-1',
        practiceSessionId: 'session-1',
        kind: 'report',
        rating: null,
        category: 'ambiguous_wording',
        comment: 'Two answers could be correct.',
      },
    ]);
  });
});
