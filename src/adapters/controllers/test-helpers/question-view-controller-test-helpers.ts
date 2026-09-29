import type { QuestionRepository } from '@/src/application/ports/repositories';
import {
  FakeAttemptRepository,
  FakeAuthGateway,
  FakeLogger,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import { GetQuestionForViewUseCase } from '@/src/application/use-cases/get-question-for-view';
import type { Attempt, User } from '@/src/domain/entities';
import {
  type createQuestion,
  createSubscription,
  createUser,
} from '@/src/domain/test-helpers';

// Shared by the question-view controller suites: an authenticated, entitled
// learner over fakes unless an override says otherwise.
export function createQuestionViewControllerDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  question?: ReturnType<typeof createQuestion> | null;
  attempts?: Attempt[];
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
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })
      : overrides.user;
  const userId = user?.id ?? crypto.randomUUID();

  const authGateway = new FakeAuthGateway(user);

  const subscriptionRepository = new FakeSubscriptionRepository(
    overrides?.isEntitled === false
      ? []
      : [
          createSubscription({
            userId,
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
    getQuestionForViewUseCase: new GetQuestionForViewUseCase(
      questionRepository,
      new FakeAttemptRepository(overrides?.attempts ?? []),
      new FakePracticeSessionRepository([]),
    ),
    getPreviousAttemptUseCase,
    _fixtures: {
      userId,
    },
  };
}
