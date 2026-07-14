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
  createQuestionRatingFeedback,
} from '@/src/domain/test-helpers';
import { SubmitQuestionReportUseCase } from './submit-question-report';

const userId = 'user-1';

function makeUseCase(input?: {
  questions?: FakeQuestionRepository;
  attempts?: FakeAttemptRepository;
  sessions?: FakePracticeSessionRepository;
}): {
  useCase: SubmitQuestionReportUseCase;
  feedback: FakeQuestionFeedbackRepository;
} {
  const feedback = new FakeQuestionFeedbackRepository();
  const useCase = new SubmitQuestionReportUseCase(
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

describe('SubmitQuestionReportUseCase', () => {
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
        category: 'incorrect_answer',
        comment: null,
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));
    expect(feedback.recordCalls).toEqual([]);
  });

  it('records a report event with validated context and returns its feedback id', async () => {
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

    const result = await useCase.execute({
      userId,
      questionId: 'question-1',
      attemptId: 'attempt-1',
      practiceSessionId: 'session-1',
      category: 'ambiguous_wording',
      comment: 'Two answers could be correct.',
    });

    expect(result.feedbackId).toEqual(expect.any(String));
    expect(feedback.recordCalls).toEqual([
      {
        userId,
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

  it('records a report with null context (best-effort)', async () => {
    const { useCase, feedback } = makeUseCase();

    const result = await useCase.execute({
      userId,
      questionId: 'question-1',
      attemptId: null,
      practiceSessionId: null,
      category: 'incorrect_answer',
      comment: null,
    });

    expect(result.feedbackId).toEqual(expect.any(String));
    expect(feedback.recordCalls).toEqual([
      {
        userId,
        questionId: 'question-1',
        attemptId: null,
        practiceSessionId: null,
        kind: 'report',
        rating: null,
        category: 'incorrect_answer',
        comment: null,
      },
    ]);
  });

  it('returns the original feedback id when a request idempotency key is replayed', async () => {
    const { useCase, feedback } = makeUseCase();
    const baseInput = {
      userId,
      questionId: 'question-1',
      attemptId: null,
      practiceSessionId: null,
      category: 'incorrect_answer' as const,
      idempotencyKey: 'request-1',
    };

    const first = await useCase.execute({ ...baseInput, comment: 'First' });
    const replay = await useCase.execute({ ...baseInput, comment: 'First' });

    expect(replay).toEqual(first);
    expect(feedback.getAll()).toEqual([
      expect.objectContaining({
        id: first.feedbackId,
        kind: 'report',
        comment: 'First',
      }),
    ]);
  });

  it('throws INTERNAL_ERROR when a replay returns a non-report row', async () => {
    const { useCase, feedback } = makeUseCase();
    // Defense-in-depth behind the repository's replay guard: a store that
    // hands back the wrong kind must not surface its id as a report.
    const ratingRow = createQuestionRatingFeedback({
      userId,
      questionId: 'question-1',
    });
    feedback.record = async () => ratingRow;

    await expect(
      useCase.execute({
        userId,
        questionId: 'question-1',
        attemptId: null,
        practiceSessionId: null,
        category: 'incorrect_answer',
        comment: 'First',
        idempotencyKey: 'request-1',
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Invalid report replay',
    });
  });

  it('rejects a replayed request idempotency key carrying an edited report', async () => {
    const { useCase } = makeUseCase();
    const baseInput = {
      userId,
      questionId: 'question-1',
      attemptId: null,
      practiceSessionId: null,
      category: 'incorrect_answer' as const,
      idempotencyKey: 'request-1',
    };

    await useCase.execute({ ...baseInput, comment: 'First' });

    // The edited report must surface a typed conflict, not silently return
    // the original submission's id as success.
    await expect(
      useCase.execute({ ...baseInput, comment: 'Changed' }),
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
        category: 'incorrect_answer',
        comment: null,
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
        category: 'incorrect_answer',
        comment: null,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
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
        category: 'incorrect_answer',
        comment: null,
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
