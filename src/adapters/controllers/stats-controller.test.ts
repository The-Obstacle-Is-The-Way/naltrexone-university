import { describe, expect, it, vi } from 'vitest';
import { getUserStats } from '@/src/adapters/controllers/stats-controller';
import type { Logger } from '@/src/adapters/shared/logger';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  AttemptRepository,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import type { Attempt, Question, User } from '@/src/domain/entities';
import {
  createAttempt,
  createQuestion,
  createUser,
} from '@/src/domain/test-helpers';

function createDeps(overrides?: {
  user?: User;
  authGateway?: Partial<AuthGateway>;
  isEntitled?: boolean;
  attempts?: readonly Attempt[];
  questionsById?: Record<string, Question>;
  now?: () => Date;
  logger?: Logger;
}) {
  const user = overrides?.user ?? createUser({ id: 'user_1' });
  const isEntitled = overrides?.isEntitled ?? true;
  const attempts = overrides?.attempts ?? [];
  const questionsById = overrides?.questionsById ?? {};
  const now = overrides?.now ?? (() => new Date('2026-02-01T12:00:00Z'));

  const authGateway: AuthGateway = {
    getCurrentUser: async () => user,
    requireUser: async () => user,
    ...overrides?.authGateway,
  };

  const checkEntitlementUseCase = {
    execute: vi.fn(async () => ({ isEntitled })),
  };

  const attemptRepository: AttemptRepository = {
    insert: vi.fn(async () => createAttempt({ questionId: 'q_1' })),
    findByUserId: vi.fn(async () => {
      throw new Error('findByUserId should not be called by stats-controller');
    }),
    findBySessionId: vi.fn(async () => []),
    countByUserId: vi.fn(async () => attempts.length),
    countCorrectByUserId: vi.fn(
      async () => attempts.filter((a) => a.isCorrect).length,
    ),
    countByUserIdSince: vi.fn(
      async (_userId: string, since: Date) =>
        attempts.filter((a) => a.answeredAt >= since).length,
    ),
    countCorrectByUserIdSince: vi.fn(
      async (_userId: string, since: Date) =>
        attempts.filter((a) => a.answeredAt >= since && a.isCorrect).length,
    ),
    listRecentByUserId: vi.fn(async (_userId: string, limit: number) =>
      attempts
        .slice()
        .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())
        .slice(0, limit),
    ),
    listAnsweredAtByUserIdSince: vi.fn(async (_userId: string, since: Date) =>
      attempts.filter((a) => a.answeredAt >= since).map((a) => a.answeredAt),
    ),
    listMissedQuestionsByUserId: vi.fn(async () => []),
    findMostRecentAnsweredAtByQuestionIds: vi.fn(async () => []),
  };

  const questionRepository: QuestionRepository = {
    findPublishedById: vi.fn(async () => null),
    findPublishedBySlug: vi.fn(async () => null),
    findPublishedByIds: vi.fn(async (ids: readonly string[]) =>
      ids.map((id) => questionsById[id]).filter((q): q is Question => !!q),
    ),
    listPublishedCandidateIds: vi.fn(async () => []),
  };

  return {
    authGateway,
    checkEntitlementUseCase,
    attemptRepository,
    questionRepository,
    now,
    logger: overrides?.logger,
  };
}

describe('stats-controller', () => {
  describe('getUserStats', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getUserStats({ extra: true }, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({
        authGateway: {
          requireUser: async () => {
            throw new ApplicationError('UNAUTHENTICATED', 'No session');
          },
        },
      });

      const result = await getUserStats({}, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getUserStats({}, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.attemptRepository.findByUserId).not.toHaveBeenCalled();
    });

    it('computes stats from attempts and joins recent activity slugs', async () => {
      const now = new Date('2026-02-01T12:00:00Z');

      const deps = createDeps({
        now: () => now,
        attempts: [
          createAttempt({
            questionId: 'q1',
            isCorrect: true,
            answeredAt: new Date('2026-02-01T11:00:00Z'),
          }),
          createAttempt({
            questionId: 'q2',
            isCorrect: false,
            answeredAt: new Date('2026-01-31T11:00:00Z'),
          }),
          createAttempt({
            questionId: 'q3',
            isCorrect: true,
            answeredAt: new Date('2026-01-20T11:00:00Z'),
          }),
        ],
        questionsById: {
          q1: createQuestion({ id: 'q1', slug: 'q-1' }),
          q2: createQuestion({ id: 'q2', slug: 'q-2' }),
          q3: createQuestion({ id: 'q3', slug: 'q-3' }),
        },
      });

      const result = await getUserStats({}, deps as never);

      expect(result).toEqual({
        ok: true,
        data: {
          totalAnswered: 3,
          accuracyOverall: 2 / 3,
          answeredLast7Days: 2,
          accuracyLast7Days: 1 / 2,
          currentStreakDays: 2,
          recentActivity: [
            {
              attemptId: 'attempt-q1',
              answeredAt: '2026-02-01T11:00:00.000Z',
              questionId: 'q1',
              slug: 'q-1',
              isCorrect: true,
            },
            {
              attemptId: 'attempt-q2',
              answeredAt: '2026-01-31T11:00:00.000Z',
              questionId: 'q2',
              slug: 'q-2',
              isCorrect: false,
            },
            {
              attemptId: 'attempt-q3',
              answeredAt: '2026-01-20T11:00:00.000Z',
              questionId: 'q3',
              slug: 'q-3',
              isCorrect: true,
            },
          ],
        },
      });
    });

    it('includes attemptId in recentActivity for unique React keys', async () => {
      const now = new Date('2026-02-01T12:00:00Z');

      const deps = createDeps({
        now: () => now,
        attempts: [
          createAttempt({
            id: 'attempt_123',
            questionId: 'q1',
            isCorrect: true,
            answeredAt: new Date('2026-02-01T11:00:00Z'),
          }),
        ],
        questionsById: {
          q1: createQuestion({ id: 'q1', slug: 'q-1' }),
        },
      });

      const result = await getUserStats({}, deps as never);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.recentActivity[0]).toHaveProperty(
          'attemptId',
          'attempt_123',
        );
      }
    });

    it('loads dependencies from the container when deps are omitted', async () => {
      vi.resetModules();

      const deps = createDeps({ attempts: [], questionsById: {} });

      vi.doMock('@/lib/container', () => ({
        createContainer: () => ({
          createStatsControllerDeps: () => deps,
        }),
      }));

      const { getUserStats } = await import('./stats-controller');

      const result = await getUserStats({});

      expect(result).toEqual({
        ok: true,
        data: {
          totalAnswered: 0,
          accuracyOverall: 0,
          answeredLast7Days: 0,
          accuracyLast7Days: 0,
          currentStreakDays: 0,
          recentActivity: [],
        },
      });
    });

    it('logs warning when recent activity references missing question', async () => {
      const orphanedQuestionId = 'q-orphaned';
      const now = new Date('2026-02-01T12:00:00Z');
      const logger: Logger = { warn: vi.fn() };

      const deps = createDeps({
        now: () => now,
        attempts: [
          createAttempt({
            questionId: orphanedQuestionId,
            isCorrect: true,
            answeredAt: new Date('2026-02-01T11:00:00Z'),
          }),
        ],
        questionsById: {},
        logger,
      });

      const result = await getUserStats({}, deps as never);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.recentActivity).toEqual([]);
      }
      expect(logger.warn).toHaveBeenCalledWith(
        { questionId: orphanedQuestionId },
        'Recent activity references missing question',
      );
    });

    it('works without logger (optional dependency)', async () => {
      const orphanedQuestionId = 'q-orphaned';
      const now = new Date('2026-02-01T12:00:00Z');

      const deps = createDeps({
        now: () => now,
        attempts: [
          createAttempt({
            questionId: orphanedQuestionId,
            isCorrect: true,
            answeredAt: new Date('2026-02-01T11:00:00Z'),
          }),
        ],
        questionsById: {},
      });

      const result = await getUserStats({}, deps as never);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.recentActivity).toEqual([]);
      }
    });
  });
});
