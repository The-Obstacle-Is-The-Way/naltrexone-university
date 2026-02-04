import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAuthGateway,
  FakeGetUserStatsUseCase,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import type { UserStatsOutput } from '@/src/application/use-cases';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { User } from '@/src/domain/entities';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import { getUserStats, type StatsControllerDeps } from './stats-controller';

type StatsControllerTestDeps = StatsControllerDeps & {
  getUserStatsUseCase: FakeGetUserStatsUseCase;
};

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  useCaseOutput?: UserStatsOutput;
  useCaseThrows?: unknown;
}): StatsControllerTestDeps {
  const user =
    overrides?.user === undefined
      ? createUser({ id: 'user_1' })
      : overrides.user;

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
  );

  const getUserStatsUseCase = new FakeGetUserStatsUseCase(
    overrides?.useCaseOutput ?? {
      totalAnswered: 0,
      accuracyOverall: 0,
      answeredLast7Days: 0,
      accuracyLast7Days: 0,
      currentStreakDays: 0,
      recentActivity: [],
    },
    overrides?.useCaseThrows,
  );

  return {
    authGateway,
    checkEntitlementUseCase,
    getUserStatsUseCase,
  };
}

describe('stats-controller', () => {
  describe('getUserStats', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getUserStats({ extra: true }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(deps.getUserStatsUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await getUserStats({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.getUserStatsUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getUserStats({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.getUserStatsUseCase.inputs).toEqual([]);
    });

    it('returns ok result from the use case', async () => {
      const deps = createDeps();

      const result = await getUserStats({}, deps);

      expect(result).toMatchObject({ ok: true });
      expect(deps.getUserStatsUseCase.inputs).toEqual([{ userId: 'user_1' }]);
    });

    it('maps ApplicationError from use case via handleError', async () => {
      const deps = createDeps({
        useCaseThrows: new ApplicationError('INTERNAL_ERROR', 'boom'),
      });

      const result = await getUserStats({}, deps);

      expect(result).toEqual({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'boom' },
      });
    });

    it('loads dependencies from the container when deps are omitted', async () => {
      const deps = createDeps();

      const result = await getUserStats({}, undefined, {
        loadContainer: async () => ({
          createStatsControllerDeps: () => deps,
        }),
      });

      expect(result.ok).toBe(true);
    });
  });
});
