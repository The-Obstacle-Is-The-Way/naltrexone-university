import { describe, expect, it, vi } from 'vitest';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';

const sessionId = crypto.randomUUID();
const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();
const selectedChoiceId = crypto.randomUUID();

function createStateRow() {
  const now = new Date('2026-02-01T00:00:00.000Z');
  return {
    id: crypto.randomUUID(),
    practiceSessionId: sessionId,
    questionId,
    position: 0,
    markedForReview: false,
    latestSelectedChoiceId: null,
    latestIsCorrect: null,
    latestAnsweredAt: null,
    draftSelectedChoiceId: null,
    draftSavedAt: null,
    draftCumulativeMs: 0,
    version: 2,
    createdAt: now,
    updatedAt: now,
  };
}

describe('practice session question state updater locking', () => {
  it('locks the parent practice session before updating question state', async () => {
    const answeredAt = new Date('2026-02-01T00:10:00.000Z');
    const existing = createStateRow();
    const updated = {
      ...existing,
      latestSelectedChoiceId: selectedChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
      version: 3,
    };
    const callOrder: string[] = [];
    const sessionLockFor = vi.fn(async (strength: unknown) => {
      callOrder.push('lock');
      expect(strength).toBe('update');
      return [
        {
          endedAt: null,
          paramsJson: {
            count: 1,
            tagSlugs: [],
            difficulties: [],
            questionIds: [questionId],
          },
        },
      ];
    });
    const stateLimit = vi.fn(async () => {
      callOrder.push('state');
      return [existing];
    });
    const updateReturning = vi.fn(async () => {
      callOrder.push('update');
      return [updated];
    });
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              for: sessionLockFor,
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              limit: stateLimit,
            }),
          }),
        }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: updateReturning,
          }),
        }),
      }),
      query: {
        practiceSessions: {
          findFirst: () => {
            throw new Error('unexpected unlocked session lookup');
          },
        },
      },
    };
    const transaction = vi.fn(async (fn: (client: typeof tx) => unknown) =>
      fn(tx),
    );
    const db = {
      transaction,
      select: () => {
        throw new Error('unexpected unlocked state select');
      },
      update: () => {
        throw new Error('unexpected unlocked state update');
      },
      query: {
        practiceSessions: {
          findFirst: () => {
            throw new Error('unexpected unlocked session lookup');
          },
        },
      },
      insert: () => {
        throw new Error('unexpected insert');
      },
    } as const;

    type RepoDb = ConstructorParameters<
      typeof DrizzlePracticeSessionRepository
    >[0];
    const repo = new DrizzlePracticeSessionRepository(db as unknown as RepoDb);

    await expect(
      repo.recordQuestionAnswer({
        sessionId,
        userId,
        questionId,
        selectedChoiceId,
        isCorrect: true,
        answeredAt,
      }),
    ).resolves.toMatchObject({
      questionId,
      latestSelectedChoiceId: selectedChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(sessionLockFor).toHaveBeenCalledTimes(1);
    expect(stateLimit).toHaveBeenCalledTimes(1);
    expect(updateReturning).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['lock', 'state', 'update']);
  });
});
