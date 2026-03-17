import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { FakePracticeSessionRepository } from './fake-practice-session-repository';

describe('FakePracticeSessionRepository', () => {
  it('normalizes missing draft fields for seeded legacy sessions', async () => {
    const legacySession = {
      ...createPracticeSession({
        id: 'session-legacy',
        userId: 'user-1',
        questionIds: ['question-1'],
      }),
      questionStates: [
        {
          questionId: 'question-1',
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        },
      ],
    };

    const repo = new FakePracticeSessionRepository([
      legacySession as unknown as ReturnType<typeof createPracticeSession>,
    ]);

    await expect(
      repo.findByIdAndUserId('session-legacy', 'user-1'),
    ).resolves.toMatchObject({
      questionStates: [
        {
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        },
      ],
    });
  });

  it('throws NOT_FOUND when ending a missing session', async () => {
    const repo = new FakePracticeSessionRepository();

    await expect(repo.end('missing', 'user-1')).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );
  });

  it('throws CONFLICT when ending an already-ended session', async () => {
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'tutor',
      endedAt: new Date('2026-02-01T00:00:00Z'),
    });

    const repo = new FakePracticeSessionRepository([session]);

    await expect(repo.end('session-1', 'user-1')).rejects.toEqual(
      new ApplicationError('CONFLICT', 'Practice session already ended'),
    );
  });

  it('normalizes missing draft fields when creating a session from legacy params', async () => {
    const repo = new FakePracticeSessionRepository();

    const created = await repo.create({
      userId: 'user-1',
      mode: 'exam',
      paramsJson: {
        questionIds: ['question-1'],
        tagSlugs: [],
        difficulties: [],
        questionStates: [
          {
            questionId: 'question-1',
            markedForReview: false,
            latestSelectedChoiceId: null,
            latestIsCorrect: null,
            latestAnsweredAt: null,
          },
        ],
      },
    });

    expect(created.questionStates).toEqual([
      {
        questionId: 'question-1',
        markedForReview: false,
        latestSelectedChoiceId: null,
        latestIsCorrect: null,
        latestAnsweredAt: null,
        draftSelectedChoiceId: null,
        draftSavedAt: null,
        draftCumulativeMs: 0,
      },
    ]);
  });
});
