// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAuthGateway,
  FakeGetMissedQuestionsUseCase,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import type { GetMissedQuestionsOutput } from '@/src/application/use-cases';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { User } from '@/src/domain/entities';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import {
  getMissedQuestions,
  type ReviewControllerDeps,
} from './review-controller';

type ReviewControllerTestDeps = ReviewControllerDeps & {
  getMissedQuestionsUseCase: FakeGetMissedQuestionsUseCase;
};

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  useCaseOutput?: GetMissedQuestionsOutput;
  useCaseThrows?: unknown;
}): ReviewControllerTestDeps {
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

  const getMissedQuestionsUseCase = new FakeGetMissedQuestionsUseCase(
    overrides?.useCaseOutput ?? {
      rows: [],
      limit: 10,
      offset: 0,
      totalCount: 0,
    },
    overrides?.useCaseThrows,
  );

  return {
    authGateway,
    checkEntitlementUseCase,
    getMissedQuestionsUseCase,
  };
}

describe('review-controller', () => {
  describe('getMissedQuestions', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getMissedQuestions({ limit: 0, offset: -1 }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(deps.getMissedQuestionsUseCase.inputs).toEqual([]);
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await getMissedQuestions({ limit: 10, offset: 0 }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(deps.getMissedQuestionsUseCase.inputs).toEqual([]);
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getMissedQuestions({ limit: 10, offset: 0 }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.getMissedQuestionsUseCase.inputs).toEqual([]);
    });

    it('returns ok result from the use case', async () => {
      const deps = createDeps({
        useCaseOutput: { rows: [], limit: 10, offset: 0, totalCount: 0 },
      });

      const result = await getMissedQuestions({ limit: 10, offset: 0 }, deps);

      expect(result).toEqual({
        ok: true,
        data: { rows: [], limit: 10, offset: 0, totalCount: 0 },
      });
      expect(deps.getMissedQuestionsUseCase.inputs).toEqual([
        { userId: 'user_1', limit: 10, offset: 0 },
      ]);
    });

    it('maps ApplicationError from use case via handleError', async () => {
      const deps = createDeps({
        useCaseThrows: new ApplicationError('INTERNAL_ERROR', 'boom'),
      });

      const result = await getMissedQuestions({ limit: 10, offset: 0 }, deps);

      expect(result).toEqual({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'boom' },
      });
    });

    it('loads dependencies from the container when deps are omitted', async () => {
      const deps = createDeps({
        useCaseOutput: { rows: [], limit: 10, offset: 0, totalCount: 0 },
      });

      const result = await getMissedQuestions(
        { limit: 10, offset: 0 },
        undefined,
        {
          loadContainer: async () => ({
            createReviewControllerDeps: () => deps,
          }),
        },
      );

      expect(result).toEqual({
        ok: true,
        data: { rows: [], limit: 10, offset: 0, totalCount: 0 },
      });
    });
  });
});
