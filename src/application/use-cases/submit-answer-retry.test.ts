import { describe, expect, it } from 'vitest';
import {
  ApplicationError,
  createAttempt,
  createChoice,
  createPracticeSession,
  createQuestion,
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
  SubmitAnswerUseCase,
  ThrowingInfoLogger,
} from './submit-answer-test-helpers';

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
});
