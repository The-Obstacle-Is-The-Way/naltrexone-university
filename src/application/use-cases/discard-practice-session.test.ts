import { describe, expect, it } from 'vitest';
import {
  FakeAttemptRepository,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createChoice,
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import { DiscardPracticeSessionUseCase } from './discard-practice-session';
import { GetCompletedSessionQuestionsWithFeedbackUseCase } from './get-completed-session-questions-with-feedback';
import { GetSessionHistoryUseCase } from './get-session-history';
import { StartPracticeSessionUseCase } from './start-practice-session';

function createDiscardPracticeSessionUseCase(
  sessions: FakePracticeSessionRepository,
): DiscardPracticeSessionUseCase {
  return new DiscardPracticeSessionUseCase(async (fn) => fn(sessions));
}

describe('DiscardPracticeSessionUseCase', () => {
  it('removes the caller incomplete session and makes it non-reviewable', async () => {
    const userId = 'user-1';
    const sessionId = 'session-exam';
    const question = createQuestion({
      id: 'question-1',
      slug: 'question-1',
      choices: [
        createChoice({
          id: 'choice-1',
          questionId: 'question-1',
          isCorrect: true,
        }),
      ],
    });
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: sessionId,
        userId,
        mode: 'exam',
        questionIds: ['question-1'],
        questionStates: [
          {
            questionId: 'question-1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: 'choice-1',
            draftSavedAt: new Date('2026-02-01T00:01:00.000Z'),
            draftCumulativeMs: 15_000,
          },
        ],
        endedAt: null,
      }),
    ]);

    await createDiscardPracticeSessionUseCase(sessions).execute({
      userId,
      sessionId,
    });

    await expect(
      sessions.findByIdAndUserId(sessionId, userId),
    ).resolves.toBeNull();
    await expect(
      sessions.findCompletedByUserId(userId, 10, 0, 'exam'),
    ).resolves.toEqual({ rows: [], total: 0 });

    const history = new GetSessionHistoryUseCase(
      sessions,
      new FakeQuestionRepository([question]),
    );
    await expect(
      history.execute({ userId, limit: 10, offset: 0, mode: 'exam' }),
    ).resolves.toMatchObject({ rows: [], total: 0 });

    const feedback = new GetCompletedSessionQuestionsWithFeedbackUseCase(
      sessions,
      new FakeQuestionRepository([question]),
      new FakeAttemptRepository([]),
      new FakeLogger(),
    );
    await expect(feedback.execute({ userId, sessionId })).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
      },
    );
  });

  it('is idempotent when the session is missing or already discarded', async () => {
    const sessions = new FakePracticeSessionRepository([]);
    const useCase = createDiscardPracticeSessionUseCase(sessions);

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'missing' }),
    ).resolves.toEqual({ discarded: true });
    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'missing' }),
    ).resolves.toEqual({ discarded: true });
  });

  it('does not discard another user session', async () => {
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'owner-user',
      mode: 'exam',
      endedAt: null,
    });
    const sessions = new FakePracticeSessionRepository([session]);

    await createDiscardPracticeSessionUseCase(sessions).execute({
      userId: 'other-user',
      sessionId: 'session-1',
    });

    await expect(
      sessions.findByIdAndUserId('session-1', 'owner-user'),
    ).resolves.toMatchObject({ id: 'session-1' });
  });

  it('does not discard completed sessions', async () => {
    const endedAt = new Date('2026-02-01T00:10:00.000Z');
    const session = createPracticeSession({
      id: 'session-ended',
      userId: 'user-1',
      mode: 'exam',
      endedAt,
    });
    const sessions = new FakePracticeSessionRepository([session]);

    await createDiscardPracticeSessionUseCase(sessions).execute({
      userId: 'user-1',
      sessionId: 'session-ended',
    });

    await expect(
      sessions.findByIdAndUserId('session-ended', 'user-1'),
    ).resolves.toMatchObject({ id: 'session-ended', endedAt });
  });

  it('rejects discarding a tutor session and leaves it intact', async () => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-tutor',
        userId: 'user-1',
        mode: 'tutor',
        endedAt: null,
      }),
    ]);

    await expect(
      createDiscardPracticeSessionUseCase(sessions).execute({
        userId: 'user-1',
        sessionId: 'session-tutor',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      sessions.findByIdAndUserId('session-tutor', 'user-1'),
    ).resolves.toMatchObject({ id: 'session-tutor' });
  });

  it('frees the incomplete-session slot so the user can start over', async () => {
    const userId = 'user-1';
    const question = createQuestion({
      id: 'question-1',
      difficulty: 'easy',
      choices: [
        createChoice({
          id: 'choice-1',
          questionId: 'question-1',
          isCorrect: true,
        }),
      ],
    });
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-old',
        userId,
        mode: 'exam',
        questionIds: ['question-1'],
        endedAt: null,
      }),
    ]);

    await createDiscardPracticeSessionUseCase(sessions).execute({
      userId,
      sessionId: 'session-old',
    });

    await expect(
      new StartPracticeSessionUseCase(
        new FakeQuestionRepository([question]),
        sessions,
      ).execute({
        userId,
        mode: 'exam',
        count: 1,
        tagSlugs: [],
        difficulties: [],
      }),
    ).resolves.toMatchObject({
      requestedCount: 1,
      actualCount: 1,
    });
  });
});
