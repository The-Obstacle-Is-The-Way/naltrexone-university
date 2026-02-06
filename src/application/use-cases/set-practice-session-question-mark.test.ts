// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { ApplicationError } from '../errors';
import { FakePracticeSessionRepository } from '../test-helpers/fakes';
import { SetPracticeSessionQuestionMarkUseCase } from './set-practice-session-question-mark';

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
});
