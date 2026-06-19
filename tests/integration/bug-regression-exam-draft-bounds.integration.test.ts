import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { PracticeSessionParams } from '@/db/schema';
import * as schema from '@/db/schema';
import {
  type PracticeControllerDeps,
  saveExamDraftAnswer,
} from '@/src/adapters/controllers/practice-controller';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
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
  FakeSetPracticeSessionQuestionMarkUseCase,
  FakeStartPracticeSessionUseCase,
  FakeSubscriptionRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import { FinalizeExamAnswersUseCase } from '@/src/application/use-cases/finalize-exam-answers';
import {
  SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS,
  SaveExamDraftAnswerUseCase,
} from '@/src/application/use-cases/save-exam-draft-answer';
import { MS_PER_SECOND } from '@/src/domain/services';
import {
  createUser as createDomainUser,
  createSubscription,
} from '@/src/domain/test-helpers';
import {
  cleanup,
  createQuestion,
  createUser,
  db,
} from './bug-regression-test-helpers';

function createFinalizeExamAnswersUseCase() {
  return new FinalizeExamAnswersUseCase(
    new DrizzleQuestionRepository(db),
    new DrizzleAttemptRepository(db),
    new DrizzlePracticeSessionRepository(db),
    async (fn) =>
      db.transaction(async (tx) =>
        fn({
          questions: new DrizzleQuestionRepository(tx),
          attempts: new DrizzleAttemptRepository(tx),
          sessions: new DrizzlePracticeSessionRepository(tx),
        }),
      ),
  );
}

function createPracticeControllerDepsForBug238(input: {
  userId: string;
  email: string;
}): PracticeControllerDeps {
  const now = () => new Date('2026-04-25T12:00:00.000Z');
  const user = createDomainUser({
    id: input.userId,
    email: input.email,
    createdAt: new Date('2026-04-25T00:00:00.000Z'),
    updatedAt: new Date('2026-04-25T00:00:00.000Z'),
  });
  const questions = new DrizzleQuestionRepository(db);
  const sessions = new DrizzlePracticeSessionRepository(db, now);

  return {
    authGateway: new FakeAuthGateway(user),
    logger: new FakeLogger(),
    rateLimiter: new FakeRateLimiter(),
    idempotencyKeyRepository: new FakeIdempotencyKeyRepository(now),
    checkEntitlementUseCase: new CheckEntitlementUseCase(
      new FakeSubscriptionRepository([
        createSubscription({
          userId: user.id,
          currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        }),
      ]),
      now,
    ),
    getIncompletePracticeSessionUseCase:
      new FakeGetIncompletePracticeSessionUseCase(null),
    getCompletedSessionQuestionsWithFeedbackUseCase:
      new FakeGetCompletedSessionQuestionsWithFeedbackUseCase({
        sessionId: '11111111-1111-1111-1111-111111111111',
        mode: 'exam',
        totalCount: 1,
        answeredCount: 0,
        markedCount: 0,
        rows: [],
      }),
    startPracticeSessionUseCase: new FakeStartPracticeSessionUseCase({
      sessionId: '11111111-1111-1111-1111-111111111111',
      requestedCount: 1,
      actualCount: 1,
    }),
    countAvailableQuestionsUseCase: new FakeCountAvailableQuestionsUseCase({
      count: 1,
    }),
    discardPracticeSessionUseCase: new FakeDiscardPracticeSessionUseCase({
      discarded: true,
    }),
    endPracticeSessionUseCase: new FakeEndPracticeSessionUseCase({
      sessionId: '11111111-1111-1111-1111-111111111111',
      endedAt: '2026-04-25T12:00:00.000Z',
      mode: 'exam',
      questionCount: 1,
      totals: { answered: 0, correct: 0, accuracy: 0, durationSeconds: 0 },
    }),
    finalizeExamAnswersUseCase: new FakeFinalizeExamAnswersUseCase({
      sessionId: '11111111-1111-1111-1111-111111111111',
      endedAt: '2026-04-25T12:00:00.000Z',
      mode: 'exam',
      questionCount: 1,
      totals: { answered: 0, correct: 0, accuracy: 0, durationSeconds: 0 },
    }),
    saveExamDraftAnswerUseCase: new SaveExamDraftAnswerUseCase(
      questions,
      sessions,
    ),
    getPracticeSessionReviewUseCase: new FakeGetPracticeSessionReviewUseCase({
      sessionId: '11111111-1111-1111-1111-111111111111',
      mode: 'exam',
      totalCount: 1,
      answeredCount: 0,
      markedCount: 0,
      rows: [],
    }),
    getPracticeSessionSummaryUseCase: new FakeGetPracticeSessionSummaryUseCase({
      sessionId: '11111111-1111-1111-1111-111111111111',
      endedAt: '2026-04-25T12:00:00.000Z',
      mode: 'exam',
      questionCount: 1,
      totals: { answered: 0, correct: 0, accuracy: 0, durationSeconds: 0 },
    }),
    getSessionHistoryUseCase: new FakeGetSessionHistoryUseCase({
      rows: [],
      total: 0,
      limit: 20,
      offset: 0,
    }),
    setPracticeSessionQuestionMarkUseCase:
      new FakeSetPracticeSessionQuestionMarkUseCase({
        questionId: '22222222-2222-2222-2222-222222222222',
        markedForReview: true,
      }),
    now,
  };
}

// ---------------------------------------------------------------------------
// BUG-238: Exam draft cumulativeMs is bounded
// ---------------------------------------------------------------------------

describe('BUG-238: Exam draft cumulativeMs is bounded', () => {
  it('rejects oversized cumulativeMs without persisting draft state', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug238-draft-reject-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    const result = await saveExamDraftAnswer(
      {
        sessionId: session.id,
        questionId: question.id,
        selectedChoiceId: question.correctChoiceId,
        cumulativeMs: SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS + 1,
      },
      createPracticeControllerDepsForBug238({
        userId: user.id,
        email: user.email,
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        fieldErrors: {
          cumulativeMs: expect.any(Array),
        },
      },
    });

    const [row] = await db
      .select({ paramsJson: schema.practiceSessions.paramsJson })
      .from(schema.practiceSessions)
      .where(eq(schema.practiceSessions.id, session.id));
    const state = row?.paramsJson.questionStates?.find(
      (questionState) => questionState.questionId === question.id,
    );
    expect(state).toMatchObject({
      questionId: question.id,
      draftSelectedChoiceId: null,
      draftCumulativeMs: 0,
    });
  });

  it('caps legacy oversized draftCumulativeMs during finalization without overflowing attempts.time_spent_seconds', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug238-finalize-cap-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    const poisonedParams: PracticeSessionParams = {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [question.id],
      questionStates: [
        {
          questionId: question.id,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
          draftSelectedChoiceId: question.correctChoiceId,
          draftSavedAt: '2026-04-25T12:00:00.000Z',
          draftCumulativeMs: Number.MAX_SAFE_INTEGER,
        },
      ],
    };
    await db
      .update(schema.practiceSessions)
      .set({ paramsJson: poisonedParams })
      .where(eq(schema.practiceSessions.id, session.id));

    await expect(
      createFinalizeExamAnswersUseCase().execute({
        userId: user.id,
        sessionId: session.id,
      }),
    ).resolves.toMatchObject({
      sessionId: session.id,
      mode: 'exam',
      totals: {
        answered: 1,
        correct: 1,
      },
    });

    const rows = await new DrizzleAttemptRepository(db).findBySessionId(
      session.id,
      user.id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.timeSpentSeconds).toBe(
      SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS / MS_PER_SECOND,
    );
  });
});

// ---------------------------------------------------------------------------
// BUG-252: Time-only exam drafts are persisted
// ---------------------------------------------------------------------------

describe('BUG-252: unanswered exam draft time is persisted', () => {
  it('round-trips a nullable draft choice and preserves the monotonic guard', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug252-time-only-draft-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const questions = new DrizzleQuestionRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db);
    const saveDraft = new SaveExamDraftAnswerUseCase(questions, sessions);
    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await saveDraft.execute({
      userId: user.id,
      sessionId: session.id,
      questionId: question.id,
      selectedChoiceId: null,
      cumulativeMs: 15_000,
    });

    await sessions.saveDraftAnswer({
      userId: user.id,
      sessionId: session.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      cumulativeMs: 10_000,
    });

    const persisted = await sessions.findByIdAndUserId(session.id, user.id);
    const state = persisted?.questionStates.find(
      (questionState) => questionState.questionId === question.id,
    );
    expect(state).toMatchObject({
      questionId: question.id,
      draftSelectedChoiceId: null,
      draftCumulativeMs: 15_000,
    });
    expect(state?.draftSavedAt).toEqual(expect.any(Date));
  });
});
