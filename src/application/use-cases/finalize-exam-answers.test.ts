import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createFinalizeQuestion,
  passthroughTransaction,
} from '@/src/application/test-helpers/finalize-exam-fixtures';
import {
  EXAM_SECONDS_PER_QUESTION,
  MS_PER_SECOND,
} from '@/src/domain/services';
import { createPracticeSession } from '@/src/domain/test-helpers';
import {
  FinalizeExamAnswersUseCase,
  type FinalizeExamAnswersWriteTransaction,
} from './finalize-exam-answers';
import { projectPracticeSessionSummary } from './practice-session-summary';
import { SaveExamDraftAnswerUseCase } from './save-exam-draft-answer';

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

  it('uses one finalization timestamp when the write transaction replays the callback', async () => {
    const requestNow = new Date('2026-03-17T12:00:10.000Z');
    const retryNow = new Date('2026-03-17T12:00:20.000Z');
    const now = vi
      .fn()
      .mockReturnValueOnce(requestNow)
      .mockReturnValue(retryNow);
    const createSession = () =>
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
        startedAt: new Date('2026-03-17T12:00:00.000Z'),
      });
    const questions = new FakeQuestionRepository([
      createFinalizeQuestion('q1', 'q1-correct'),
    ]);
    const initialSessions = new FakePracticeSessionRepository([
      createSession(),
    ]);
    const firstTxSessions = new FakePracticeSessionRepository([
      createSession(),
    ]);
    const secondTxSessions = new FakePracticeSessionRepository([
      createSession(),
    ]);
    const writeTransaction: FinalizeExamAnswersWriteTransaction = async (
      fn,
    ) => {
      await fn({
        questions,
        attempts: new FakeAttemptRepository(),
        sessions: firstTxSessions,
      });
      return fn({
        questions,
        attempts: new FakeAttemptRepository(),
        sessions: secondTxSessions,
      });
    };
    const useCase = new FinalizeExamAnswersUseCase(
      questions,
      new FakeAttemptRepository(),
      initialSessions,
      writeTransaction,
      now,
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).resolves.toMatchObject({
      endedAt: requestNow.toISOString(),
    });

    expect(now).toHaveBeenCalledTimes(1);
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
});
