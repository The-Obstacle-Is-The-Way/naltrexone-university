import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakePracticeSessionRepository } from '@/src/application/test-helpers/fakes';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { GetIncompletePracticeSessionUseCase } from './get-incomplete-practice-session';

describe('GetIncompletePracticeSessionUseCase', () => {
  it('returns null when no incomplete session exists', async () => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-ended',
        userId: 'user-1',
        endedAt: new Date('2026-02-05T12:00:00Z'),
      }),
    ]);
    const useCase = new GetIncompletePracticeSessionUseCase(sessions);

    await expect(useCase.execute({ userId: 'user-1' })).resolves.toBeNull();
  });

  it('returns latest incomplete session with progress', async () => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-old',
        userId: 'user-1',
        mode: 'tutor',
        questionIds: ['q1', 'q2', 'q3'],
        startedAt: new Date('2026-02-05T08:00:00Z'),
        endedAt: null,
      }),
      createPracticeSession({
        id: 'session-new',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q4', 'q5', 'q6', 'q7'],
        questionStates: [
          {
            questionId: 'q4',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: 'choice-1',
            draftSavedAt: new Date('2026-02-05T09:01:00Z'),
            draftCumulativeMs: 15_000,
          },
          {
            questionId: 'q5',
            markedForReview: true,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
          {
            questionId: 'q6',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
          {
            questionId: 'q7',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
        ],
        startedAt: new Date('2026-02-05T09:00:00Z'),
        endedAt: null,
      }),
    ]);
    const useCase = new GetIncompletePracticeSessionUseCase(sessions);

    await expect(useCase.execute({ userId: 'user-1' })).resolves.toEqual({
      sessionId: 'session-new',
      mode: 'exam',
      answeredCount: 1,
      totalCount: 4,
      startedAt: '2026-02-05T09:00:00.000Z',
    });
  });

  it('falls back to latestSelectedChoiceId for legacy active exam sessions with no draft', async () => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-new',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q4', 'q5'],
        questionStates: [
          {
            questionId: 'q4',
            markedForReview: false,
            latestSelectedChoiceId: 'choice-1',
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
          {
            questionId: 'q5',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: null,
            draftSavedAt: null,
            draftCumulativeMs: 0,
          },
        ],
        startedAt: new Date('2026-02-05T09:00:00Z'),
        endedAt: null,
      }),
    ]);
    const useCase = new GetIncompletePracticeSessionUseCase(sessions);

    await expect(useCase.execute({ userId: 'user-1' })).resolves.toEqual({
      sessionId: 'session-new',
      mode: 'exam',
      answeredCount: 1,
      totalCount: 2,
      startedAt: '2026-02-05T09:00:00.000Z',
    });
  });

  it('throws INTERNAL_ERROR when normalized question state is missing', async () => {
    const session = createPracticeSession({
      id: 'session-new',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q4', 'q5'],
      questionStates: [
        {
          questionId: 'q4',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: 'choice-1',
          draftSavedAt: new Date('2026-02-05T09:01:00Z'),
          draftCumulativeMs: 15_000,
        },
      ],
      startedAt: new Date('2026-02-05T09:00:00Z'),
      endedAt: null,
    });
    const sessions = new FakePracticeSessionRepository([]);
    sessions.findLatestIncompleteByUserId = async () => session;
    const useCase = new GetIncompletePracticeSessionUseCase(sessions);

    await expect(useCase.execute({ userId: 'user-1' })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('propagates repository failures', async () => {
    const sessions = new FakePracticeSessionRepository([]);
    sessions.findLatestIncompleteByUserId = async () => {
      throw new ApplicationError('INTERNAL_ERROR', 'DB unavailable');
    };

    const useCase = new GetIncompletePracticeSessionUseCase(sessions);

    await expect(useCase.execute({ userId: 'user-1' })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
