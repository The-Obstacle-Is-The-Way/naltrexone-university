// biome-ignore lint/style/noExcessiveLinesPerFile: Keep all FinalizeExamAnswersUseCase behavior (drafted grading, BUG-238 cumulative bounds, BUG-252 nullable drafts, BUG-254 expiry flush) in one file so the use-case contract stays auditable next to its shared fakes/helpers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  EXAM_SECONDS_PER_QUESTION,
  MS_PER_SECOND,
} from '@/src/domain/services';
import {
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import {
  computeFinalExamEndedAt,
  FINALIZE_FLUSH_DEADLINE_GRACE_MS,
  FinalizeExamAnswersUseCase,
  type FinalizeExamAnswersWriteTransaction,
} from './finalize-exam-answers';
import { projectPracticeSessionSummary } from './practice-session-summary';
import {
  SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS,
  SaveExamDraftAnswerUseCase,
} from './save-exam-draft-answer';

function passthroughTransaction(
  questions: FakeQuestionRepository,
  attempts: FakeAttemptRepository,
  sessions: FakePracticeSessionRepository,
): FinalizeExamAnswersWriteTransaction {
  return async (fn) =>
    fn({
      questions,
      attempts,
      sessions,
    });
}

function createFinalizeQuestion(
  questionId: string,
  correctChoiceId: string,
  incorrectChoiceId?: string,
  overrides: Partial<ReturnType<typeof createQuestion>> = {},
) {
  const wrongId = incorrectChoiceId ?? `${questionId}-wrong`;
  return createQuestion({
    id: questionId,
    slug: questionId,
    choices: [
      createChoice({
        id: correctChoiceId,
        questionId,
        label: 'A',
        sortOrder: 1,
        isCorrect: true,
      }),
      createChoice({
        id: wrongId,
        questionId,
        label: 'B',
        sortOrder: 2,
        isCorrect: false,
      }),
    ],
    ...overrides,
  });
}

describe('FinalizeExamAnswersUseCase', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('requires a writeTransaction dependency at compile time', () => {
    const questions = new FakeQuestionRepository([]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([]);

    // @ts-expect-error Finalize exam requires an explicit transaction boundary.
    void new FinalizeExamAnswersUseCase(questions, attempts, sessions);
  });

  it('finalizes drafted answers and records omitted exam questions as incorrect attempts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T12:30:00.000Z'));

    const questions = new FakeQuestionRepository([
      createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong'),
      createFinalizeQuestion('q2', 'q2-correct', 'q2-wrong'),
      createFinalizeQuestion('q3', 'q3-correct', 'q3-wrong'),
      createFinalizeQuestion('q4', 'q4-correct', 'q4-wrong'),
    ]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1', 'q2', 'q3', 'q4'],
        startedAt: new Date('2026-03-17T12:00:00.000Z'),
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: 'q1-correct',
            draftSavedAt: new Date('2026-03-17T12:05:00.000Z'),
            draftCumulativeMs: 30_000,
          },
          {
            questionId: 'q2',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: 'q2-wrong',
            draftSavedAt: new Date('2026-03-17T12:10:00.000Z'),
            draftCumulativeMs: 20_000,
          },
          {
            questionId: 'q3',
            markedForReview: true,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: 'q3-correct',
            draftSavedAt: new Date('2026-03-17T12:15:00.000Z'),
            draftCumulativeMs: 50_000,
          },
          {
            questionId: 'q4',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
        ],
      }),
    ]);
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      passthroughTransaction(questions, attempts, sessions),
    );
    const examDeadline = new Date(
      new Date('2026-03-17T12:00:00.000Z').getTime() +
        4 * EXAM_SECONDS_PER_QUESTION * MS_PER_SECOND,
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).resolves.toEqual({
      sessionId: 'session-1',
      mode: 'exam',
      questionCount: 4,
      endedAt: examDeadline.toISOString(),
      totals: {
        answered: 3,
        correct: 2,
        accuracy: 0.5,
        durationSeconds: 4 * EXAM_SECONDS_PER_QUESTION,
      },
    });

    await expect(
      attempts.findBySessionId('session-1', 'user-1'),
    ).resolves.toMatchObject([
      {
        questionId: 'q1',
        outcome: {
          kind: 'answered',
          selectedChoiceId: 'q1-correct',
        },
        isCorrect: true,
        timeSpentSeconds: 30,
      },
      {
        questionId: 'q2',
        outcome: {
          kind: 'answered',
          selectedChoiceId: 'q2-wrong',
        },
        isCorrect: false,
        timeSpentSeconds: 20,
      },
      {
        questionId: 'q3',
        outcome: {
          kind: 'answered',
          selectedChoiceId: 'q3-correct',
        },
        isCorrect: true,
        timeSpentSeconds: 50,
      },
      {
        questionId: 'q4',
        outcome: {
          kind: 'omitted',
        },
        isCorrect: false,
        timeSpentSeconds: 0,
      },
    ]);

    await expect(
      sessions.findByIdAndUserId('session-1', 'user-1'),
    ).resolves.toMatchObject({
      endedAt: examDeadline,
      questionStates: [
        {
          questionId: 'q1',
          latestSelectedChoiceId: 'q1-correct',
          latestIsCorrect: true,
          latestAnsweredAt: expect.any(Date),
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
        {
          questionId: 'q2',
          latestSelectedChoiceId: 'q2-wrong',
          latestIsCorrect: false,
          latestAnsweredAt: expect.any(Date),
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
        {
          questionId: 'q3',
          latestSelectedChoiceId: 'q3-correct',
          latestIsCorrect: true,
          latestAnsweredAt: expect.any(Date),
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
        {
          questionId: 'q4',
          latestSelectedChoiceId: null,
          latestIsCorrect: false,
          latestAnsweredAt: expect.any(Date),
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
      ],
    });
  });

  it('finalizes and grades a drafted session-owned question after it leaves the published set', async () => {
    const questions = new FakeQuestionRepository([
      createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong', {
        status: 'archived',
      }),
    ]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
        startedAt: new Date('2026-03-17T12:00:00.000Z'),
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: 'q1-correct',
            draftSavedAt: new Date('2026-03-17T12:00:30.000Z'),
            draftCumulativeMs: 30_000,
          },
        ],
      }),
    ]);
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      passthroughTransaction(questions, attempts, sessions),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).resolves.toMatchObject({
      sessionId: 'session-1',
      mode: 'exam',
      questionCount: 1,
      totals: {
        answered: 1,
        correct: 1,
      },
    });
    await expect(
      attempts.findBySessionId('session-1', 'user-1'),
    ).resolves.toMatchObject([
      {
        questionId: 'q1',
        outcome: {
          kind: 'answered',
          selectedChoiceId: 'q1-correct',
        },
        isCorrect: true,
      },
    ]);
  });

  it('finalizes an omitted session-owned question after it leaves the published set without fetching it for grading', async () => {
    const questions = new FakeQuestionRepository([
      createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong', {
        status: 'archived',
      }),
    ]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
        startedAt: new Date('2026-03-17T12:00:00.000Z'),
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 12_000,
          },
        ],
      }),
    ]);
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      passthroughTransaction(questions, attempts, sessions),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).resolves.toMatchObject({
      totals: { answered: 0, correct: 0 },
    });
    expect(questions.findByIdsForSessionCalls).toEqual([]);
    await expect(
      attempts.findBySessionId('session-1', 'user-1'),
    ).resolves.toMatchObject([
      {
        questionId: 'q1',
        outcome: { kind: 'omitted' },
        isCorrect: false,
        timeSpentSeconds: 12,
      },
    ]);
  });

  it('finalizes a saved time-only draft as an omitted attempt with the saved duration', async () => {
    const questions = new FakeQuestionRepository([
      createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong'),
    ]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
        startedAt: new Date('2026-03-17T12:00:00.000Z'),
      }),
    ]);
    const saveDraft = new SaveExamDraftAnswerUseCase(
      questions,
      sessions,
      () => new Date('2026-03-17T12:00:30.000Z'),
    );
    const finalize = new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      passthroughTransaction(questions, attempts, sessions),
    );

    await saveDraft.execute({
      userId: 'user-1',
      sessionId: 'session-1',
      questionId: 'q1',
      selectedChoiceId: null,
      cumulativeMs: 15_000,
    });

    await expect(
      finalize.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).resolves.toMatchObject({
      sessionId: 'session-1',
      mode: 'exam',
      questionCount: 1,
      totals: {
        answered: 0,
        correct: 0,
      },
    });

    await expect(
      attempts.findBySessionId('session-1', 'user-1'),
    ).resolves.toMatchObject([
      {
        questionId: 'q1',
        outcome: { kind: 'omitted' },
        isCorrect: false,
        timeSpentSeconds: 15,
      },
    ]);
  });

  it('does not treat a malformed empty draft choice id as an omitted answer', async () => {
    const questions = new FakeQuestionRepository([
      createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong'),
    ]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
        startedAt: new Date('2026-03-17T12:00:00.000Z'),
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: '',
            draftSavedAt: new Date('2026-03-17T12:05:00.000Z'),
            draftCumulativeMs: 30_000,
          },
        ],
      }),
    ]);
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      passthroughTransaction(questions, attempts, sessions),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).rejects.toMatchObject({
      name: 'DomainError',
      code: 'INVALID_CHOICE',
    });

    await expect(
      attempts.findBySessionId('session-1', 'user-1'),
    ).resolves.toEqual([]);
  });

  it('returns the shared practice-session summary projection', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T12:30:00.000Z'));

    const questions = new FakeQuestionRepository([
      createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong'),
    ]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
        startedAt: new Date('2026-03-17T12:00:00.000Z'),
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: 'q1-correct',
            draftSavedAt: new Date('2026-03-17T12:05:00.000Z'),
            draftCumulativeMs: 10_000,
          },
        ],
      }),
    ]);
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      passthroughTransaction(questions, attempts, sessions),
    );

    const output = await useCase.execute({
      userId: 'user-1',
      sessionId: 'session-1',
    });
    const endedSession = await sessions.findByIdAndUserId(
      'session-1',
      'user-1',
    );

    if (!endedSession?.endedAt) {
      throw new Error('Expected finalized exam session to have ended');
    }

    expect(output).toEqual(
      projectPracticeSessionSummary(endedSession, endedSession.endedAt),
    );
  });

  it('rejects already-ended sessions', async () => {
    const questions = new FakeQuestionRepository([]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
        endedAt: new Date('2026-03-17T12:00:00.000Z'),
      }),
    ]);
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      passthroughTransaction(questions, attempts, sessions),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).rejects.toEqual(
      new ApplicationError('CONFLICT', 'Cannot finalize a completed session'),
    );
  });

  it('rejects missing sessions', async () => {
    const questions = new FakeQuestionRepository([]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([]);
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      passthroughTransaction(questions, attempts, sessions),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'missing',
      }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );
  });

  it('rejects tutor sessions', async () => {
    const questions = new FakeQuestionRepository([]);
    const attempts = new FakeAttemptRepository();
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'tutor',
        questionIds: ['q1'],
      }),
    ]);
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      passthroughTransaction(questions, attempts, sessions),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Finalize exam is only available in exam mode',
      ),
    );
  });

  describe('exam end timestamp cap (BUG-255)', () => {
    const STARTED_AT = new Date('2026-03-17T12:00:00.000Z');
    const ONE_QUESTION_DEADLINE = new Date(
      STARTED_AT.getTime() + EXAM_SECONDS_PER_QUESTION * MS_PER_SECOND,
    );

    function createTimedExamUseCase(input: { now: Date }) {
      const questions = new FakeQuestionRepository([
        createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong'),
      ]);
      const attempts = new FakeAttemptRepository();
      const sessions = new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-1',
          userId: 'user-1',
          mode: 'exam',
          questionIds: ['q1'],
          startedAt: STARTED_AT,
          questionStates: [
            {
              questionId: 'q1',
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
              draftSelectedChoiceId: 'q1-correct',
              draftSavedAt: new Date(STARTED_AT.getTime() + 30_000),
              draftCumulativeMs: 30_000,
            },
          ],
        }),
      ]);
      const useCase = new FinalizeExamAnswersUseCase(
        questions,
        attempts,
        sessions,
        passthroughTransaction(questions, attempts, sessions),
        () => input.now,
      );

      return { attempts, sessions, useCase };
    }

    it('caps late exam finalization endedAt and duration at the server deadline', async () => {
      const { attempts, sessions, useCase } = createTimedExamUseCase({
        now: new Date('2026-03-17T12:05:00.000Z'),
      });

      const summary = await useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      });

      expect(summary).toMatchObject({
        endedAt: ONE_QUESTION_DEADLINE.toISOString(),
        totals: {
          durationSeconds: EXAM_SECONDS_PER_QUESTION,
        },
      });
      await expect(
        sessions.findByIdAndUserId('session-1', 'user-1'),
      ).resolves.toMatchObject({
        endedAt: ONE_QUESTION_DEADLINE,
      });
      await expect(
        attempts.findBySessionId('session-1', 'user-1'),
      ).resolves.toMatchObject([{ answeredAt: ONE_QUESTION_DEADLINE }]);
    });

    it('keeps early exam finalization endedAt at now', async () => {
      const earlyNow = new Date(STARTED_AT.getTime() + 30_000);
      const { sessions, useCase } = createTimedExamUseCase({ now: earlyNow });

      const summary = await useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      });

      expect(summary).toMatchObject({
        endedAt: earlyNow.toISOString(),
        totals: {
          durationSeconds: 30,
        },
      });
      await expect(
        sessions.findByIdAndUserId('session-1', 'user-1'),
      ).resolves.toMatchObject({ endedAt: earlyNow });
    });

    it('uses now when the exam deadline is unavailable', () => {
      const now = new Date('2026-03-17T12:05:00.000Z');

      expect(
        computeFinalExamEndedAt({
          now,
          deadline: null,
          latestAnsweredAt: null,
        }),
      ).toEqual(now);
    });

    it('does not cap below a BUG-254 grace-window attempt answered after the deadline', async () => {
      vi.useFakeTimers();
      const graceAnsweredAt = new Date(
        ONE_QUESTION_DEADLINE.getTime() + FINALIZE_FLUSH_DEADLINE_GRACE_MS,
      );
      vi.setSystemTime(graceAnsweredAt);
      const { attempts, sessions, useCase } = createTimedExamUseCase({
        now: graceAnsweredAt,
      });

      const summary = await useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        finalDraftAnswer: {
          questionId: 'q1',
          selectedChoiceId: 'q1-correct',
          cumulativeMs: 30_000,
        },
      });
      const [attempt] = await attempts.findBySessionId('session-1', 'user-1');

      expect(attempt?.answeredAt).toEqual(graceAnsweredAt);
      expect(summary.endedAt).toBe(graceAnsweredAt.toISOString());
      await expect(
        sessions.findByIdAndUserId('session-1', 'user-1'),
      ).resolves.toMatchObject({ endedAt: graceAnsweredAt });
    });
  });

  describe('finalDraftAnswer expiry flush (BUG-254)', () => {
    // A 1-question exam starting at 12:00:00 expires at +72s = 12:01:12.
    const STARTED_AT = new Date('2026-03-17T12:00:00.000Z');
    const DEADLINE_MS = STARTED_AT.getTime() + 72_000;

    function createFlushSession() {
      return createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
        startedAt: STARTED_AT,
      });
    }

    function createFlushUseCase(
      now: () => Date,
      question = createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong'),
    ) {
      const questions = new FakeQuestionRepository([question]);
      const attempts = new FakeAttemptRepository();
      const sessions = new FakePracticeSessionRepository([
        createFlushSession(),
      ]);
      const useCase = new FinalizeExamAnswersUseCase(
        questions,
        attempts,
        sessions,
        passthroughTransaction(questions, attempts, sessions),
        now,
      );
      return { questions, attempts, sessions, useCase };
    }

    it('grades a correct final flush selection applied at the deadline', async () => {
      const { attempts, useCase } = createFlushUseCase(
        () => new Date(DEADLINE_MS),
      );

      await expect(
        useCase.execute({
          userId: 'user-1',
          sessionId: 'session-1',
          finalDraftAnswer: {
            questionId: 'q1',
            selectedChoiceId: 'q1-correct',
            cumulativeMs: 30_000,
          },
        }),
      ).resolves.toMatchObject({
        mode: 'exam',
        questionCount: 1,
        totals: { answered: 1, correct: 1 },
      });

      await expect(
        attempts.findBySessionId('session-1', 'user-1'),
      ).resolves.toMatchObject([
        {
          questionId: 'q1',
          outcome: { kind: 'answered', selectedChoiceId: 'q1-correct' },
          isCorrect: true,
          timeSpentSeconds: 30,
        },
      ]);
    });

    it('grades a final flush selection for a session-owned question after it leaves the published set', async () => {
      const { attempts, useCase } = createFlushUseCase(
        () => new Date(DEADLINE_MS),
        createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong', {
          status: 'archived',
        }),
      );

      await expect(
        useCase.execute({
          userId: 'user-1',
          sessionId: 'session-1',
          finalDraftAnswer: {
            questionId: 'q1',
            selectedChoiceId: 'q1-correct',
            cumulativeMs: 30_000,
          },
        }),
      ).resolves.toMatchObject({
        totals: { answered: 1, correct: 1 },
      });
      await expect(
        attempts.findBySessionId('session-1', 'user-1'),
      ).resolves.toMatchObject([
        {
          questionId: 'q1',
          outcome: { kind: 'answered', selectedChoiceId: 'q1-correct' },
          isCorrect: true,
        },
      ]);
    });

    it('grades an incorrect final flush selection applied at the deadline', async () => {
      const { attempts, useCase } = createFlushUseCase(
        () => new Date(DEADLINE_MS),
      );

      await expect(
        useCase.execute({
          userId: 'user-1',
          sessionId: 'session-1',
          finalDraftAnswer: {
            questionId: 'q1',
            selectedChoiceId: 'q1-wrong',
            cumulativeMs: 5_000,
          },
        }),
      ).resolves.toMatchObject({
        totals: { answered: 1, correct: 0 },
      });

      await expect(
        attempts.findBySessionId('session-1', 'user-1'),
      ).resolves.toMatchObject([
        {
          questionId: 'q1',
          outcome: { kind: 'answered', selectedChoiceId: 'q1-wrong' },
          isCorrect: false,
          timeSpentSeconds: 5,
        },
      ]);
    });

    it('applies the flush within the deadline grace window', async () => {
      const { attempts, useCase } = createFlushUseCase(
        () => new Date(DEADLINE_MS + FINALIZE_FLUSH_DEADLINE_GRACE_MS),
      );

      await expect(
        useCase.execute({
          userId: 'user-1',
          sessionId: 'session-1',
          finalDraftAnswer: {
            questionId: 'q1',
            selectedChoiceId: 'q1-correct',
            cumulativeMs: 10_000,
          },
        }),
      ).resolves.toMatchObject({ totals: { answered: 1, correct: 1 } });

      await expect(
        attempts.findBySessionId('session-1', 'user-1'),
      ).resolves.toMatchObject([
        { outcome: { kind: 'answered', selectedChoiceId: 'q1-correct' } },
      ]);
    });

    it('rejects a flush before the deadline (ordinary save path still owns it)', async () => {
      const { attempts, useCase } = createFlushUseCase(
        () => new Date(DEADLINE_MS - 1_000),
      );

      await expect(
        useCase.execute({
          userId: 'user-1',
          sessionId: 'session-1',
          finalDraftAnswer: {
            questionId: 'q1',
            selectedChoiceId: 'q1-correct',
            cumulativeMs: 10_000,
          },
        }),
      ).rejects.toEqual(
        new ApplicationError(
          'CONFLICT',
          'Final exam answer flush is only allowed at exam expiry',
        ),
      );

      await expect(
        attempts.findBySessionId('session-1', 'user-1'),
      ).resolves.toEqual([]);
    });

    it('rejects a flush arriving after the grace window (arbitrary-late answering)', async () => {
      const { attempts, useCase } = createFlushUseCase(
        () => new Date(DEADLINE_MS + FINALIZE_FLUSH_DEADLINE_GRACE_MS + 1),
      );

      await expect(
        useCase.execute({
          userId: 'user-1',
          sessionId: 'session-1',
          finalDraftAnswer: {
            questionId: 'q1',
            selectedChoiceId: 'q1-correct',
            cumulativeMs: 10_000,
          },
        }),
      ).rejects.toEqual(
        new ApplicationError(
          'CONFLICT',
          'Final exam answer flush is only allowed at exam expiry',
        ),
      );

      await expect(
        attempts.findBySessionId('session-1', 'user-1'),
      ).resolves.toEqual([]);
    });

    it('rejects a flush for a question that is not in the session', async () => {
      const { attempts, useCase } = createFlushUseCase(
        () => new Date(DEADLINE_MS),
      );

      await expect(
        useCase.execute({
          userId: 'user-1',
          sessionId: 'session-1',
          finalDraftAnswer: {
            questionId: 'q-not-in-session',
            selectedChoiceId: 'q1-correct',
            cumulativeMs: 10_000,
          },
        }),
      ).rejects.toEqual(
        new ApplicationError(
          'NOT_FOUND',
          'Question is not part of this practice session',
        ),
      );

      await expect(
        attempts.findBySessionId('session-1', 'user-1'),
      ).resolves.toEqual([]);
    });

    it('rejects a flush whose selected choice does not belong to the question', async () => {
      const { attempts, useCase } = createFlushUseCase(
        () => new Date(DEADLINE_MS),
      );

      await expect(
        useCase.execute({
          userId: 'user-1',
          sessionId: 'session-1',
          finalDraftAnswer: {
            questionId: 'q1',
            selectedChoiceId: 'choice-from-another-question',
            cumulativeMs: 10_000,
          },
        }),
      ).rejects.toEqual(
        new ApplicationError(
          'VALIDATION_ERROR',
          'Selected choice does not belong to the question',
        ),
      );

      await expect(
        attempts.findBySessionId('session-1', 'user-1'),
      ).resolves.toEqual([]);
    });

    it('rejects a flush when the session belongs to another user', async () => {
      const { attempts, useCase } = createFlushUseCase(
        () => new Date(DEADLINE_MS),
      );

      await expect(
        useCase.execute({
          userId: 'other-user',
          sessionId: 'session-1',
          finalDraftAnswer: {
            questionId: 'q1',
            selectedChoiceId: 'q1-correct',
            cumulativeMs: 10_000,
          },
        }),
      ).rejects.toEqual(
        new ApplicationError('NOT_FOUND', 'Practice session not found'),
      );

      await expect(
        attempts.findBySessionId('session-1', 'other-user'),
      ).resolves.toEqual([]);
    });

    it('clamps an oversized flush cumulativeMs before writing timeSpentSeconds', async () => {
      const { attempts, useCase } = createFlushUseCase(
        () => new Date(DEADLINE_MS),
      );

      await useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        finalDraftAnswer: {
          questionId: 'q1',
          selectedChoiceId: 'q1-correct',
          cumulativeMs: Number.MAX_SAFE_INTEGER,
        },
      });

      await expect(
        attempts.findBySessionId('session-1', 'user-1'),
      ).resolves.toMatchObject([
        {
          questionId: 'q1',
          timeSpentSeconds: SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS / MS_PER_SECOND,
        },
      ]);
    });

    it('applies the flushed selection even when its cumulativeMs is below a persisted draft', async () => {
      // A prior time-only draft persisted 50s; the expiry flush carries a lower
      // cumulativeMs but a real selection. The selection must still be graded
      // and the persisted (higher) time must win, never dropping the answer.
      const questions = new FakeQuestionRepository([
        createFinalizeQuestion('q1', 'q1-correct', 'q1-wrong'),
      ]);
      const attempts = new FakeAttemptRepository();
      const sessions = new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-1',
          userId: 'user-1',
          mode: 'exam',
          questionIds: ['q1'],
          startedAt: STARTED_AT,
          questionStates: [
            {
              questionId: 'q1',
              markedForReview: false,
              latestSelectedChoiceId: null,
              latestIsCorrect: null,
              latestAnsweredAt: null,
              draftSelectedChoiceId: null,
              draftSavedAt: new Date(STARTED_AT.getTime() + 50_000),
              draftCumulativeMs: 50_000,
            },
          ],
        }),
      ]);
      const useCase = new FinalizeExamAnswersUseCase(
        questions,
        attempts,
        sessions,
        passthroughTransaction(questions, attempts, sessions),
        () => new Date(DEADLINE_MS),
      );

      await expect(
        useCase.execute({
          userId: 'user-1',
          sessionId: 'session-1',
          finalDraftAnswer: {
            questionId: 'q1',
            selectedChoiceId: 'q1-correct',
            cumulativeMs: 5_000,
          },
        }),
      ).resolves.toMatchObject({ totals: { answered: 1, correct: 1 } });

      await expect(
        attempts.findBySessionId('session-1', 'user-1'),
      ).resolves.toMatchObject([
        {
          questionId: 'q1',
          outcome: { kind: 'answered', selectedChoiceId: 'q1-correct' },
          isCorrect: true,
          timeSpentSeconds: 50,
        },
      ]);
    });

    it('grades a null final flush as an omitted attempt with the flushed duration', async () => {
      const { attempts, useCase } = createFlushUseCase(
        () => new Date(DEADLINE_MS),
      );

      await expect(
        useCase.execute({
          userId: 'user-1',
          sessionId: 'session-1',
          finalDraftAnswer: {
            questionId: 'q1',
            selectedChoiceId: null,
            cumulativeMs: 12_000,
          },
        }),
      ).resolves.toMatchObject({ totals: { answered: 0, correct: 0 } });

      await expect(
        attempts.findBySessionId('session-1', 'user-1'),
      ).resolves.toMatchObject([
        {
          questionId: 'q1',
          outcome: { kind: 'omitted' },
          isCorrect: false,
          timeSpentSeconds: 12,
        },
      ]);
    });

    it('is idempotent: a second finalize does not double-apply the flush', async () => {
      const { attempts, sessions, useCase } = createFlushUseCase(
        () => new Date(DEADLINE_MS),
      );

      await useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        finalDraftAnswer: {
          questionId: 'q1',
          selectedChoiceId: 'q1-correct',
          cumulativeMs: 10_000,
        },
      });

      // The session has ended; a re-finalize must be rejected, not re-graded.
      await expect(
        useCase.execute({
          userId: 'user-1',
          sessionId: 'session-1',
          finalDraftAnswer: {
            questionId: 'q1',
            selectedChoiceId: 'q1-wrong',
            cumulativeMs: 99_000,
          },
        }),
      ).rejects.toEqual(
        new ApplicationError('CONFLICT', 'Cannot finalize a completed session'),
      );

      const allAttempts = await attempts.findBySessionId('session-1', 'user-1');
      expect(allAttempts).toHaveLength(1);
      expect(allAttempts[0]).toMatchObject({
        outcome: { kind: 'answered', selectedChoiceId: 'q1-correct' },
        isCorrect: true,
      });

      const endedSession = await sessions.findByIdAndUserId(
        'session-1',
        'user-1',
      );
      expect(endedSession?.questionStates[0]).toMatchObject({
        latestSelectedChoiceId: 'q1-correct',
        latestIsCorrect: true,
        draftSelectedChoiceId: null,
      });
    });
  });
});
