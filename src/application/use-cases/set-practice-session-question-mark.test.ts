import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakePracticeSessionRepository } from '@/src/application/test-helpers/fakes';
import { SetPracticeSessionQuestionMarkUseCase } from '@/src/application/use-cases/set-practice-session-question-mark';
import { createPracticeSession } from '@/src/domain/test-helpers';

describe('SetPracticeSessionQuestionMarkUseCase', () => {
  it('persists marked-for-review state for exam sessions', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      questionIds: [questionId],
    });

    const sessions = new FakePracticeSessionRepository([session]);
    const useCase = new SetPracticeSessionQuestionMarkUseCase(sessions);

    await expect(
      useCase.execute({
        userId,
        sessionId,
        questionId,
        markedForReview: true,
      }),
    ).resolves.toEqual({
      questionId,
      markedForReview: true,
    });

    const updated = await sessions.findByIdAndUserId(sessionId, userId);
    expect(updated?.questionStates[0]).toMatchObject({
      questionId,
      markedForReview: true,
    });
  });

  it('throws CONFLICT for tutor sessions', async () => {
    const useCase = new SetPracticeSessionQuestionMarkUseCase(
      new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-1',
          userId: 'user-1',
          mode: 'tutor',
          questionIds: ['q1'],
        }),
      ]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        questionId: 'q1',
        markedForReview: true,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'CONFLICT',
        'Mark for review is only available in exam mode',
      ),
    );
  });

  it('persists unmarked state for exam sessions', async () => {
    const userId = 'user-1';
    const sessionId = 'session-1';
    const questionId = 'q1';

    const session = createPracticeSession({
      id: sessionId,
      userId,
      mode: 'exam',
      questionIds: [questionId],
      questionStates: [
        {
          questionId,
          markedForReview: true,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
    });

    const sessions = new FakePracticeSessionRepository([session]);
    const useCase = new SetPracticeSessionQuestionMarkUseCase(sessions);

    await expect(
      useCase.execute({
        userId,
        sessionId,
        questionId,
        markedForReview: false,
      }),
    ).resolves.toEqual({
      questionId,
      markedForReview: false,
    });

    const updated = await sessions.findByIdAndUserId(sessionId, userId);
    expect(updated?.questionStates[0]).toMatchObject({
      questionId,
      markedForReview: false,
    });
  });

  it('throws NOT_FOUND when session does not exist', async () => {
    const useCase = new SetPracticeSessionQuestionMarkUseCase(
      new FakePracticeSessionRepository([]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'missing-session',
        questionId: 'q1',
        markedForReview: true,
      }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );
  });

  it('throws CONFLICT when session is already ended', async () => {
    const useCase = new SetPracticeSessionQuestionMarkUseCase(
      new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-1',
          userId: 'user-1',
          mode: 'exam',
          questionIds: ['q1'],
          endedAt: new Date('2026-02-06T00:00:00Z'),
        }),
      ]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        questionId: 'q1',
        markedForReview: true,
      }),
    ).rejects.toEqual(
      new ApplicationError('CONFLICT', 'Cannot modify a completed session'),
    );
  });
});
