import { describe, expect, it } from 'vitest';
import type { QuestionRepository } from '@/src/application/ports/repositories';
import {
  FakeAuthGateway,
  FakeQuestionRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { User } from '@/src/domain/entities';
import {
  createChoice,
  createQuestion,
  createSubscription,
  createUser,
} from '@/src/domain/test-helpers';
import { getQuestionBySlug } from './question-view-controller';

function createThrowingQuestionRepository(
  errorMessage = 'QuestionRepository should not be called',
): QuestionRepository {
  return {
    findPublishedById: async () => null,
    findPublishedBySlug: async () => {
      throw new Error(errorMessage);
    },
    findPublishedByIds: async () => [],
    listPublishedCandidateIds: async () => [],
  };
}

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  question?: ReturnType<typeof createQuestion> | null;
  questionRepository?: QuestionRepository;
}) {
  const user =
    overrides?.user === undefined
      ? createUser({
          id: 'user_1',
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })
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

  const questionRepository =
    overrides?.questionRepository ??
    new FakeQuestionRepository(overrides?.question ? [overrides.question] : []);

  return { authGateway, checkEntitlementUseCase, questionRepository };
}

describe('question-view-controller', () => {
  describe('getQuestionBySlug', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getQuestionBySlug({ slug: '' }, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await getQuestionBySlug({ slug: 'q-1' }, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({
        isEntitled: false,
        questionRepository: createThrowingQuestionRepository(),
      });

      const result = await getQuestionBySlug({ slug: 'q-1' }, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
    });

    it('returns NOT_FOUND when the question does not exist', async () => {
      const deps = createDeps({ question: null });

      const result = await getQuestionBySlug({ slug: 'q-404' }, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    });

    it('returns the question with choices when found', async () => {
      const question = createQuestion({
        id: 'question-1',
        slug: 'q-1',
        stemMd: 'Stem for q1',
        difficulty: 'medium',
        choices: [
          createChoice({
            id: 'choice-1',
            questionId: 'question-1',
            label: 'A',
            textMd: 'Choice A',
            isCorrect: false,
            sortOrder: 1,
          }),
          createChoice({
            id: 'choice-2',
            questionId: 'question-1',
            label: 'B',
            textMd: 'Choice B',
            isCorrect: true,
            sortOrder: 2,
          }),
        ],
      });

      const deps = createDeps({ question });

      const result = await getQuestionBySlug({ slug: 'q-1' }, deps as never);

      expect(result).toEqual({
        ok: true,
        data: {
          questionId: 'question-1',
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'medium',
          choices: [
            { id: 'choice-1', label: 'A', textMd: 'Choice A' },
            { id: 'choice-2', label: 'B', textMd: 'Choice B' },
          ],
        },
      });
    });
  });
});
