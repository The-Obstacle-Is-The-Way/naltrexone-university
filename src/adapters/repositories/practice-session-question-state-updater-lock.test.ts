import { describe, expect, it, vi } from 'vitest';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';
import { createStateRow } from './drizzle-practice-session-repository-test-helpers';

const sessionId = crypto.randomUUID();
const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();
const selectedChoiceId = crypto.randomUUID();

describe('practice session question state updater locking', () => {
  it('reads the parent session and question state in one snapshot without locking the parent session', async () => {
    const answeredAt = new Date('2026-02-01T00:10:00.000Z');
    const existing = createStateRow({
      practiceSessionId: sessionId,
      questionId,
      position: 0,
      version: 2,
    });
    const updated = {
      ...existing,
      latestSelectedChoiceId: selectedChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: answeredAt,
      version: 3,
    };
    const callOrder: string[] = [];
    const snapshotLimit = vi.fn(async () => {
      callOrder.push('snapshot');
      return [
        {
          sessionEndedAt: null,
          sessionParamsJson: {
            count: 1,
            tagSlugs: [],
            difficulties: [],
            questionIds: [questionId],
          },
          state: existing,
        },
      ];
    });
    const updateReturning = vi.fn(async () => {
      callOrder.push('update');
      return [updated];
    });
    const tx = {
      select: vi.fn().mockReturnValue({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: snapshotLimit,
            }),
          }),
          where: () => ({
            for: () => {
              throw new Error('unexpected parent session row lock');
            },
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
    expect(snapshotLimit).toHaveBeenCalledTimes(1);
    expect(updateReturning).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['snapshot', 'update']);
  });
});
