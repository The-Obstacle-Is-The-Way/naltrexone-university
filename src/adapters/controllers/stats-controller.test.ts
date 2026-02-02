import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@/src/adapters/shared/logger';
import {
  FakeAttemptRepository,
  FakeAuthGateway,
  FakeQuestionRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { Attempt, Question, User } from '@/src/domain/entities';
import {
  createAttempt,
  createQuestion,
  createSubscription,
  createUser,
} from '@/src/domain/test-helpers';
import { getUserStats } from './stats-controller';

class FakeLogger implements Logger {
  readonly warnCalls: Array<{ context: Record<string, unknown>; msg: string }> =
    [];

  warn(context: Record<string, unknown>, msg: string): void {
    this.warnCalls.push({ context, msg });
  }
}

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  attempts?: readonly Attempt[];
  questions?: readonly Question[];
  now?: () => Date;
  logger?: Logger;
}) {
  const user =
    overrides?.user === undefined
      ? createUser({ id: 'user_1' })
      : overrides.user;
  const now = overrides?.now ?? (() => new Date('2026-02-01T12:00:00Z'));

  const authGateway = new FakeAuthGateway(user);

  const subscriptionRepository = new FakeSubscriptionRepository(
    overrides?.isEntitled === false
      ? []
      : [
          createSubscription({
            userId: user?.id ?? 'user_1',
            status: 'active',
            currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
          }),
        ],
  );

  const checkEntitlementUseCase = new CheckEntitlementUseCase(
    subscriptionRepository,
    now,
  );

  return {
    authGateway,
    checkEntitlementUseCase,
    attemptRepository: new FakeAttemptRepository(overrides?.attempts ?? []),
    questionRepository: new FakeQuestionRepository(overrides?.questions ?? []),
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
      const deps = createDeps({ user: null });

      const result = await getUserStats({}, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });
      deps.attemptRepository.countByUserId = async () => {
        throw new Error('AttemptRepository should not be called');
      };

      const result = await getUserStats({}, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
    });

    it('computes stats from attempts and joins recent activity slugs', async () => {
      const now = new Date('2026-02-01T12:00:00Z');

      const deps = createDeps({
        now: () => now,
        attempts: [
          createAttempt({
            userId: 'user_1',
            questionId: 'q1',
            isCorrect: true,
            answeredAt: new Date('2026-02-01T11:00:00Z'),
          }),
          createAttempt({
            userId: 'user_1',
            questionId: 'q2',
            isCorrect: false,
            answeredAt: new Date('2026-01-31T11:00:00Z'),
          }),
          createAttempt({
            userId: 'user_1',
            questionId: 'q3',
            isCorrect: true,
            answeredAt: new Date('2026-01-20T11:00:00Z'),
          }),
        ],
        questions: [
          createQuestion({ id: 'q1', slug: 'q-1' }),
          createQuestion({ id: 'q2', slug: 'q-2' }),
          createQuestion({ id: 'q3', slug: 'q-3' }),
        ],
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
            userId: 'user_1',
            questionId: 'q1',
            isCorrect: true,
            answeredAt: new Date('2026-02-01T11:00:00Z'),
          }),
        ],
        questions: [createQuestion({ id: 'q1', slug: 'q-1' })],
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

      const deps = createDeps({ attempts: [], questions: [] });

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
      const logger = new FakeLogger();

      const deps = createDeps({
        now: () => now,
        attempts: [
          createAttempt({
            userId: 'user_1',
            questionId: orphanedQuestionId,
            isCorrect: true,
            answeredAt: new Date('2026-02-01T11:00:00Z'),
          }),
        ],
        questions: [],
        logger,
      });

      const result = await getUserStats({}, deps as never);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.recentActivity).toEqual([]);
      }
      expect(logger.warnCalls).toEqual([
        {
          context: { questionId: orphanedQuestionId },
          msg: 'Recent activity references missing question',
        },
      ]);
    });

    it('works without logger (optional dependency)', async () => {
      const orphanedQuestionId = 'q-orphaned';
      const now = new Date('2026-02-01T12:00:00Z');

      const deps = createDeps({
        now: () => now,
        attempts: [
          createAttempt({
            userId: 'user_1',
            questionId: orphanedQuestionId,
            isCorrect: true,
            answeredAt: new Date('2026-02-01T11:00:00Z'),
          }),
        ],
        questions: [],
      });

      const result = await getUserStats({}, deps as never);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.recentActivity).toEqual([]);
      }
    });
  });
});
