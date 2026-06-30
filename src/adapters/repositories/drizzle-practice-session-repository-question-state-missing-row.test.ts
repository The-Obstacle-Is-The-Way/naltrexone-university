import { describe, expect, it, vi } from 'vitest';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';

const sessionId = crypto.randomUUID();
const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();
const selectedChoiceId = crypto.randomUUID();

describe('DrizzlePracticeSessionRepository missing question state row', () => {
  it('throws INTERNAL_ERROR when a session-owned question is missing normalized state', async () => {
    const limit = vi.fn(async () => []);
    const select = vi.fn(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit }),
        }),
      }),
    }));
    const update = vi.fn(() => {
      throw new Error('unexpected update');
    });
    const db = {
      select,
      update,
      query: {
        practiceSessions: {
          findFirst: vi.fn(async () => ({
            endedAt: null,
            paramsJson: {
              count: 1,
              tagSlugs: [],
              difficulties: [],
              questionIds: [questionId],
            },
          })),
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
        answeredAt: new Date('2026-02-01T00:10:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: `Practice session ${sessionId} is missing normalized question state`,
    });

    expect(select).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });
});
