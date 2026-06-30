import { describe, expect, it, vi } from 'vitest';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';

const sessionId = crypto.randomUUID();
const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();
const selectedChoiceId = crypto.randomUUID();

describe('DrizzlePracticeSessionRepository missing question state row', () => {
  it('throws INTERNAL_ERROR when a session-owned question is missing normalized state', async () => {
    const sessionLockFor = vi.fn(async () => [
      {
        endedAt: null,
        paramsJson: {
          count: 1,
          tagSlugs: [],
          difficulties: [],
          questionIds: [questionId],
        },
      },
    ]);
    const stateLimit = vi.fn(async () => []);
    const select = vi
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
      });
    const update = vi.fn(() => {
      throw new Error('unexpected update');
    });
    const tx = { select, update };
    const db = {
      transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
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

    expect(select).toHaveBeenCalledTimes(2);
    expect(sessionLockFor).toHaveBeenCalledWith('update');
    expect(stateLimit).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });
});
