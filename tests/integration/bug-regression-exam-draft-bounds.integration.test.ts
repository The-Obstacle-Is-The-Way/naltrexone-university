import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  finalizeExamAnswers,
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
import { GetPracticeSessionTimingUseCase } from '@/src/application/use-cases/get-practice-session-timing';
import {
  SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS,
  SaveExamDraftAnswerUseCase,
} from '@/src/application/use-cases/save-exam-draft-answer';
import { SUBMIT_ANSWER_MAX_TIME_SPENT_SECONDS } from '@/src/application/use-cases/submit-answer';
import {
  DAY_MS,
  EXAM_SECONDS_PER_QUESTION,
  MS_PER_SECOND,
} from '@/src/domain/services';
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

function createPracticeControllerDepsForBug238(input: {
  userId: string;
  email: string;
  finalizeExamAnswersUseCase?: PracticeControllerDeps['finalizeExamAnswersUseCase'];
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
    getPracticeSessionTimingUseCase: new GetPracticeSessionTimingUseCase(
      sessions,
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
      totals: {
        answered: 0,
        scored: 1,
        correct: 0,
        accuracy: 0,
        durationSeconds: 0,
      },
    }),
    finalizeExamAnswersUseCase:
      input.finalizeExamAnswersUseCase ??
      new FakeFinalizeExamAnswersUseCase({
        sessionId: '11111111-1111-1111-1111-111111111111',
        endedAt: '2026-04-25T12:00:00.000Z',
        mode: 'exam',
        questionCount: 1,
        totals: {
          answered: 0,
          scored: 1,
          correct: 0,
          accuracy: 0,
          durationSeconds: 0,
        },
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
      scoredUnansweredCount: 1,
      markedCount: 0,
      rows: [],
    }),
    getPracticeSessionSummaryUseCase: new FakeGetPracticeSessionSummaryUseCase({
      sessionId: '11111111-1111-1111-1111-111111111111',
      endedAt: '2026-04-25T12:00:00.000Z',
      mode: 'exam',
      questionCount: 1,
      totals: {
        answered: 0,
        scored: 1,
        correct: 0,
        accuracy: 0,
        durationSeconds: 0,
      },
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

// One exam question allots 72 seconds (EXAM_SECONDS_PER_QUESTION).
const ONE_QUESTION_DEADLINE_MS = EXAM_SECONDS_PER_QUESTION * MS_PER_SECOND;

function createExamFinalizerAt(now: Date): FinalizeExamAnswersUseCase {
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
    () => now,
  );
}

// ---------------------------------------------------------------------------
// BUG-238: Exam draft cumulativeMs is bounded
// ---------------------------------------------------------------------------

describe('BUG-238 and BUG-371: exam draft time is capped at a day', () => {
  it('BUG-371 stores a day when a draft save carries more than a day', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug371-draft-cap-${randomUUID()}`,
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
      ok: true,
      data: { draftCumulativeMs: SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS },
    });

    const [row] = await db
      .select({
        draftSelectedChoiceId:
          schema.practiceSessionQuestionStates.draftSelectedChoiceId,
        draftCumulativeMs:
          schema.practiceSessionQuestionStates.draftCumulativeMs,
      })
      .from(schema.practiceSessionQuestionStates)
      .where(
        and(
          eq(
            schema.practiceSessionQuestionStates.practiceSessionId,
            session.id,
          ),
          eq(schema.practiceSessionQuestionStates.questionId, question.id),
        ),
      );
    expect(row).toEqual({
      draftSelectedChoiceId: question.correctChoiceId,
      draftCumulativeMs: SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS,
    });
  });

  it('BUG-371 finishes an expired exam whose final draft carries more than a day', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug371-finalize-cap-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attempts = new DrizzleAttemptRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db);
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
    // One question allots 72 seconds; a second past the deadline is inside
    // the final draft's grace window, so the draft is graded.
    const finalizeExamAnswersUseCase = createExamFinalizerAt(
      new Date(session.startedAt.getTime() + ONE_QUESTION_DEADLINE_MS + 1_000),
    );

    const result = await finalizeExamAnswers(
      {
        sessionId: session.id,
        onlyIfExpired: true,
        finalDraftAnswer: {
          questionId: question.id,
          selectedChoiceId: question.correctChoiceId,
          cumulativeMs: SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS + 1,
        },
      },
      createPracticeControllerDepsForBug238({
        userId: user.id,
        email: user.email,
        finalizeExamAnswersUseCase,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: { sessionId: session.id, totals: { answered: 1, correct: 1 } },
    });
    const sessionAttempts = await attempts.findBySessionId(session.id, user.id);
    expect(sessionAttempts).toEqual([
      expect.objectContaining({
        questionId: question.id,
        isCorrect: true,
        timeSpentSeconds: SUBMIT_ANSWER_MAX_TIME_SPENT_SECONDS,
      }),
    ]);
  });

  it('BUG-371 finishes an exam whose final draft arrives a day late, dropping the draft', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug371-finalize-late-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attempts = new DrizzleAttemptRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db);
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
    // A device asleep on the question for a day sends its finish a day after
    // the deadline, long past the grace window.
    const finalizeExamAnswersUseCase = createExamFinalizerAt(
      new Date(
        session.startedAt.getTime() + DAY_MS + ONE_QUESTION_DEADLINE_MS + 1_000,
      ),
    );

    const result = await finalizeExamAnswers(
      {
        sessionId: session.id,
        onlyIfExpired: true,
        finalDraftAnswer: {
          questionId: question.id,
          selectedChoiceId: question.correctChoiceId,
          cumulativeMs: DAY_MS + ONE_QUESTION_DEADLINE_MS + 1_000,
        },
      },
      createPracticeControllerDepsForBug238({
        userId: user.id,
        email: user.email,
        finalizeExamAnswersUseCase,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: { sessionId: session.id, totals: { answered: 0, correct: 0 } },
    });
    const sessionAttempts = await attempts.findBySessionId(session.id, user.id);
    expect(sessionAttempts).toEqual([
      expect.objectContaining({
        questionId: question.id,
        outcome: { kind: 'omitted' },
        isCorrect: false,
        timeSpentSeconds: 0,
      }),
    ]);
  });

  it('rejects oversized persisted draftCumulativeMs at the state-table boundary', async () => {
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

    await expect(
      db
        .update(schema.practiceSessionQuestionStates)
        .set({ draftCumulativeMs: SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS + 1 })
        .where(
          and(
            eq(
              schema.practiceSessionQuestionStates.practiceSessionId,
              session.id,
            ),
            eq(schema.practiceSessionQuestionStates.questionId, question.id),
          ),
        ),
    ).rejects.toMatchObject({
      cause: {
        code: '23514',
      },
    });
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
