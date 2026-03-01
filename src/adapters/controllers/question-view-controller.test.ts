import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import type { QuestionRepository } from '@/src/application/ports/repositories';
import { buildShuffledChoiceViews } from '@/src/application/shared/shuffled-choice-views';
import {
  FakeAuthGateway,
  FakeLogger,
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
import {
  getPreviousAttempt,
  getQuestionBySlug,
} from './question-view-controller';

function mapChoicesForOutput(
  question: ReturnType<typeof createQuestion>,
  userId: string,
) {
  return buildShuffledChoiceViews(question, userId).map((choice) => ({
    id: choice.choiceId,
    label: choice.displayLabel,
    textMd: choice.textMd,
  }));
}

function findUserIdWithNonCanonicalShuffle(
  question: ReturnType<typeof createQuestion>,
) {
  if (question.choices.length <= 1) {
    throw new Error(
      `Test setup requires at least 2 choices (received ${question.choices.length})`,
    );
  }

  const canonicalChoices = question.choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    textMd: choice.textMd,
  }));

  // buildShuffledChoiceViews uses a deterministic shuffle based on userId and questionId.
  // To ensure the tests would fail if the controller returned canonical order, probe
  // multiple userIds until we find one whose shuffle differs from the canonical mapping.
  for (let i = 0; i < 50; i++) {
    const userId = `user_${i + 1}`;
    const shuffledChoices = mapChoicesForOutput(question, userId);
    if (JSON.stringify(shuffledChoices) !== JSON.stringify(canonicalChoices)) {
      return userId;
    }
  }

  throw new Error(
    'Test setup failed: no userId produced non-canonical shuffle output',
  );
}

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
    countPublishedCandidateIds: async () => 0,
  };
}

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  question?: ReturnType<typeof createQuestion> | null;
  logger?: FakeLogger;
  questionRepository?: QuestionRepository;
  getPreviousAttemptUseCase?: {
    execute: (input: {
      userId: string;
      questionId: string;
      attemptId?: string;
      sessionId?: string;
    }) => Promise<unknown>;
  };
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
  const logger = overrides?.logger ?? new FakeLogger();

  const getPreviousAttemptUseCase =
    overrides?.getPreviousAttemptUseCase ??
    ({
      execute: async () => {
        throw new Error('getPreviousAttemptUseCase should not be called');
      },
    } satisfies {
      execute: (input: {
        userId: string;
        questionId: string;
        attemptId?: string;
        sessionId?: string;
      }) => Promise<unknown>;
    });

  return {
    authGateway,
    checkEntitlementUseCase,
    logger,
    questionRepository,
    getPreviousAttemptUseCase,
  };
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

      const userId = findUserIdWithNonCanonicalShuffle(question);
      const deps = createDeps({ question, user: createUser({ id: userId }) });

      const result = await getQuestionBySlug({ slug: 'q-1' }, deps as never);

      expect(result).toEqual({
        ok: true,
        data: {
          questionId: 'question-1',
          slug: 'q-1',
          stemMd: 'Stem for q1',
          difficulty: 'medium',
          choices: mapChoicesForOutput(question, userId),
        },
      });
    });

    it('returns shuffled labels consistent with buildShuffledChoiceViews', async () => {
      const question = createQuestion({
        id: 'question-2',
        slug: 'q-2',
        stemMd: 'Stem for q2',
        difficulty: 'hard',
        choices: [
          createChoice({
            id: 'choice-a',
            questionId: 'question-2',
            label: 'A',
            textMd: 'Choice A',
            isCorrect: false,
            sortOrder: 1,
          }),
          createChoice({
            id: 'choice-b',
            questionId: 'question-2',
            label: 'B',
            textMd: 'Choice B',
            isCorrect: false,
            sortOrder: 2,
          }),
          createChoice({
            id: 'choice-c',
            questionId: 'question-2',
            label: 'C',
            textMd: 'Choice C',
            isCorrect: true,
            sortOrder: 3,
          }),
          createChoice({
            id: 'choice-d',
            questionId: 'question-2',
            label: 'D',
            textMd: 'Choice D',
            isCorrect: false,
            sortOrder: 4,
          }),
        ],
      });

      const userId = findUserIdWithNonCanonicalShuffle(question);
      const deps = createDeps({ question, user: createUser({ id: userId }) });

      const result = await getQuestionBySlug({ slug: 'q-2' }, deps as never);

      expect(result).toEqual({
        ok: true,
        data: {
          questionId: 'question-2',
          slug: 'q-2',
          stemMd: 'Stem for q2',
          difficulty: 'hard',
          choices: mapChoicesForOutput(question, userId),
        },
      });
    });
  });

  describe('getPreviousAttempt', () => {
    class ThrowingInfoLogger extends FakeLogger {
      override info(_context: Record<string, unknown>, _msg: string): void {
        throw new Error('logger info failed');
      }
    }

    class ThrowingWarnLogger extends FakeLogger {
      override warn(_context: Record<string, unknown>, _msg: string): void {
        throw new Error('logger warn failed');
      }
    }

    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getPreviousAttempt(
        { questionId: '' },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns VALIDATION_ERROR when both attemptId and sessionId are provided', async () => {
      const deps = createDeps();

      const result = await getPreviousAttempt(
        {
          questionId: 'q1',
          attemptId: '00000000-0000-4000-8000-000000000001',
          sessionId: '00000000-0000-4000-8000-000000000002',
        },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await getPreviousAttempt(
        { questionId: 'q1' },
        deps as never,
      );

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

      const result = await getPreviousAttempt(
        { questionId: 'q1' },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
    });

    it('passes attemptId to use case when provided', async () => {
      const userId = 'user_1';
      const questionId = 'q1';
      const attemptId = '00000000-0000-4000-8000-000000000001';

      let receivedInput: {
        userId: string;
        questionId: string;
        attemptId?: string;
      } | null = null;
      const deps = createDeps({
        getPreviousAttemptUseCase: {
          execute: async (input) => {
            receivedInput = input;
            return null;
          },
        },
        user: createUser({ id: userId }),
      });

      const result = await getPreviousAttempt(
        { questionId, attemptId },
        deps as never,
      );

      expect(receivedInput).toEqual({ userId, questionId, attemptId });
      expect(result).toEqual({ ok: true, data: null });
    });

    it('passes sessionId to use case when provided', async () => {
      const userId = 'user_1';
      const questionId = 'q1';
      const sessionId = '00000000-0000-4000-8000-000000000002';

      let receivedInput: {
        userId: string;
        questionId: string;
        sessionId?: string;
      } | null = null;
      const deps = createDeps({
        getPreviousAttemptUseCase: {
          execute: async (input) => {
            receivedInput = input;
            return null;
          },
        },
        user: createUser({ id: userId }),
      });

      const result = await getPreviousAttempt(
        { questionId, sessionId },
        deps as never,
      );

      expect(receivedInput).toEqual({ userId, questionId, sessionId });
      expect(result).toEqual({ ok: true, data: null });
    });

    it('returns the previous attempt when found', async () => {
      const userId = 'user_1';
      const questionId = 'q1';
      const logger = new FakeLogger();

      let receivedInput: {
        userId: string;
        questionId: string;
        attemptId?: string;
      } | null = null;
      const deps = createDeps({
        logger,
        getPreviousAttemptUseCase: {
          execute: async (input) => {
            receivedInput = input;
            return {
              kind: 'attempt',
              attemptId: 'attempt_1',
              selectedChoiceId: 'choice_1',
              isCorrect: true,
              correctChoiceId: 'choice_1',
              explanationMd: 'Explanation',
              choiceExplanations: [],
              answeredAt: '2026-02-01T00:00:00.000Z',
            };
          },
        },
        user: createUser({ id: userId }),
      });

      const result = await getPreviousAttempt({ questionId }, deps as never);

      expect(receivedInput).toEqual({ userId, questionId });
      expect(result).toEqual({
        ok: true,
        data: {
          kind: 'attempt',
          attemptId: 'attempt_1',
          selectedChoiceId: 'choice_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Explanation',
          choiceExplanations: [],
          answeredAt: '2026-02-01T00:00:00.000Z',
        },
      });
      expect(logger.infoCalls).toContainEqual({
        context: {
          event: 'review_hydration_outcome',
          mode: 'review',
          outcome: 'attempt',
          hasAttemptId: false,
          hasSessionId: false,
          questionId: 'q1',
          userId: 'user_1',
        },
        msg: 'Review hydration outcome',
      });
    });

    it('returns the previous attempt when hydration telemetry info logging throws', async () => {
      const userId = 'user_1';
      const questionId = 'q1';
      const logger = new ThrowingInfoLogger();

      const deps = createDeps({
        logger,
        getPreviousAttemptUseCase: {
          execute: async () => ({
            kind: 'attempt',
            attemptId: 'attempt_1',
            selectedChoiceId: 'choice_1',
            isCorrect: true,
            correctChoiceId: 'choice_1',
            explanationMd: 'Explanation',
            choiceExplanations: [],
            answeredAt: '2026-02-01T00:00:00.000Z',
          }),
        },
        user: createUser({ id: userId }),
      });

      const result = await getPreviousAttempt({ questionId }, deps as never);

      expect(result).toEqual({
        ok: true,
        data: {
          kind: 'attempt',
          attemptId: 'attempt_1',
          selectedChoiceId: 'choice_1',
          isCorrect: true,
          correctChoiceId: 'choice_1',
          explanationMd: 'Explanation',
          choiceExplanations: [],
          answeredAt: '2026-02-01T00:00:00.000Z',
        },
      });
    });

    it('returns NOT_FOUND when attemptId does not match questionId', async () => {
      const deps = createDeps({
        getPreviousAttemptUseCase: {
          execute: async () => {
            throw new ApplicationError(
              'NOT_FOUND',
              'Previous attempt does not belong to the requested question',
            );
          },
        },
      });

      const result = await getPreviousAttempt(
        { questionId: 'q1' },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    });

    it('emits session_unanswered hydration telemetry when unanswered session reveal is returned', async () => {
      const logger = new FakeLogger();
      const deps = createDeps({
        logger,
        getPreviousAttemptUseCase: {
          execute: async () => ({
            kind: 'session_unanswered',
            correctChoiceId: 'choice_2',
            explanationMd: 'Explanation',
            referenceMd: null,
            choiceExplanations: [],
          }),
        },
      });

      const result = await getPreviousAttempt(
        { questionId: 'q1', sessionId: '00000000-0000-4000-8000-000000000001' },
        deps as never,
      );

      expect(result).toEqual({
        ok: true,
        data: {
          kind: 'session_unanswered',
          correctChoiceId: 'choice_2',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        },
      });
      expect(logger.infoCalls).toContainEqual({
        context: {
          event: 'review_hydration_outcome',
          mode: 'review',
          outcome: 'session_unanswered',
          hasAttemptId: false,
          hasSessionId: true,
          questionId: 'q1',
          userId: 'user_1',
        },
        msg: 'Review hydration outcome',
      });
    });

    it('returns null when there is no previous attempt', async () => {
      const logger = new FakeLogger();
      const deps = createDeps({
        logger,
        getPreviousAttemptUseCase: {
          execute: async () => null,
        },
      });

      const result = await getPreviousAttempt(
        { questionId: 'q1' },
        deps as never,
      );

      expect(result).toEqual({ ok: true, data: null });
      expect(logger.infoCalls).toContainEqual({
        context: {
          event: 'review_hydration_outcome',
          mode: 'review',
          outcome: 'no_prior_attempt',
          hasAttemptId: false,
          hasSessionId: false,
          questionId: 'q1',
          userId: 'user_1',
        },
        msg: 'Review hydration outcome',
      });
    });

    it('emits hydration_error telemetry when getPreviousAttempt use case throws', async () => {
      const logger = new FakeLogger();
      const deps = createDeps({
        logger,
        getPreviousAttemptUseCase: {
          execute: async () => {
            throw new ApplicationError('INTERNAL_ERROR', 'Boom');
          },
        },
      });

      const result = await getPreviousAttempt(
        { questionId: 'q1' },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'INTERNAL_ERROR' },
      });
      expect(logger.warnCalls).toContainEqual({
        context: {
          event: 'review_hydration_outcome',
          mode: 'review',
          outcome: 'hydration_error',
          hasAttemptId: false,
          hasSessionId: false,
          questionId: 'q1',
          userId: 'user_1',
          errorCode: 'INTERNAL_ERROR',
        },
        msg: 'Review hydration outcome',
      });
    });

    it('preserves the original use-case error when hydration telemetry warn logging throws', async () => {
      const logger = new ThrowingWarnLogger();
      const deps = createDeps({
        logger,
        getPreviousAttemptUseCase: {
          execute: async () => {
            throw new ApplicationError('NOT_FOUND', 'Previous attempt missing');
          },
        },
      });

      const result = await getPreviousAttempt(
        { questionId: 'q1' },
        deps as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    });
  });
});
