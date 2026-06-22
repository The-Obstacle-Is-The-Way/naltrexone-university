import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { omittedOutcome } from '@/src/domain/value-objects';
import { FakePracticeSessionRepository } from './fake-practice-session-repository';

describe('FakePracticeSessionRepository', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('honors explicit endedAt while preserving the default clock path', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:10:00.000Z'));
    const explicitEndedAt = new Date('2026-02-01T00:05:00.000Z');
    const repo = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'explicit-session',
        userId: 'user-1',
        mode: 'exam',
        endedAt: null,
      }),
      createPracticeSession({
        id: 'default-session',
        userId: 'user-1',
        mode: 'tutor',
        endedAt: null,
      }),
    ]);

    await expect(
      repo.end('explicit-session', 'user-1', explicitEndedAt),
    ).resolves.toMatchObject({
      id: 'explicit-session',
      endedAt: explicitEndedAt,
    });
    await expect(repo.end('default-session', 'user-1')).resolves.toMatchObject({
      id: 'default-session',
      endedAt: new Date('2026-02-01T00:10:00.000Z'),
    });
  });

  it('discards only incomplete sessions owned by the caller', async () => {
    const endedAt = new Date('2026-02-01T00:00:00Z');
    const repo = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'active-owned',
        userId: 'user-1',
        mode: 'exam',
        endedAt: null,
      }),
      createPracticeSession({
        id: 'active-other',
        userId: 'user-2',
        mode: 'exam',
        endedAt: null,
      }),
      createPracticeSession({
        id: 'ended-owned',
        userId: 'user-1',
        mode: 'exam',
        endedAt,
      }),
    ]);

    await expect(repo.discard('active-owned', 'user-1')).resolves.toBe(
      undefined,
    );
    await expect(repo.discard('missing', 'user-1')).resolves.toBe(undefined);
    await expect(repo.discard('active-other', 'user-1')).resolves.toBe(
      undefined,
    );
    await expect(repo.discard('ended-owned', 'user-1')).resolves.toBe(
      undefined,
    );

    await expect(
      repo.findByIdAndUserId('active-owned', 'user-1'),
    ).resolves.toBeNull();
    await expect(
      repo.findByIdAndUserId('active-other', 'user-2'),
    ).resolves.toMatchObject({ id: 'active-other' });
    await expect(
      repo.findByIdAndUserId('ended-owned', 'user-1'),
    ).resolves.toMatchObject({ id: 'ended-owned', endedAt });
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

  it('ignores stale draft saves when a newer draft snapshot already exists', async () => {
    const repo = new FakePracticeSessionRepository([
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
            draftSelectedChoiceId: 'choice-1',
            draftSavedAt: new Date('2099-02-01T00:00:00.000Z'),
            draftCumulativeMs: 25_000,
          },
        ],
      }),
    ]);

    await expect(
      repo.saveDraftAnswer({
        sessionId: 'session-1',
        userId: 'user-1',
        questionId: 'q1',
        selectedChoiceId: 'choice-2',
        cumulativeMs: 10_000,
      }),
    ).resolves.toMatchObject({
      questionId: 'q1',
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
      latestAnsweredAt: null,
      draftSelectedChoiceId: 'choice-1',
      draftSavedAt: new Date('2099-02-01T00:00:00.000Z'),
      draftCumulativeMs: 25_000,
    });
  });

  it('finalizes an omitted answer as incorrect review state', async () => {
    const answeredAt = new Date('2026-03-17T12:30:00.000Z');
    const repo = new FakePracticeSessionRepository([
      createPracticeSession({
        id: 'session-1',
        userId: 'user-1',
        mode: 'exam',
        questionIds: ['q1'],
        questionStates: [
          {
            questionId: 'q1',
            markedForReview: true,
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

    await expect(
      repo.finalizeDraftAnswer({
        sessionId: 'session-1',
        userId: 'user-1',
        questionId: 'q1',
        outcome: omittedOutcome(),
        isCorrect: false,
        answeredAt,
      }),
    ).resolves.toEqual({
      questionId: 'q1',
      markedForReview: true,
      latestSelectedChoiceId: null,
      latestIsCorrect: false,
      latestAnsweredAt: answeredAt,
      draftSelectedChoiceId: null,
      draftSavedAt: null,
      draftCumulativeMs: 0,
    });
  });
});
