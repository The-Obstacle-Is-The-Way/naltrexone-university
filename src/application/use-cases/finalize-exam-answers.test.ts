import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import { MS_PER_SECOND } from '@/src/domain/services';
import {
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import {
  FinalizeExamAnswersUseCase,
  type FinalizeExamAnswersWriteTransaction,
} from './finalize-exam-answers';
import { projectPracticeSessionSummary } from './practice-session-summary';
import { SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS } from './save-exam-draft-answer';

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

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
      }),
    ).resolves.toEqual({
      sessionId: 'session-1',
      mode: 'exam',
      questionCount: 4,
      endedAt: '2026-03-17T12:30:00.000Z',
      totals: {
        answered: 3,
        correct: 2,
        accuracy: 0.5,
        durationSeconds: 1800,
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
      endedAt: new Date('2026-03-17T12:30:00.000Z'),
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

  it('caps legacy oversized draftCumulativeMs before writing timeSpentSeconds', async () => {
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
            draftCumulativeMs: Number.MAX_SAFE_INTEGER,
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
        timeSpentSeconds: SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS / MS_PER_SECOND,
      },
    ]);
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
});
