import { describe, expect, it, vi } from 'vitest';
import { getMissedQuestions } from '@/src/adapters/controllers/review-controller';
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
  logger?: Logger;
}) {
  const user = overrides?.user ?? createUser({ id: 'user_1' });
  const isEntitled = overrides?.isEntitled ?? true;
  const attempts = overrides?.attempts ?? [];
  const questionsById = overrides?.questionsById ?? {};

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
      throw new Error('findByUserId should not be called by review-controller');
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
    listMissedQuestionsByUserId: vi.fn(
      async (_userId: string, limit: number, offset: number) => {
        const mostRecentByQuestionId = new Map<string, Attempt>();
        for (const attempt of attempts) {
          const existing = mostRecentByQuestionId.get(attempt.questionId);
          if (!existing || attempt.answeredAt > existing.answeredAt) {
            mostRecentByQuestionId.set(attempt.questionId, attempt);
          }
        }

        return [...mostRecentByQuestionId.values()]
          .filter((a) => !a.isCorrect)
          .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())
          .slice(offset, offset + limit)
          .map((a) => ({ questionId: a.questionId, answeredAt: a.answeredAt }));
      },
    ),
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
    logger: overrides?.logger,
  };
}

describe('review-controller', () => {
  describe('getMissedQuestions', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getMissedQuestions(
        { limit: 0, offset: -1 },
        deps as never,
      );

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

      const result = await getMissedQuestions(
        { limit: 10, offset: 0 },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getMissedQuestions(
        { limit: 10, offset: 0 },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
      expect(deps.attemptRepository.findByUserId).not.toHaveBeenCalled();
    });

    it('returns missed questions based on most recent attempt only', async () => {
      const deps = createDeps({
        attempts: [
          createAttempt({
            questionId: 'q1',
            isCorrect: false,
            answeredAt: new Date('2026-02-01T12:00:00Z'),
          }),
          createAttempt({
            questionId: 'q1',
            isCorrect: true,
            answeredAt: new Date('2026-02-01T11:00:00Z'),
          }),
          createAttempt({
            questionId: 'q2',
            isCorrect: false,
            answeredAt: new Date('2026-02-01T10:00:00Z'),
          }),
          createAttempt({
            questionId: 'q3',
            isCorrect: true,
            answeredAt: new Date('2026-02-01T09:00:00Z'),
          }),
        ],
        questionsById: {
          q1: createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
          q2: createQuestion({ id: 'q2', slug: 'q-2', stemMd: 'Stem for q2' }),
          q3: createQuestion({ id: 'q3', slug: 'q-3', stemMd: 'Stem for q3' }),
        },
      });

      const result = await getMissedQuestions(
        { limit: 10, offset: 0 },
        deps as never,
      );

      expect(result).toEqual({
        ok: true,
        data: {
          rows: [
            {
              questionId: 'q1',
              slug: 'q-1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              lastAnsweredAt: '2026-02-01T12:00:00.000Z',
            },
            {
              questionId: 'q2',
              slug: 'q-2',
              stemMd: 'Stem for q2',
              difficulty: 'easy',
              lastAnsweredAt: '2026-02-01T10:00:00.000Z',
            },
          ],
          limit: 10,
          offset: 0,
        },
      });
    });

    it('loads dependencies from the container when deps are omitted', async () => {
      vi.resetModules();

      const deps = createDeps({
        attempts: [
          createAttempt({
            questionId: 'q1',
            isCorrect: false,
            answeredAt: new Date('2026-02-01T12:00:00Z'),
          }),
        ],
        questionsById: {
          q1: createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
        },
      });

      vi.doMock('@/lib/container', () => ({
        createContainer: () => ({
          createReviewControllerDeps: () => deps,
        }),
      }));

      const { getMissedQuestions } = await import('./review-controller');

      const result = await getMissedQuestions({ limit: 10, offset: 0 });

      expect(result).toEqual({
        ok: true,
        data: {
          rows: [
            {
              questionId: 'q1',
              slug: 'q-1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              lastAnsweredAt: '2026-02-01T12:00:00.000Z',
            },
          ],
          limit: 10,
          offset: 0,
        },
      });
    });

    it('logs warning when missed question references missing question', async () => {
      const orphanedQuestionId = 'q-orphaned';
      const logger: Logger = { warn: vi.fn() };
      const deps = createDeps({
        attempts: [
          createAttempt({
            questionId: orphanedQuestionId,
            isCorrect: false,
            answeredAt: new Date('2026-02-01T12:00:00Z'),
          }),
        ],
        questionsById: {},
        logger,
      });

      const result = await getMissedQuestions(
        { limit: 10, offset: 0 },
        deps as never,
      );

      expect(result).toEqual({
        ok: true,
        data: { rows: [], limit: 10, offset: 0 },
      });
      expect(logger.warn).toHaveBeenCalledWith(
        { questionId: orphanedQuestionId },
        'Missed question references missing question',
      );
    });

    it('works without logger (optional dependency)', async () => {
      const orphanedQuestionId = 'q-orphaned';
      const deps = createDeps({
        attempts: [
          createAttempt({
            questionId: orphanedQuestionId,
            isCorrect: false,
            answeredAt: new Date('2026-02-01T12:00:00Z'),
          }),
        ],
        questionsById: {},
      });

      const result = await getMissedQuestions(
        { limit: 10, offset: 0 },
        deps as never,
      );

      expect(result).toEqual({
        ok: true,
        data: { rows: [], limit: 10, offset: 0 },
      });
    });
  });
});
