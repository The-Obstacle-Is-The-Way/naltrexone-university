import type { RateLimiter } from '@/src/application/ports/gateways';
import {
  FakeAuthGateway,
  FakeCountAvailableQuestionsUseCase,
  FakeDiscardPracticeSessionUseCase,
  FakeEndPracticeSessionUseCase,
  FakeFinalizeExamAnswersUseCase,
  FakeGetCompletedSessionQuestionsWithFeedbackUseCase,
  FakeGetIncompletePracticeSessionUseCase,
  FakeGetPracticeSessionReviewUseCase,
  FakeGetPracticeSessionSummaryUseCase,
  FakeGetSessionHistoryUseCase,
  FakeIdempotencyKeyRepository,
  FakeLogger,
  FakeRateLimiter,
  FakeSaveExamDraftAnswerUseCase,
  FakeSetPracticeSessionQuestionMarkUseCase,
  FakeStartPracticeSessionUseCase,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import type {
  DiscardPracticeSessionOutput,
  EndPracticeSessionOutput,
  FinalizeExamAnswersOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
  GetPracticeSessionReviewOutput,
  GetPracticeSessionSummaryOutput,
  GetSessionHistoryOutput,
  SaveExamDraftAnswerOutput,
  SetPracticeSessionQuestionMarkOutput,
  StartPracticeSessionOutput,
} from '@/src/application/use-cases';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import type { User } from '@/src/domain/entities';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import type { PracticeControllerDeps } from './practice-controller';

export type PracticeControllerTestDeps = PracticeControllerDeps & {
  countAvailableQuestionsUseCase: FakeCountAvailableQuestionsUseCase;
  getIncompletePracticeSessionUseCase: FakeGetIncompletePracticeSessionUseCase;
  getCompletedSessionQuestionsWithFeedbackUseCase: FakeGetCompletedSessionQuestionsWithFeedbackUseCase;
  startPracticeSessionUseCase: FakeStartPracticeSessionUseCase;
  discardPracticeSessionUseCase: FakeDiscardPracticeSessionUseCase;
  endPracticeSessionUseCase: FakeEndPracticeSessionUseCase;
  finalizeExamAnswersUseCase: FakeFinalizeExamAnswersUseCase;
  saveExamDraftAnswerUseCase: FakeSaveExamDraftAnswerUseCase;
  getPracticeSessionReviewUseCase: FakeGetPracticeSessionReviewUseCase;
  getPracticeSessionSummaryUseCase: FakeGetPracticeSessionSummaryUseCase;
  getSessionHistoryUseCase: FakeGetSessionHistoryUseCase;
  setPracticeSessionQuestionMarkUseCase: FakeSetPracticeSessionQuestionMarkUseCase;
  _fixtures: {
    userId: string;
  };
};

export function createDeps(overrides?: {
  user?: User | null;
  isEntitled?: boolean;
  rateLimiter?: RateLimiter;
  startOutput?: StartPracticeSessionOutput;
  startThrows?: unknown;
  countOutput?: { count: number };
  countThrows?: unknown;
  discardOutput?: DiscardPracticeSessionOutput;
  discardThrows?: unknown;
  endOutput?: EndPracticeSessionOutput;
  endThrows?: unknown;
  finalizeOutput?: FinalizeExamAnswersOutput;
  finalizeThrows?: unknown;
  saveDraftOutput?: SaveExamDraftAnswerOutput;
  saveDraftThrows?: unknown;
  reviewOutput?: GetPracticeSessionReviewOutput;
  reviewThrows?: unknown;
  summaryOutput?: GetPracticeSessionSummaryOutput;
  summaryThrows?: unknown;
  sessionHistoryOutput?: GetSessionHistoryOutput;
  sessionHistoryThrows?: unknown;
  setMarkOutput?: SetPracticeSessionQuestionMarkOutput;
  setMarkThrows?: unknown;
  incompleteOutput?: {
    sessionId: string;
    mode: 'tutor' | 'exam';
    answeredCount: number;
    totalCount: number;
    startedAt: string;
  } | null;
  incompleteThrows?: unknown;
  completedQuestionsOutput?: GetCompletedSessionQuestionsWithFeedbackOutput;
  completedQuestionsThrows?: unknown;
  now?: () => Date;
}): PracticeControllerTestDeps {
  const user =
    overrides?.user === undefined
      ? createUser({
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })
      : overrides.user;
  const userId = user?.id ?? crypto.randomUUID();

  const now = overrides?.now ?? (() => new Date('2026-02-01T00:00:00Z'));

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
    now,
  );

  const rateLimiter: RateLimiter =
    overrides?.rateLimiter ?? new FakeRateLimiter();

  const startPracticeSessionUseCase = new FakeStartPracticeSessionUseCase(
    overrides?.startOutput ?? {
      sessionId: '22222222-2222-2222-2222-222222222222',
      requestedCount: 10,
      actualCount: 10,
    },
    overrides?.startThrows,
  );

  const countAvailableQuestionsUseCase = new FakeCountAvailableQuestionsUseCase(
    overrides?.countOutput ?? { count: 0 },
    overrides?.countThrows,
  );

  const discardPracticeSessionUseCase = new FakeDiscardPracticeSessionUseCase(
    overrides?.discardOutput ?? { discarded: true },
    overrides?.discardThrows,
  );

  const endPracticeSessionUseCase = new FakeEndPracticeSessionUseCase(
    overrides?.endOutput ?? {
      sessionId: '22222222-2222-2222-2222-222222222222',
      endedAt: '2026-02-01T00:00:00.000Z',
      mode: 'tutor',
      questionCount: 1,
      totals: { answered: 0, correct: 0, accuracy: 0, durationSeconds: 0 },
    },
    overrides?.endThrows,
  );

  const getPracticeSessionReviewUseCase =
    new FakeGetPracticeSessionReviewUseCase(
      overrides?.reviewOutput ?? {
        sessionId: '22222222-2222-2222-2222-222222222222',
        mode: 'exam',
        totalCount: 1,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
      },
      overrides?.reviewThrows,
    );

  const getCompletedSessionQuestionsWithFeedbackUseCase =
    new FakeGetCompletedSessionQuestionsWithFeedbackUseCase(
      overrides?.completedQuestionsOutput ?? {
        sessionId: '22222222-2222-2222-2222-222222222222',
        mode: 'exam',
        totalCount: 1,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
      },
      overrides?.completedQuestionsThrows,
    );

  const finalizeExamAnswersUseCase = new FakeFinalizeExamAnswersUseCase(
    overrides?.finalizeOutput ?? {
      sessionId: '22222222-2222-2222-2222-222222222222',
      endedAt: '2026-02-01T00:00:00.000Z',
      mode: 'exam',
      questionCount: 1,
      totals: { answered: 0, correct: 0, accuracy: 0, durationSeconds: 0 },
    },
    overrides?.finalizeThrows,
  );

  const saveExamDraftAnswerUseCase = new FakeSaveExamDraftAnswerUseCase(
    overrides?.saveDraftOutput ?? {
      questionId: '33333333-3333-3333-3333-333333333333',
      markedForReview: false,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
      latestAnsweredAt: null,
      draftSelectedChoiceId: '44444444-4444-4444-4444-444444444444',
      draftSavedAt: new Date('2026-02-01T00:00:00.000Z'),
      draftCumulativeMs: 30_000,
    },
    overrides?.saveDraftThrows,
  );

  const getPracticeSessionSummaryUseCase =
    new FakeGetPracticeSessionSummaryUseCase(
      overrides?.summaryOutput ?? {
        sessionId: '22222222-2222-2222-2222-222222222222',
        endedAt: '2026-02-01T00:00:00.000Z',
        mode: 'tutor',
        questionCount: 0,
        totals: { answered: 0, correct: 0, accuracy: 0, durationSeconds: 0 },
      },
      overrides?.summaryThrows,
    );

  const setPracticeSessionQuestionMarkUseCase =
    new FakeSetPracticeSessionQuestionMarkUseCase(
      overrides?.setMarkOutput ?? {
        questionId: '33333333-3333-3333-3333-333333333333',
        markedForReview: true,
      },
      overrides?.setMarkThrows,
    );

  const getSessionHistoryUseCase = new FakeGetSessionHistoryUseCase(
    overrides?.sessionHistoryOutput ?? {
      rows: [],
      total: 0,
      limit: 20,
      offset: 0,
    },
    overrides?.sessionHistoryThrows,
  );

  const getIncompletePracticeSessionUseCase =
    new FakeGetIncompletePracticeSessionUseCase(
      overrides?.incompleteOutput ?? null,
      overrides?.incompleteThrows,
    );

  return {
    authGateway,
    logger: new FakeLogger(),
    rateLimiter,
    idempotencyKeyRepository: new FakeIdempotencyKeyRepository(now),
    checkEntitlementUseCase,
    getIncompletePracticeSessionUseCase,
    getCompletedSessionQuestionsWithFeedbackUseCase,
    startPracticeSessionUseCase,
    countAvailableQuestionsUseCase,
    discardPracticeSessionUseCase,
    endPracticeSessionUseCase,
    finalizeExamAnswersUseCase,
    saveExamDraftAnswerUseCase,
    getPracticeSessionReviewUseCase,
    getPracticeSessionSummaryUseCase,
    getSessionHistoryUseCase,
    setPracticeSessionQuestionMarkUseCase,
    now,
    _fixtures: {
      userId,
    },
  };
}
