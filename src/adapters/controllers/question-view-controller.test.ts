import { describe, expect, it } from 'vitest';
import type { QuestionRepository } from '@/src/application/ports/repositories';
import { buildShuffledChoiceViews } from '@/src/application/shared/shuffled-choice-views';
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
  };
}

function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  question?: ReturnType<typeof createQuestion> | null;
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

      let receivedInput: {
        userId: string;
        questionId: string;
        attemptId?: string;
      } | null = null;
      const deps = createDeps({
        getPreviousAttemptUseCase: {
          execute: async (input) => {
            receivedInput = input;
            return {
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

    it('returns null when there is no previous attempt', async () => {
      const deps = createDeps({
        getPreviousAttemptUseCase: {
          execute: async () => null,
        },
      });

      const result = await getPreviousAttempt(
        { questionId: 'q1' },
        deps as never,
      );

      expect(result).toEqual({ ok: true, data: null });
    });
  });
});
