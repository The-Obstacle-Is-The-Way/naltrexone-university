import { describe, expect, it } from 'vitest';
import type { Logger } from '@/src/application/ports/logger';
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
import { getMissedQuestions } from './review-controller';

class FakeLogger implements Logger {
  readonly warnCalls: Array<{ context: Record<string, unknown>; msg: string }> =
    [];

  debug(_context: Record<string, unknown>, _msg: string): void {}

  info(_context: Record<string, unknown>, _msg: string): void {}

  warn(context: Record<string, unknown>, msg: string): void {
    this.warnCalls.push({ context, msg });
  }

  error(_context: Record<string, unknown>, _msg: string): void {}
}

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  attempts?: readonly Attempt[];
  questions?: readonly Question[];
  logger?: Logger;
}) {
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

  return {
    authGateway,
    checkEntitlementUseCase,
    attemptRepository: new FakeAttemptRepository(overrides?.attempts ?? []),
    questionRepository: new FakeQuestionRepository(overrides?.questions ?? []),
    logger: overrides?.logger ?? new FakeLogger(),
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
      const deps = createDeps({ user: null });

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
      deps.attemptRepository.listMissedQuestionsByUserId = async () => {
        throw new Error('AttemptRepository should not be called');
      };

      const result = await getMissedQuestions(
        { limit: 10, offset: 0 },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
    });

    it('returns empty rows when there are no missed questions', async () => {
      const deps = createDeps({ attempts: [], questions: [] });

      const result = await getMissedQuestions(
        { limit: 10, offset: 0 },
        deps as never,
      );

      expect(result).toEqual({
        ok: true,
        data: {
          rows: [],
          limit: 10,
          offset: 0,
        },
      });
    });

    it('returns missed questions based on most recent attempt only', async () => {
      const deps = createDeps({
        attempts: [
          createAttempt({
            userId: 'user_1',
            questionId: 'q1',
            isCorrect: false,
            answeredAt: new Date('2026-02-01T12:00:00Z'),
          }),
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
            answeredAt: new Date('2026-02-01T10:00:00Z'),
          }),
          createAttempt({
            userId: 'user_1',
            questionId: 'q3',
            isCorrect: true,
            answeredAt: new Date('2026-02-01T09:00:00Z'),
          }),
        ],
        questions: [
          createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
          createQuestion({ id: 'q2', slug: 'q-2', stemMd: 'Stem for q2' }),
          createQuestion({ id: 'q3', slug: 'q-3', stemMd: 'Stem for q3' }),
        ],
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
              isAvailable: true,
              questionId: 'q1',
              slug: 'q-1',
              stemMd: 'Stem for q1',
              difficulty: 'easy',
              lastAnsweredAt: '2026-02-01T12:00:00.000Z',
            },
            {
              isAvailable: true,
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
      const deps = createDeps({
        attempts: [
          createAttempt({
            userId: 'user_1',
            questionId: 'q1',
            isCorrect: false,
            answeredAt: new Date('2026-02-01T12:00:00Z'),
          }),
        ],
        questions: [
          createQuestion({ id: 'q1', slug: 'q-1', stemMd: 'Stem for q1' }),
        ],
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
        data: {
          rows: [
            {
              isAvailable: true,
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
      const logger = new FakeLogger();

      const deps = createDeps({
        attempts: [
          createAttempt({
            userId: 'user_1',
            questionId: orphanedQuestionId,
            isCorrect: false,
            answeredAt: new Date('2026-02-01T12:00:00Z'),
          }),
        ],
        questions: [],
        logger,
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
              isAvailable: false,
              questionId: orphanedQuestionId,
              lastAnsweredAt: '2026-02-01T12:00:00.000Z',
            },
          ],
          limit: 10,
          offset: 0,
        },
      });
      expect(logger.warnCalls).toEqual([
        {
          context: { questionId: orphanedQuestionId },
          msg: 'Missed question references missing question',
        },
      ]);
    });
  });
});
