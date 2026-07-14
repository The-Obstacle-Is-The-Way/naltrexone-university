import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionFeedbackRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createAttempt,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import { RateQuestionUseCase } from './rate-question';

const userId = 'user-1';

function makeUseCase(input?: {
  questions?: FakeQuestionRepository;
  attempts?: FakeAttemptRepository;
  sessions?: FakePracticeSessionRepository;
}): {
  useCase: RateQuestionUseCase;
  feedback: FakeQuestionFeedbackRepository;
} {
  const feedback = new FakeQuestionFeedbackRepository();
  const useCase = new RateQuestionUseCase(
    feedback,
    input?.questions ??
      new FakeQuestionRepository([
        createQuestion({ id: 'question-1', status: 'published' }),
      ]),
    input?.attempts ?? new FakeAttemptRepository(),
    input?.sessions ?? new FakePracticeSessionRepository(),
  );
  return { useCase, feedback };
}

describe('RateQuestionUseCase', () => {
  it('returns NOT_FOUND when the question is missing', async () => {
    const { useCase, feedback } = makeUseCase({
      questions: new FakeQuestionRepository([]),
    });

    await expect(
      useCase.execute({
        userId,
        questionId: 'missing',
        attemptId: null,
        practiceSessionId: null,
        rating: 'helpful',
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));
    expect(feedback.recordCalls).toEqual([]);
  });

  it('records a rating event with validated context and returns the rating', async () => {
    const { useCase, feedback } = makeUseCase({
      attempts: new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-1',
          userId,
          questionId: 'question-1',
          practiceSessionId: 'session-1',
        }),
      ]),
      sessions: new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-1',
          userId,
          questionIds: ['question-1'],
        }),
      ]),
    });

    await expect(
      useCase.execute({
        userId,
        questionId: 'question-1',
        attemptId: 'attempt-1',
        practiceSessionId: 'session-1',
        rating: 'not_helpful',
      }),
    ).resolves.toEqual({ rating: 'not_helpful' });

    expect(feedback.recordCalls).toEqual([
      {
        userId,
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
      feedback.findLatestRatingByUser(userId, 'question-1'),
    ).resolves.toMatchObject({ rating: 'not_helpful' });
  });

  it('records a null rating event for retraction', async () => {
    const { useCase, feedback } = makeUseCase();

    await expect(
      useCase.execute({
        userId,
        questionId: 'question-1',
        attemptId: null,
        practiceSessionId: null,
        rating: null,
      }),
    ).resolves.toEqual({ rating: null });

    expect(feedback.recordCalls).toEqual([
      {
        userId,
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

  it('returns the original rating when a request idempotency key is replayed', async () => {
    const { useCase, feedback } = makeUseCase();
    const baseInput = {
      userId,
      questionId: 'question-1',
      attemptId: null,
      practiceSessionId: null,
      idempotencyKey: 'request-1',
    } as const;

    const first = await useCase.execute({ ...baseInput, rating: 'helpful' });
    const replay = await useCase.execute({ ...baseInput, rating: 'helpful' });

    expect(first).toEqual({ rating: 'helpful' });
    expect(replay).toEqual(first);
    await expect(
      feedback.findLatestRatingByUser(userId, 'question-1'),
    ).resolves.toMatchObject({ rating: 'helpful' });
  });

  it('rejects a replayed request idempotency key carrying a changed rating', async () => {
    const { useCase } = makeUseCase();
    const baseInput = {
      userId,
      questionId: 'question-1',
      attemptId: null,
      practiceSessionId: null,
      idempotencyKey: 'request-1',
    } as const;

    await useCase.execute({ ...baseInput, rating: 'helpful' });

    await expect(
      useCase.execute({ ...baseInput, rating: 'not_helpful' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'feedback_request_token_reused' },
    });
  });

  it('rejects and records nothing when the attempt belongs to a different question', async () => {
    const { useCase, feedback } = makeUseCase({
      attempts: new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-q2',
          userId,
          questionId: 'question-2',
          practiceSessionId: null,
        }),
      ]),
    });

    await expect(
      useCase.execute({
        userId,
        questionId: 'question-1',
        attemptId: 'attempt-q2',
        practiceSessionId: null,
        rating: 'helpful',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(feedback.recordCalls).toEqual([]);
  });

  it('rejects and records nothing when the session does not contain the question', async () => {
    const { useCase, feedback } = makeUseCase({
      sessions: new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-1',
          userId,
          questionIds: ['question-2'],
        }),
      ]),
    });

    await expect(
      useCase.execute({
        userId,
        questionId: 'question-1',
        attemptId: null,
        practiceSessionId: 'session-1',
        rating: 'helpful',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(feedback.recordCalls).toEqual([]);
  });

  it('rejects with NOT_FOUND when the attempt is not owned by the user', async () => {
    const { useCase, feedback } = makeUseCase({
      attempts: new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-1',
          userId: 'someone-else',
          questionId: 'question-1',
          practiceSessionId: null,
        }),
      ]),
    });

    await expect(
      useCase.execute({
        userId,
        questionId: 'question-1',
        attemptId: 'attempt-1',
        practiceSessionId: null,
        rating: 'helpful',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(feedback.recordCalls).toEqual([]);
  });

  it('rejects and records nothing when a standalone attempt is paired with an unrelated session', async () => {
    const { useCase, feedback } = makeUseCase({
      attempts: new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-1',
          userId,
          questionId: 'question-1',
          practiceSessionId: null,
        }),
      ]),
      sessions: new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-1',
          userId,
          questionIds: ['question-1'],
        }),
      ]),
    });

    await expect(
      useCase.execute({
        userId,
        questionId: 'question-1',
        attemptId: 'attempt-1',
        practiceSessionId: 'session-1',
        rating: 'helpful',
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Feedback attempt is not part of the supplied session',
      ),
    );
    expect(feedback.recordCalls).toEqual([]);
  });
});
