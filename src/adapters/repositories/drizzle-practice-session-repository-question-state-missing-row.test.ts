import { describe, expect, it, vi } from 'vitest';
import { DrizzlePracticeSessionRepository } from './drizzle-practice-session-repository';

const sessionId = crypto.randomUUID();
const userId = crypto.randomUUID();
const questionId = crypto.randomUUID();
const selectedChoiceId = crypto.randomUUID();

function createMissingQuestionStateRepo(input: {
  endedAt: Date | null;
  sessionQuestionIds?: string[];
}) {
  const questionIds = input.sessionQuestionIds ?? [questionId];
  const sessionLockFor = vi.fn(async () => [
    {
      endedAt: input.endedAt,
      paramsJson: {
        count: questionIds.length,
        tagSlugs: [],
        difficulties: [],
        questionIds,
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
  return {
    repo: new DrizzlePracticeSessionRepository(db as unknown as RepoDb),
    update,
  };
}

describe('DrizzlePracticeSessionRepository missing question state row', () => {
  it('throws INTERNAL_ERROR when a session-owned question is missing normalized state', async () => {
    const { repo, update } = createMissingQuestionStateRepo({ endedAt: null });

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

    expect(update).not.toHaveBeenCalled();
  });

  it('throws INTERNAL_ERROR over CONFLICT when an ended session is missing state for a session-owned question', async () => {
    const { repo, update } = createMissingQuestionStateRepo({
      endedAt: new Date('2026-02-01T01:00:00.000Z'),
    });

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

    expect(update).not.toHaveBeenCalled();
  });

  it('keeps CONFLICT for an ended session when the missing question is not part of the session', async () => {
    const foreignQuestionId = crypto.randomUUID();
    const { repo, update } = createMissingQuestionStateRepo({
      endedAt: new Date('2026-02-01T01:00:00.000Z'),
    });

    await expect(
      repo.recordQuestionAnswer({
        sessionId,
        userId,
        questionId: foreignQuestionId,
        selectedChoiceId,
        isCorrect: true,
        answeredAt: new Date('2026-02-01T00:10:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Practice session already ended',
    });

    expect(update).not.toHaveBeenCalled();
  });
});
