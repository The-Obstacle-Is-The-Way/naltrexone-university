import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakePracticeSessionRepository } from '@/src/application/test-helpers/fakes';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { SaveExamDraftAnswerUseCase } from './save-exam-draft-answer';

describe('SaveExamDraftAnswerUseCase', () => {
  it('saves a draft answer for an active exam session without changing latest answer fields', async () => {
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'exam',
      questionIds: ['q1'],
      questionStates: [
        {
          questionId: 'q1',
          markedForReview: false,
          latestSelectedChoiceId: 'final-choice',
          latestIsCorrect: false,
          latestAnsweredAt: new Date('2026-03-17T11:00:00.000Z'),
        },
      ],
    });

    const sessions = new FakePracticeSessionRepository([session]);
    const useCase = new SaveExamDraftAnswerUseCase(sessions);

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        questionId: 'q1',
        selectedChoiceId: 'draft-choice',
        cumulativeMs: 45_000,
      }),
    ).resolves.toMatchObject({
      questionId: 'q1',
      latestSelectedChoiceId: 'final-choice',
      latestIsCorrect: false,
      latestAnsweredAt: new Date('2026-03-17T11:00:00.000Z'),
      draftSelectedChoiceId: 'draft-choice',
      draftCumulativeMs: 45_000,
      draftSavedAt: expect.any(Date),
    });
  });

  it('overwrites a previous draft snapshot for the same exam question', async () => {
    const sessions = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
            draftSelectedChoiceId: 'old-choice',
            draftSavedAt: new Date('2026-03-17T10:00:00.000Z'),
            draftCumulativeMs: 10_000,
          },
        ],
      }),
    ]);
    const useCase = new SaveExamDraftAnswerUseCase(sessions);

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        questionId: 'q1',
        selectedChoiceId: 'new-choice',
        cumulativeMs: 30_000,
      }),
    ).resolves.toMatchObject({
      draftSelectedChoiceId: 'new-choice',
      draftCumulativeMs: 30_000,
      draftSavedAt: expect.any(Date),
    });
  });

  it('rejects tutor sessions', async () => {
    const useCase = new SaveExamDraftAnswerUseCase(
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
        selectedChoiceId: 'choice-1',
        cumulativeMs: 5_000,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Draft answers are only available in exam mode',
      ),
    );
  });

  it('rejects ended sessions', async () => {
    const useCase = new SaveExamDraftAnswerUseCase(
      new FakePracticeSessionRepository([
        createPracticeSession({
          id: 'session-1',
          userId: 'user-1',
          mode: 'exam',
          questionIds: ['q1'],
          endedAt: new Date('2026-03-17T12:00:00.000Z'),
        }),
      ]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'session-1',
        questionId: 'q1',
        selectedChoiceId: 'choice-1',
        cumulativeMs: 5_000,
      }),
    ).rejects.toEqual(
      new ApplicationError('CONFLICT', 'Cannot modify a completed session'),
    );
  });

  it('rejects missing sessions', async () => {
    const useCase = new SaveExamDraftAnswerUseCase(
      new FakePracticeSessionRepository([]),
    );

    await expect(
      useCase.execute({
        userId: 'user-1',
        sessionId: 'missing-session',
        questionId: 'q1',
        selectedChoiceId: 'choice-1',
        cumulativeMs: 5_000,
      }),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );
  });
});
