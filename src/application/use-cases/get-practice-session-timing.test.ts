import { describe, expect, it } from 'vitest';
import { FakePracticeSessionRepository } from '@/src/application/test-helpers/fakes';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { GetPracticeSessionTimingUseCase } from './get-practice-session-timing';

const STARTED_AT = new Date('2026-05-22T12:00:00.000Z');
const DEADLINE = new Date('2026-05-22T12:01:12.000Z');

describe('GetPracticeSessionTimingUseCase', () => {
  it('returns the server remaining milliseconds without rounding to zero early', async () => {
    const session = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1'],
      startedAt: STARTED_AT,
    });
    const useCase = new GetPracticeSessionTimingUseCase(
      new FakePracticeSessionRepository([session]),
      () => new Date(DEADLINE.getTime() - 1),
    );

    await expect(
      useCase.execute({ userId: session.userId, sessionId: session.id }),
    ).resolves.toEqual({ deadlineAt: DEADLINE.toISOString(), remainingMs: 1 });
  });

  it('reports expiry without finalizing the exam or changing its draft', async () => {
    const initialSession = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1'],
      startedAt: STARTED_AT,
    });
    const session = {
      ...initialSession,
      questionStates: initialSession.questionStates.map((state) => ({
        ...state,
        draftSelectedChoiceId: 'saved-choice',
        draftSavedAt: new Date(STARTED_AT.getTime() + 1_000),
        draftCumulativeMs: 1_000,
      })),
    };
    const sessions = new FakePracticeSessionRepository([session]);
    const before = await sessions.findByIdAndUserId(session.id, session.userId);
    const useCase = new GetPracticeSessionTimingUseCase(
      sessions,
      () => DEADLINE,
    );

    await expect(
      useCase.execute({ userId: session.userId, sessionId: session.id }),
    ).resolves.toEqual({ deadlineAt: DEADLINE.toISOString(), remainingMs: 0 });
    await expect(
      sessions.findByIdAndUserId(session.id, session.userId),
    ).resolves.toEqual(before);
  });

  it('returns zero remaining time for an exam submitted before its deadline', async () => {
    const session = createPracticeSession({
      mode: 'exam',
      questionIds: ['q1'],
      startedAt: STARTED_AT,
      endedAt: new Date(STARTED_AT.getTime() + 30_000),
    });
    const useCase = new GetPracticeSessionTimingUseCase(
      new FakePracticeSessionRepository([session]),
      () => new Date(STARTED_AT.getTime() + 31_000),
    );

    await expect(
      useCase.execute({ userId: session.userId, sessionId: session.id }),
    ).resolves.toEqual({ deadlineAt: DEADLINE.toISOString(), remainingMs: 0 });
  });

  it('returns untimed values for a tutor session', async () => {
    const session = createPracticeSession({ mode: 'tutor' });
    const useCase = new GetPracticeSessionTimingUseCase(
      new FakePracticeSessionRepository([session]),
      () => DEADLINE,
    );

    await expect(
      useCase.execute({ userId: session.userId, sessionId: session.id }),
    ).resolves.toEqual({ deadlineAt: null, remainingMs: null });
  });

  it.each(['missing-session', 'another-users-session'])(
    'refuses timing for %s',
    async (sessionId) => {
      const sessions = new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'another-users-session',
          userId: 'other-user',
        }),
      ]);
      const useCase = new GetPracticeSessionTimingUseCase(
        sessions,
        () => DEADLINE,
      );

      await expect(
        useCase.execute({ userId: 'requesting-user', sessionId }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    },
  );
});
