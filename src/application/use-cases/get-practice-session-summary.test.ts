import { describe, expect, it } from 'vitest';
import {
  createPracticeSession,
  createQuestion,
} from '@/src/domain/test-helpers';
import type { QuestionAvailability } from '@/src/domain/value-objects';
import type { ApplicationError } from '../errors';
import {
  FakePracticeSessionRepository,
  FakeQuestionRepository,
} from '../test-helpers/fakes';
import { GetPracticeSessionSummaryUseCase } from './get-practice-session-summary';

function bank(
  states: Readonly<Record<string, QuestionAvailability>> = {},
): FakeQuestionRepository {
  return new FakeQuestionRepository(
    ['q1', 'q2'].map((id) => {
      const availability = states[id] ?? 'available';
      return createQuestion({
        id,
        status: availability === 'available' ? 'published' : 'archived',
        availability,
      });
    }),
  );
}

describe('GetPracticeSessionSummaryUseCase', () => {
  it('returns the ended session summary when the session exists and is completed', async () => {
    const endedAt = new Date('2026-02-01T00:10:00Z');
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-ended',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1', 'q2'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: 'choice-1',
            latestIsCorrect: true,
            latestAnsweredAt: new Date('2026-02-01T00:03:00Z'),
          },
          {
            questionId: 'q2',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
          },
        ],
        startedAt: new Date('2026-02-01T00:00:00Z'),
        endedAt,
      }),
    ]);
    const useCase = new GetPracticeSessionSummaryUseCase(sessions, bank());

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-ended' }),
    ).resolves.toEqual({
      sessionId: 'session-ended',
      mode: 'exam',
      questionCount: 2,
      endedAt: '2026-02-01T00:10:00.000Z',
      totals: {
        answered: 1,
        scored: 2,
        correct: 1,
        accuracy: 0.5,
        durationSeconds: 600,
      },
    });
  });

  // ADR-022 Amendment: read at the time of the read, so a question withdrawn
  // since the session ended leaves its score.
  it('scores the items as the bank stands when the summary is read', async () => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-ended',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1', 'q2'],
        questionStates: ['q1', 'q2'].map((questionId) => ({
          questionId,
          markedForReview: false,
          latestSelectedChoiceId: `choice-${questionId}`,
          latestIsCorrect: questionId === 'q1',
          latestAnsweredAt: new Date('2026-02-01T00:03:00Z'),
        })),
        startedAt: new Date('2026-02-01T00:00:00Z'),
        endedAt: new Date('2026-02-01T00:10:00Z'),
      }),
    ]);

    const read = (questions: FakeQuestionRepository) =>
      new GetPracticeSessionSummaryUseCase(sessions, questions).execute({
        userId: 'user-1',
        sessionId: 'session-ended',
      });

    await expect(read(bank({ q1: 'withdrawn' }))).resolves.toMatchObject({
      totals: { answered: 2, scored: 1, correct: 0, accuracy: 0 },
    });
    await expect(read(bank())).resolves.toMatchObject({
      totals: { answered: 2, scored: 2, correct: 1, accuracy: 0.5 },
    });
  });

  it('returns NOT_FOUND when the session does not exist', async () => {
    const useCase = new GetPracticeSessionSummaryUseCase(
      new FakePracticeSessionRepository([]),
      bank(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'missing' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Practice session not found',
    } satisfies Partial<ApplicationError>);
  });

  it('returns CONFLICT when the session is still active', async () => {
    const useCase = new GetPracticeSessionSummaryUseCase(
      new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-active',
          userId: 'user-1',
          endedAt: null,
        }),
      ]),
      bank(),
    );

    await expect(
      useCase.execute({ userId: 'user-1', sessionId: 'session-active' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session has not ended',
    } satisfies Partial<ApplicationError>);
  });
});
