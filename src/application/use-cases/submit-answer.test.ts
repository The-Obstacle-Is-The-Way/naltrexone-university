import { describe, expect, it } from 'vitest';
import { createQuestionSeed, shuffleWithSeed } from '@/src/domain/services';
import {
  createAttempt,
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import { AllChoiceLabels } from '@/src/domain/value-objects';
import { ApplicationError } from '../errors';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { SubmitAnswerUseCase } from './submit-answer';

class FailingRecordSessionRepository extends FakePracticeSessionRepository {
  async recordQuestionAnswer(): Promise<never> {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      'Failed to persist practice session answer state',
    );
  }
}

class DeleteTrackingAttemptRepository extends FakeAttemptRepository {
  deleteCallCount = 0;

  override async deleteById(): Promise<boolean> {
    this.deleteCallCount += 1;
    throw new Error('Failed to delete attempt');
  }
}

class ThrowingInfoLogger extends FakeLogger {
  infoCallCount = 0;

  override info(_context: Record<string, unknown>, _msg: string): void {
    this.infoCallCount += 1;
    throw new Error('logger info failed');
  }
}

describe('SubmitAnswerUseCase', () => {
  describe('retry provenance', () => {
    it('emits retry_submitted telemetry for retry attempts', async () => {
      const userId = 'user-1';
      const questionId = 'q1';
      const parentAttemptId = 'attempt-parent';
      const logger = new FakeLogger();

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const attempts = new FakeAttemptRepository([
        createAttempt({
          id: parentAttemptId,
          userId,
          questionId,
          selectedChoiceId: 'c1',
          isCorrect: false,
        }),
      ]);

      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        attempts,
        new FakePracticeSessionRepository(),
        logger,
      );

      await useCase.execute({
        userId,
        questionId,
        choiceId: 'c2',
        retryOfAttemptId: parentAttemptId,
        retryOrigin: 'history',
      });

      expect(logger.infoCalls).toContainEqual({
        context: {
          event: 'retry_submitted',
          retryOrigin: 'history',
          isCorrect: true,
          hasParent: true,
          hasRetrySessionId: false,
        },
        msg: 'Retry submitted',
      });
    });

    it('does not emit retry_submitted telemetry for non-retry submissions', async () => {
      const userId = 'user-1';
      const questionId = 'q1';
      const logger = new FakeLogger();

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        new FakeAttemptRepository(),
        new FakePracticeSessionRepository(),
        logger,
      );

      await useCase.execute({
        userId,
        questionId,
        choiceId: 'c2',
      });

      expect(
        logger.infoCalls.some(
          ({ context }) => context.event === 'retry_submitted',
        ),
      ).toBe(false);
    });

    it('does not call retry telemetry logging for non-retry submissions when info logger throws', async () => {
      const userId = 'user-1';
      const questionId = 'q1';
      const logger = new ThrowingInfoLogger();

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        new FakeAttemptRepository(),
        new FakePracticeSessionRepository(),
        logger,
      );

      const output = await useCase.execute({
        userId,
        questionId,
        choiceId: 'c2',
      });

      expect(output.isCorrect).toBe(true);
      expect(logger.infoCallCount).toBe(0);
    });

    it('does not fail retry submissions when retry telemetry logging throws', async () => {
      const userId = 'user-1';
      const questionId = 'q1';
      const parentAttemptId = 'attempt-parent';
      const logger = new ThrowingInfoLogger();

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const attempts = new FakeAttemptRepository([
        createAttempt({
          id: parentAttemptId,
          userId,
          questionId,
          selectedChoiceId: 'c1',
          isCorrect: false,
        }),
      ]);

      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        attempts,
        new FakePracticeSessionRepository(),
        logger,
      );

      const output = await useCase.execute({
        userId,
        questionId,
        choiceId: 'c2',
        retryOfAttemptId: parentAttemptId,
        retryOrigin: 'history',
      });

      expect(output).toMatchObject({
        isCorrect: true,
      });
      expect(logger.infoCallCount).toBe(1);
      expect(attempts.getAll()).toHaveLength(2);
    });

    it('rejects retry submissions that include sessionId', async () => {
      const userId = 'user-1';
      const questionId = 'q1';
      const sessionId = 'session-1';
      const parentAttemptId = 'attempt-parent';

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const attempts = new FakeAttemptRepository([
        createAttempt({
          id: parentAttemptId,
          userId,
          questionId,
          selectedChoiceId: 'c1',
          isCorrect: false,
          practiceSessionId: sessionId,
        }),
      ]);

      const sessions = new FakePracticeSessionRepository([
        createPracticeSession({
          id: sessionId,
          userId,
          questionIds: [questionId],
        }),
      ]);

      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        attempts,
        sessions,
        new FakeLogger(),
      );

      await expect(
        useCase.execute({
          userId,
          questionId,
          choiceId: 'c2',
          sessionId,
          retryOfAttemptId: parentAttemptId,
          retryOrigin: 'history',
        }),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Retry submissions must not include sessionId',
      });
    });

    it('stores retry provenance on standalone retry attempts', async () => {
      const userId = 'user-1';
      const questionId = 'q1';
      const parentAttemptId = 'attempt-parent';
      const retrySessionId = 'session-1';

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const attempts = new FakeAttemptRepository([
        createAttempt({
          id: parentAttemptId,
          userId,
          questionId,
          selectedChoiceId: 'c1',
          isCorrect: false,
          practiceSessionId: retrySessionId,
        }),
      ]);

      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        attempts,
        new FakePracticeSessionRepository(),
        new FakeLogger(),
      );

      await useCase.execute({
        userId,
        questionId,
        choiceId: 'c2',
        retryOfAttemptId: parentAttemptId,
        retryOrigin: 'history',
      });

      const inserted = attempts.getAll().find((a) => a.id !== parentAttemptId);
      expect(inserted).toMatchObject({
        practiceSessionId: null,
        retryOfAttemptId: parentAttemptId,
        retryOrigin: 'history',
        retrySessionId: null,
      });
    });

    it('allows session_review retries without a parent attempt id for session unanswered reveals', async () => {
      const userId = 'user-1';
      const questionId = 'q1';
      const retrySessionId = 'session-review-1';

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const attempts = new FakeAttemptRepository();
      const sessions = new FakePracticeSessionRepository([
        createPracticeSession({
          id: retrySessionId,
          userId,
          questionIds: [questionId],
          endedAt: new Date('2026-02-01T00:00:00Z'),
        }),
      ]);
      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        attempts,
        sessions,
        new FakeLogger(),
      );

      await useCase.execute({
        userId,
        questionId,
        choiceId: 'c2',
        retryOrigin: 'session_review',
        retrySessionId,
      });

      expect(attempts.getAll()[0]).toMatchObject({
        retryOfAttemptId: null,
        retryOrigin: 'session_review',
        retrySessionId: 'session-review-1',
      });
    });

    it('throws CONFLICT when session_review retrySessionId points to an active exam session', async () => {
      const userId = 'user-1';
      const questionId = 'q1';
      const retrySessionId = 'session-review-active';

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const sessions = new FakePracticeSessionRepository([
        createPracticeSession({
          id: retrySessionId,
          userId,
          mode: 'exam',
          questionIds: [questionId],
          endedAt: null,
        }),
      ]);

      const attempts = new FakeAttemptRepository();
      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        attempts,
        sessions,
        new FakeLogger(),
      );

      await expect(
        useCase.execute({
          userId,
          questionId,
          choiceId: 'c2',
          retryOrigin: 'session_review',
          retrySessionId,
        }),
      ).rejects.toEqual(
        new ApplicationError('CONFLICT', 'Cannot retry from an active session'),
      );
      expect(attempts.getAll()).toHaveLength(0);
    });

    it('throws CONFLICT when session_review retrySessionId points to an active tutor session', async () => {
      const userId = 'user-1';
      const questionId = 'q1';
      const retrySessionId = 'session-review-active-tutor';

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const sessions = new FakePracticeSessionRepository([
        createPracticeSession({
          id: retrySessionId,
          userId,
          mode: 'tutor',
          questionIds: [questionId],
          endedAt: null,
        }),
      ]);

      const attempts = new FakeAttemptRepository();
      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        attempts,
        sessions,
        new FakeLogger(),
      );

      await expect(
        useCase.execute({
          userId,
          questionId,
          choiceId: 'c2',
          retryOrigin: 'session_review',
          retrySessionId,
        }),
      ).rejects.toEqual(
        new ApplicationError('CONFLICT', 'Cannot retry from an active session'),
      );
      expect(attempts.getAll()).toHaveLength(0);
    });

    it('throws NOT_FOUND when session_review retrySessionId does not belong to the submitting user', async () => {
      const userId = 'user-1';
      const questionId = 'q1';
      const retrySessionId = 'session-review-1';

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const sessions = new FakePracticeSessionRepository([
        createPracticeSession({
          id: retrySessionId,
          userId: 'other-user',
          questionIds: [questionId],
          endedAt: new Date('2026-02-01T00:00:00Z'),
        }),
      ]);

      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        new FakeAttemptRepository(),
        sessions,
        new FakeLogger(),
      );

      await expect(
        useCase.execute({
          userId,
          questionId,
          choiceId: 'c2',
          retryOrigin: 'session_review',
          retrySessionId,
        }),
      ).rejects.toEqual(
        new ApplicationError('NOT_FOUND', 'Retry session not found'),
      );
    });

    it('throws NOT_FOUND when session_review retrySessionId does not include the requested question', async () => {
      const userId = 'user-1';
      const questionId = 'q1';
      const retrySessionId = 'session-review-1';

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const sessions = new FakePracticeSessionRepository([
        createPracticeSession({
          id: retrySessionId,
          userId,
          questionIds: ['other-question-id'],
          endedAt: new Date('2026-02-01T00:00:00Z'),
        }),
      ]);

      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        new FakeAttemptRepository(),
        sessions,
        new FakeLogger(),
      );

      await expect(
        useCase.execute({
          userId,
          questionId,
          choiceId: 'c2',
          retryOrigin: 'session_review',
          retrySessionId,
        }),
      ).rejects.toEqual(
        new ApplicationError(
          'NOT_FOUND',
          'Retry session does not include the requested question',
        ),
      );
    });

    it('throws NOT_FOUND when retry parent attempt is missing', async () => {
      const userId = 'user-1';
      const questionId = 'q1';

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        new FakeAttemptRepository(),
        new FakePracticeSessionRepository(),
        new FakeLogger(),
      );

      await expect(
        useCase.execute({
          userId,
          questionId,
          choiceId: 'c2',
          retryOfAttemptId: 'attempt-missing',
          retryOrigin: 'history',
        }),
      ).rejects.toEqual(
        new ApplicationError('NOT_FOUND', 'Retry parent attempt not found'),
      );
    });

    it('throws NOT_FOUND when retry parent attempt belongs to another question', async () => {
      const userId = 'user-1';
      const questionId = 'q1';

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const attempts = new FakeAttemptRepository([
        createAttempt({
          id: 'attempt-parent',
          userId,
          questionId: 'q2',
          selectedChoiceId: 'choice-q2',
          isCorrect: false,
        }),
      ]);

      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        attempts,
        new FakePracticeSessionRepository(),
        new FakeLogger(),
      );

      await expect(
        useCase.execute({
          userId,
          questionId,
          choiceId: 'c2',
          retryOfAttemptId: 'attempt-parent',
          retryOrigin: 'history',
        }),
      ).rejects.toEqual(
        new ApplicationError(
          'NOT_FOUND',
          'Retry parent attempt does not belong to the requested question',
        ),
      );
    });

    it('throws VALIDATION_ERROR when retrySessionId is provided for non-session_review origins', async () => {
      const userId = 'user-1';
      const questionId = 'q1';
      const parentAttemptId = 'attempt-parent';

      const question = createQuestion({
        id: questionId,
        status: 'published',
        choices: [
          createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
          createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
        ],
      });

      const attempts = new FakeAttemptRepository([
        createAttempt({
          id: parentAttemptId,
          userId,
          questionId,
          selectedChoiceId: 'c1',
          isCorrect: false,
        }),
      ]);

      const useCase = new SubmitAnswerUseCase(
        new FakeQuestionRepository([question]),
        attempts,
        new FakePracticeSessionRepository(),
        new FakeLogger(),
      );

      await expect(
        useCase.execute({
          userId,
          questionId,
          choiceId: 'c2',
          retryOfAttemptId: parentAttemptId,
          retryOrigin: 'history',
          retrySessionId: 'session-1',
        }),
      ).rejects.toEqual(
        new ApplicationError(
          'VALIDATION_ERROR',
          'Invalid retry provenance metadata',
        ),
      );
    });
  });

  it('returns choice explanations in deterministic display order', async () => {
    const userId = 'user-1';
    const questionId = 'q1';
    const choices = [
      createChoice({
        id: 'c1',
        questionId,
        label: 'A',
        textMd: 'Choice A',
        isCorrect: false,
        explanationMd: 'Why A is wrong',
        sortOrder: 1,
      }),
      createChoice({
        id: 'c2',
        questionId,
        label: 'B',
        textMd: 'Choice B',
        isCorrect: true,
        explanationMd: 'Why B is correct',
        sortOrder: 2,
      }),
      createChoice({
        id: 'c3',
        questionId,
        label: 'C',
        textMd: 'Choice C',
        isCorrect: false,
        explanationMd: 'Why C is wrong',
        sortOrder: 3,
      }),
      createChoice({
        id: 'c4',
        questionId,
        label: 'D',
        textMd: 'Choice D',
        isCorrect: false,
        explanationMd: 'Why D is wrong',
        sortOrder: 4,
      }),
    ];

    const question = createQuestion({
      id: questionId,
      status: 'published',
      explanationMd: 'General explanation',
      choices,
    });

    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      new FakeAttemptRepository(),
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    const result = await useCase.execute({
      userId,
      questionId,
      choiceId: 'c2',
    });

    const stableInput = choices.slice().sort((a, b) => {
      const bySortOrder = a.sortOrder - b.sortOrder;
      if (bySortOrder !== 0) return bySortOrder;
      return a.id.localeCompare(b.id);
    });
    const shuffled = shuffleWithSeed(
      stableInput,
      createQuestionSeed(userId, questionId),
    );

    expect(result.choiceExplanations.map((choice) => choice.choiceId)).toEqual(
      shuffled.map((choice) => choice.id),
    );
    expect(
      result.choiceExplanations.map((choice) => choice.displayLabel),
    ).toEqual(shuffled.map((_, index) => AllChoiceLabels[index]));
    expect(
      result.choiceExplanations.map((choice) => choice.explanationMd),
    ).toEqual(shuffled.map((choice) => choice.explanationMd));
  });

  it('inserts an attempt and returns explanation when not in an exam session', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      explanationMd: 'Because.',
      referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const questions = new FakeQuestionRepository([question]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository();
    const useCase = new SubmitAnswerUseCase(
      questions,
      attempts,
      sessions,
      new FakeLogger(),
    );

    const result = await useCase.execute({
      userId,
      questionId,
      choiceId: 'c2',
    });

    expect(result.isCorrect).toBe(true);
    expect(result.correctChoiceId).toBe('c2');
    expect(result.explanationMd).toBe('Because.');
    expect(result.referenceMd).toBe(
      'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
    );
    expect(result.choiceExplanations).toHaveLength(2);

    const inserted = attempts.getAll();
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.practiceSessionId).toBeNull();
    expect(inserted[0]?.timeSpentSeconds).toBe(0);
  });

  it('stores timeSpentSeconds from input', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
      timeSpentSeconds: 42,
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(42);
  });

  it('caps timeSpentSeconds at 86_400 seconds (24h)', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
      timeSpentSeconds: 999_999,
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(86_400);
  });

  it('clamps negative timeSpentSeconds to 0', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
      timeSpentSeconds: -5,
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(0);
  });

  it('defaults timeSpentSeconds to 0 when NaN', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
      timeSpentSeconds: Number.NaN,
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(0);
  });

  it('defaults timeSpentSeconds to 0 when Infinity', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
      timeSpentSeconds: Number.POSITIVE_INFINITY,
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(0);
  });

  it('defaults timeSpentSeconds to 0 when -Infinity', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
      timeSpentSeconds: Number.NEGATIVE_INFINITY,
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(0);
  });

  it('defaults timeSpentSeconds to 0 when not provided', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
    });

    expect(attempts.getAll()[0]?.timeSpentSeconds).toBe(0);
  });

  it('returns isCorrect=false when an incorrect choice is selected', async () => {
    const userId = 'user-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      explanationMd: 'Because.',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    const result = await useCase.execute({
      userId,
      questionId,
      choiceId: 'c1',
    });

    expect(result.isCorrect).toBe(false);
    expect(result.correctChoiceId).toBe('c2');

    expect(attempts.getAll()[0]?.isCorrect).toBe(false);
  });

  it('returns null explanation for active exam session', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      explanationMd: 'Because.',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: null,
      questionIds: [questionId],
    });

    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      new FakeAttemptRepository(),
      new FakePracticeSessionRepository([session]),
      new FakeLogger(),
    );

    const result = await useCase.execute({
      userId,
      questionId,
      choiceId: 'c2',
      sessionId,
    });

    expect(result.isCorrect).toBeNull();
    expect(result.correctChoiceId).toBeNull();
    expect(result.explanationMd).toBeNull();
    expect(result.referenceMd).toBeNull();
    expect(result.choiceExplanations).toEqual([]);
  });

  it('updates the persisted session question state with the latest answer', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';

    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: null,
      questionIds: [questionId],
    });

    const sessions = new FakePracticeSessionRepository([session]);
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      new FakeAttemptRepository(),
      sessions,
      new FakeLogger(),
    );

    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c2',
      sessionId,
    });

    const updated = await sessions.findByIdAndUserId(sessionId, userId);
    expect(updated?.questionStates).toEqual([
      {
        questionId,
        markedForReview: false,
        latestSelectedChoiceId: 'c2',
        latestIsCorrect: true,
        latestAnsweredAt: expect.any(Date),
      },
    ]);
  });

  it('rolls back inserted attempt when session state persistence fails', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';

    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: null,
      questionIds: [questionId],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FailingRecordSessionRepository([session]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId,
        questionId,
        choiceId: 'c2',
        sessionId,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to persist practice session answer state',
      ),
    );

    expect(attempts.getAll()).toEqual([]);
  });

  it('uses transaction rollback instead of compensating delete when session persistence fails', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';

    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: null,
      questionIds: [questionId],
    });

    const attempts = new FakeAttemptRepository();
    const txAttempts = new DeleteTrackingAttemptRepository();
    const logger = new FakeLogger();
    const transaction = async <T>(
      fn: (tx: {
        attempts: FakeAttemptRepository;
        sessions: FakePracticeSessionRepository;
      }) => Promise<T>,
    ): Promise<T> =>
      fn({
        attempts: txAttempts,
        sessions: new FailingRecordSessionRepository([session]),
      });

    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository([session]),
      logger,
      transaction,
    );

    await expect(
      useCase.execute({
        userId,
        questionId,
        choiceId: 'c2',
        sessionId,
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    expect(attempts.getAll()).toEqual([]);
    expect(txAttempts.deleteCallCount).toBe(0);
    expect(logger.errorCalls).toHaveLength(0);
  });

  it('throws CONFLICT when submitting to an ended session', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const questionId = 'q1';
    const question = createQuestion({
      id: questionId,
      status: 'published',
      explanationMd: 'Because.',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: new Date('2026-01-31T00:00:00Z'),
      questionIds: [questionId],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository([session]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId,
        questionId,
        choiceId: 'c2',
        sessionId,
      }),
    ).rejects.toEqual(
      new ApplicationError('CONFLICT', 'Practice session already ended'),
    );

    expect(attempts.getAll()).toEqual([]);
  });

  it('throws NOT_FOUND when question is not published', async () => {
    const attempts = new FakeAttemptRepository();

    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([
        createQuestion({
          id: 'q1',
          status: 'draft',
          choices: [createChoice({ id: 'c1', questionId: 'q1', label: 'A' })],
        }),
      ]),
      attempts,
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        choiceId: 'c1',
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));

    expect(attempts.getAll()).toHaveLength(0);
  });

  it('throws NOT_FOUND when question is missing', async () => {
    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([]),
      attempts,
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'missing',
        choiceId: 'c1',
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Question not found'));

    expect(attempts.getAll()).toHaveLength(0);
  });

  it('throws NOT_FOUND when choice does not belong to question', async () => {
    const attempts = new FakeAttemptRepository();
    const question = createQuestion({
      id: 'q1',
      status: 'published',
      choices: [createChoice({ id: 'c1', questionId: 'q1', label: 'A' })],
    });

    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        choiceId: 'missing',
      }),
    ).rejects.toEqual(new ApplicationError('NOT_FOUND', 'Choice not found'));

    expect(attempts.getAll()).toHaveLength(0);
  });

  it('throws NOT_FOUND when session is missing', async () => {
    const question = createQuestion({
      id: 'q1',
      status: 'published',
      choices: [
        createChoice({
          id: 'c1',
          questionId: 'q1',
          label: 'A',
          isCorrect: true,
        }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository(),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        questionId: 'q1',
        choiceId: 'c1',
        sessionId: 'missing',
      }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );

    expect(attempts.getAll()).toHaveLength(0);
  });

  it('throws NOT_FOUND when session belongs to another user', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';

    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({
          id: 'c1',
          questionId,
          label: 'A',
          isCorrect: true,
        }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId: 'user-2',
      mode: 'tutor',
      questionIds: [questionId],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository([session]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId,
        questionId,
        choiceId: 'c1',
        sessionId,
      }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );

    expect(attempts.getAll()).toHaveLength(0);
  });

  it('throws CONFLICT when the same question is submitted twice in the same session', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';

    const question = createQuestion({
      id: questionId,
      status: 'published',
      choices: [
        createChoice({ id: 'c1', questionId, label: 'A', isCorrect: false }),
        createChoice({ id: 'c2', questionId, label: 'B', isCorrect: true }),
      ],
    });

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'tutor',
      endedAt: null,
      questionIds: [questionId],
    });

    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([session]);
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      sessions,
      new FakeLogger(),
    );

    // First submission succeeds
    await useCase.execute({
      userId,
      questionId,
      choiceId: 'c2',
      sessionId,
    });

    // Second submission to the same question in the same session should fail
    await expect(
      useCase.execute({
        userId,
        questionId,
        choiceId: 'c1',
        sessionId,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'CONFLICT',
        'This question has already been answered in this session',
      ),
    );

    // Only one attempt should exist
    expect(attempts.getAll()).toHaveLength(1);
  });

  it('throws NOT_FOUND when session exists but question is not part of the session', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      endedAt: new Date('2026-02-07T00:00:00Z'),
      questionIds: ['q1'],
    });

    const question = createQuestion({
      id: 'q2',
      status: 'published',
      choices: [
        createChoice({
          id: 'c2',
          questionId: 'q2',
          label: 'A',
          isCorrect: true,
        }),
      ],
    });

    const attempts = new FakeAttemptRepository();
    const useCase = new SubmitAnswerUseCase(
      new FakeQuestionRepository([question]),
      attempts,
      new FakePracticeSessionRepository([session]),
      new FakeLogger(),
    );

    await expect(
      useCase.execute({
        userId,
        questionId: 'q2',
        choiceId: 'c2',
        sessionId,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'NOT_FOUND',
        'Question is not part of this practice session',
      ),
    );

    expect(attempts.getAll()).toHaveLength(0);
  });
});
