import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type { QuestionRepository } from '@/src/application/ports/repositories';
import {
  createChoice,
  createQuestion,
  createUser,
} from '@/src/domain/test-helpers';
import { getQuestionBySlug } from './question-view-controller';

type CheckEntitlementUseCase = {
  execute: (input: { userId: string }) => Promise<{ isEntitled: boolean }>;
};

function createDeps(overrides?: {
  authGateway?: Partial<AuthGateway>;
  isEntitled?: boolean;
  question?: ReturnType<typeof createQuestion> | null;
}) {
  const user = createUser({
    id: 'user_1',
    email: 'user@example.com',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
  });

  const authGateway: AuthGateway = {
    getCurrentUser: async () => user,
    requireUser: async () => user,
    ...overrides?.authGateway,
  };

  const checkEntitlementUseCase: CheckEntitlementUseCase = {
    execute: vi.fn(async () => ({ isEntitled: overrides?.isEntitled ?? true })),
  };

  const question = overrides?.question ?? null;

  const questionRepository: QuestionRepository = {
    findPublishedById: vi.fn(async () => null),
    findPublishedBySlug: vi.fn(async () => question),
    findPublishedByIds: vi.fn(async () => []),
    listPublishedCandidateIds: vi.fn(async () => []),
  };

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
      const deps = createDeps({
        authGateway: {
          requireUser: async () => {
            throw new ApplicationError('UNAUTHENTICATED', 'No session');
          },
        },
      });

      const result = await getQuestionBySlug({ slug: 'q-1' }, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getQuestionBySlug({ slug: 'q-1' }, deps as never);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(
        deps.questionRepository.findPublishedBySlug,
      ).not.toHaveBeenCalled();
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
