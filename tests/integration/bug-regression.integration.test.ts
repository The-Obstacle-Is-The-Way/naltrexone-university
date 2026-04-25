import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
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
import { GetPracticeSessionReviewUseCase } from '@/src/application/use-cases/get-practice-session-review';
import {
  SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS,
  SaveExamDraftAnswerUseCase,
} from '@/src/application/use-cases/save-exam-draft-answer';
import {
  createUser as createDomainUser,
  createSubscription,
} from '@/src/domain/test-helpers';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createTag,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

async function insertAttemptAt(input: {
  userId: string;
  questionId: string;
  practiceSessionId: string | null;
  selectedChoiceId: string;
  isCorrect?: boolean;
  answeredAt: Date;
}) {
  await db.insert(schema.attempts).values({
    userId: input.userId,
    questionId: input.questionId,
    practiceSessionId: input.practiceSessionId,
    selectedChoiceId: input.selectedChoiceId,
    isCorrect: input.isCorrect ?? true,
    timeSpentSeconds: 5,
    answeredAt: input.answeredAt,
  });
}

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

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('BUG-186: GetPracticeSessionReview active-exam secrecy', () => {
  it('redacts isCorrect for active exam and reveals it after session ends', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-review-secrecy-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const questionRepo = new DrizzleQuestionRepository(db);
    const logger = new FakeLogger();

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

    await sessionRepo.recordQuestionAnswer({
      sessionId: session.id,
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: new Date(),
    });

    const useCase = new GetPracticeSessionReviewUseCase(
      sessionRepo,
      questionRepo,
      logger,
    );

    // While exam is active: isCorrect must be null
    const activeResult = await useCase.execute({
      userId: user.id,
      sessionId: session.id,
    });
    expect(activeResult.rows).toHaveLength(1);
    expect(activeResult.rows[0]?.isCorrect).toBeNull();
    expect(activeResult.mode).toBe('exam');

    // End the session
    await sessionRepo.end(session.id, user.id);

    // After exam ends: isCorrect must be visible
    const endedResult = await useCase.execute({
      userId: user.id,
      sessionId: session.id,
    });
    expect(endedResult.rows).toHaveLength(1);
    expect(endedResult.rows[0]?.isCorrect).toBe(true);
  });

  it('does not redact isCorrect for tutor-mode sessions', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-tutor-no-redact-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const questionRepo = new DrizzleQuestionRepository(db);
    const logger = new FakeLogger();

    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await sessionRepo.recordQuestionAnswer({
      sessionId: session.id,
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.incorrectChoiceId,
      isCorrect: false,
      answeredAt: new Date(),
    });

    const useCase = new GetPracticeSessionReviewUseCase(
      sessionRepo,
      questionRepo,
      logger,
    );

    // Tutor mode always shows correctness, even while active
    const result = await useCase.execute({
      userId: user.id,
      sessionId: session.id,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.isCorrect).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BUG-187: Dashboard count queries exclude active-exam attempts
// ---------------------------------------------------------------------------

describe('BUG-187: Dashboard counts exclude active-exam attempts', () => {
  it('excludes active-exam attempts from countByUserId and countCorrectByUserId', async () => {
    const user = await createUser(db, cleanup);
    const q1 = await createQuestion(db, cleanup, {
      slug: `it-count-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const q2 = await createQuestion(db, cleanup, {
      slug: `it-count-adhoc-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    // Create an active exam session
    const examSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [q1.id],
      },
    });

    // Attempt attached to active exam
    await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: examSession.id,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    // Adhoc attempt (no session)
    await attemptRepo.insert({
      userId: user.id,
      questionId: q2.id,
      practiceSessionId: null,
      selectedChoiceId: q2.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    const since = new Date('2000-01-01T00:00:00.000Z');

    // While exam is active: only adhoc attempt counted
    await expect(attemptRepo.countByUserId(user.id)).resolves.toBe(1);
    await expect(attemptRepo.countCorrectByUserId(user.id)).resolves.toBe(1);
    await expect(attemptRepo.countByUserIdSince(user.id, since)).resolves.toBe(
      1,
    );
    await expect(
      attemptRepo.countCorrectByUserIdSince(user.id, since),
    ).resolves.toBe(1);

    // End the exam
    await sessionRepo.end(examSession.id, user.id);

    // After exam ends: both attempts counted
    await expect(attemptRepo.countByUserId(user.id)).resolves.toBe(2);
    await expect(attemptRepo.countCorrectByUserId(user.id)).resolves.toBe(2);
    await expect(attemptRepo.countByUserIdSince(user.id, since)).resolves.toBe(
      2,
    );
    await expect(
      attemptRepo.countCorrectByUserIdSince(user.id, since),
    ).resolves.toBe(2);
  });

  it('excludes active-exam attempts from listRecentByUserId', async () => {
    const user = await createUser(db, cleanup);
    const q1 = await createQuestion(db, cleanup, {
      slug: `it-recent-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const q2 = await createQuestion(db, cleanup, {
      slug: `it-recent-adhoc-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const examSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [q1.id],
      },
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: q1.id,
      practiceSessionId: examSession.id,
      selectedChoiceId: q1.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: q2.id,
      practiceSessionId: null,
      selectedChoiceId: q2.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    // While exam is active: only adhoc attempt in recent list
    const activeRecent = await attemptRepo.listRecentByUserId(user.id, 10);
    expect(activeRecent).toHaveLength(1);
    expect(activeRecent[0]?.questionId).toBe(q2.id);

    // End the exam
    await sessionRepo.end(examSession.id, user.id);

    // After exam ends: both in recent list
    const endedRecent = await attemptRepo.listRecentByUserId(user.id, 10);
    expect(endedRecent).toHaveLength(2);
  });

  it('includes tutor-session attempts in counts', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-count-tutor-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const tutorSession = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: tutorSession.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    // Tutor attempts always counted, even while session is active
    await expect(attemptRepo.countByUserId(user.id)).resolves.toBe(1);
    await expect(attemptRepo.countCorrectByUserId(user.id)).resolves.toBe(1);
  });
});

// ---------------------------------------------------------------------------
// BUG-236: Dashboard current streak excludes active-exam attempts
// ---------------------------------------------------------------------------

describe('BUG-236: Dashboard streak timestamps exclude active-exam attempts', () => {
  it('filters active exam attempts while preserving ended exam, tutor, and standalone timestamps', async () => {
    const since = new Date('2026-02-01T00:00:00.000Z');
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const endedExamUser = await createUser(db, cleanup);
    const endedExamQuestion = await createQuestion(db, cleanup, {
      slug: `it-bug236-ended-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const endedExamTimestamp = new Date('2026-04-01T12:00:00.000Z');
    const endedExamSession = await sessionRepo.create({
      userId: endedExamUser.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [endedExamQuestion.id],
      },
    });
    await sessionRepo.end(endedExamSession.id, endedExamUser.id);
    await insertAttemptAt({
      userId: endedExamUser.id,
      questionId: endedExamQuestion.id,
      practiceSessionId: endedExamSession.id,
      selectedChoiceId: endedExamQuestion.correctChoiceId,
      answeredAt: endedExamTimestamp,
    });

    const tutorUser = await createUser(db, cleanup);
    const tutorQuestion = await createQuestion(db, cleanup, {
      slug: `it-bug236-tutor-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const tutorTimestamp = new Date('2026-04-02T12:00:00.000Z');
    const tutorSession = await sessionRepo.create({
      userId: tutorUser.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [tutorQuestion.id],
      },
    });
    await insertAttemptAt({
      userId: tutorUser.id,
      questionId: tutorQuestion.id,
      practiceSessionId: tutorSession.id,
      selectedChoiceId: tutorQuestion.correctChoiceId,
      answeredAt: tutorTimestamp,
    });

    const standaloneUser = await createUser(db, cleanup);
    const standaloneQuestion = await createQuestion(db, cleanup, {
      slug: `it-bug236-standalone-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const standaloneTimestamp = new Date('2026-04-03T12:00:00.000Z');
    await insertAttemptAt({
      userId: standaloneUser.id,
      questionId: standaloneQuestion.id,
      practiceSessionId: null,
      selectedChoiceId: standaloneQuestion.correctChoiceId,
      answeredAt: standaloneTimestamp,
    });

    const activeExamUser = await createUser(db, cleanup);
    const activeExamQuestion = await createQuestion(db, cleanup, {
      slug: `it-bug236-active-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const activeExamTimestamp = new Date('2026-04-04T12:00:00.000Z');
    const activeExamSession = await sessionRepo.create({
      userId: activeExamUser.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [activeExamQuestion.id],
      },
    });
    await insertAttemptAt({
      userId: activeExamUser.id,
      questionId: activeExamQuestion.id,
      practiceSessionId: activeExamSession.id,
      selectedChoiceId: activeExamQuestion.correctChoiceId,
      answeredAt: activeExamTimestamp,
    });

    await expect(
      attemptRepo.listAnsweredAtByUserIdSince(endedExamUser.id, since),
    ).resolves.toEqual([endedExamTimestamp]);
    await expect(
      attemptRepo.listAnsweredAtByUserIdSince(tutorUser.id, since),
    ).resolves.toEqual([tutorTimestamp]);
    await expect(
      attemptRepo.listAnsweredAtByUserIdSince(standaloneUser.id, since),
    ).resolves.toEqual([standaloneTimestamp]);
    await expect(
      attemptRepo.listAnsweredAtByUserIdSince(activeExamUser.id, since),
    ).resolves.toEqual([]);
  });

  it('keeps answeredAt descending order after filtering hidden active-exam rows', async () => {
    const user = await createUser(db, cleanup);
    const since = new Date('2026-02-01T00:00:00.000Z');
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const qStandalone = await createQuestion(db, cleanup, {
      slug: `it-bug236-order-standalone-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qTutor = await createQuestion(db, cleanup, {
      slug: `it-bug236-order-tutor-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qEndedExam = await createQuestion(db, cleanup, {
      slug: `it-bug236-order-ended-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qActiveExam = await createQuestion(db, cleanup, {
      slug: `it-bug236-order-active-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const tutorSession = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [qTutor.id],
      },
    });
    await sessionRepo.end(tutorSession.id, user.id);

    const endedExamSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [qEndedExam.id],
      },
    });
    await sessionRepo.end(endedExamSession.id, user.id);

    const activeExamSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [qActiveExam.id],
      },
    });

    const hiddenNewest = new Date('2026-04-04T12:00:00.000Z');
    const visibleNewest = new Date('2026-04-03T12:00:00.000Z');
    const visibleMiddle = new Date('2026-04-02T12:00:00.000Z');
    const visibleOldest = new Date('2026-04-01T12:00:00.000Z');

    await insertAttemptAt({
      userId: user.id,
      questionId: qStandalone.id,
      practiceSessionId: null,
      selectedChoiceId: qStandalone.correctChoiceId,
      answeredAt: visibleOldest,
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: qTutor.id,
      practiceSessionId: tutorSession.id,
      selectedChoiceId: qTutor.correctChoiceId,
      answeredAt: visibleMiddle,
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: qEndedExam.id,
      practiceSessionId: endedExamSession.id,
      selectedChoiceId: qEndedExam.correctChoiceId,
      answeredAt: visibleNewest,
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: qActiveExam.id,
      practiceSessionId: activeExamSession.id,
      selectedChoiceId: qActiveExam.correctChoiceId,
      answeredAt: hiddenNewest,
    });

    const answeredAt = await attemptRepo.listAnsweredAtByUserIdSince(
      user.id,
      since,
    );

    expect(answeredAt).toEqual([visibleNewest, visibleMiddle, visibleOldest]);
  });
});

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
    expect(state?.draftSelectedChoiceId ?? null).toBeNull();
    expect(state?.draftCumulativeMs ?? 0).toBe(0);
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
      SAVE_EXAM_DRAFT_MAX_CUMULATIVE_MS / 1000,
    );
  });
});

// ---------------------------------------------------------------------------
// BUG-192: History attempted-questions excludes active-exam attempts
// ---------------------------------------------------------------------------

describe('BUG-192: Attempted-question history excludes active-exam attempts', () => {
  it('excludes active-exam attempts from attempted-question list and count until the exam ends', async () => {
    const user = await createUser(db, cleanup);
    const qExam = await createQuestion(db, cleanup, {
      slug: `it-attempted-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const qAdhoc = await createQuestion(db, cleanup, {
      slug: `it-attempted-adhoc-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);

    const examSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [qExam.id],
      },
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: qExam.id,
      practiceSessionId: examSession.id,
      selectedChoiceId: qExam.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: qAdhoc.id,
      practiceSessionId: null,
      selectedChoiceId: qAdhoc.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 5,
    });

    const activeAttempted = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(activeAttempted).toHaveLength(1);
    expect(activeAttempted[0]?.questionId).toBe(qAdhoc.id);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(1);

    await sessionRepo.end(examSession.id, user.id);

    const endedAttempted = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(endedAttempted).toHaveLength(2);
    expect(endedAttempted.map((row) => row.questionId)).toEqual(
      expect.arrayContaining([qAdhoc.id, qExam.id]),
    );
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(2);
  });
});

// ---------------------------------------------------------------------------
// BUG-235: History attempted-questions keeps latest visible fallback
// ---------------------------------------------------------------------------

describe('BUG-235: Attempted-question history keeps latest visible fallback', () => {
  it('falls back to an older standalone attempt when a newer active-exam attempt is hidden', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug235-standalone-fallback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const olderVisibleAt = new Date('2026-04-01T12:00:00.000Z');
    const newerActiveExamAt = new Date('2026-04-02T12:00:00.000Z');

    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      selectedChoiceId: question.incorrectChoiceId,
      isCorrect: false,
      answeredAt: olderVisibleAt,
    });

    const activeExamSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: activeExamSession.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: newerActiveExamAt,
    });

    const activeRows = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(activeRows).toEqual([
      {
        questionId: question.id,
        answeredAt: olderVisibleAt,
        isCorrect: false,
        sessionId: null,
        sessionMode: null,
      },
    ]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(activeRows.length);

    await sessionRepo.end(activeExamSession.id, user.id);

    const endedRows = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(endedRows).toEqual([
      {
        questionId: question.id,
        answeredAt: newerActiveExamAt,
        isCorrect: true,
        sessionId: activeExamSession.id,
        sessionMode: 'exam',
      },
    ]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(endedRows.length);
  });

  it('falls back to an older tutor attempt when a newer active-exam attempt is hidden', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug235-tutor-fallback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const olderVisibleAt = new Date('2026-04-03T12:00:00.000Z');
    const newerActiveExamAt = new Date('2026-04-04T12:00:00.000Z');

    const tutorSession = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: tutorSession.id,
      selectedChoiceId: question.incorrectChoiceId,
      isCorrect: false,
      answeredAt: olderVisibleAt,
    });
    await sessionRepo.end(tutorSession.id, user.id);

    const activeExamSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: activeExamSession.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: newerActiveExamAt,
    });

    const rows = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(rows).toEqual([
      {
        questionId: question.id,
        answeredAt: olderVisibleAt,
        isCorrect: false,
        sessionId: tutorSession.id,
        sessionMode: 'tutor',
      },
    ]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(rows.length);
  });

  it('falls back to an older ended-exam attempt when a newer active-exam attempt is hidden', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug235-ended-exam-fallback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const olderVisibleAt = new Date('2026-04-05T12:00:00.000Z');
    const newerActiveExamAt = new Date('2026-04-06T12:00:00.000Z');

    const endedExamSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    await sessionRepo.end(endedExamSession.id, user.id);
    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: endedExamSession.id,
      selectedChoiceId: question.incorrectChoiceId,
      isCorrect: false,
      answeredAt: olderVisibleAt,
    });

    const activeExamSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: activeExamSession.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: newerActiveExamAt,
    });

    const rows = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(rows).toEqual([
      {
        questionId: question.id,
        answeredAt: olderVisibleAt,
        isCorrect: false,
        sessionId: endedExamSession.id,
        sessionMode: 'exam',
      },
    ]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(rows.length);
  });

  it('continues to hide an active-exam attempt when no visible fallback exists', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-bug235-no-fallback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const attemptRepo = new DrizzleAttemptRepository(db);
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const activeExamAt = new Date('2026-04-07T12:00:00.000Z');

    const activeExamSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    await insertAttemptAt({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: activeExamSession.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      answeredAt: activeExamAt,
    });

    await expect(
      attemptRepo.listAttemptedQuestionsByUserId(user.id, 10, 0),
    ).resolves.toEqual([]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(0);

    await sessionRepo.end(activeExamSession.id, user.id);

    const endedRows = await attemptRepo.listAttemptedQuestionsByUserId(
      user.id,
      10,
      0,
    );
    expect(endedRows).toEqual([
      {
        questionId: question.id,
        answeredAt: activeExamAt,
        isCorrect: true,
        sessionId: activeExamSession.id,
        sessionMode: 'exam',
      },
    ]);
    await expect(
      attemptRepo.countAttemptedQuestionsByUserId(user.id),
    ).resolves.toBe(endedRows.length);
  });
});

// BUG-195: Question candidate status filters exclude active-exam attempts

describe('BUG-195: Question candidate status filters exclude active-exam attempts', () => {
  it('excludes active-exam attempts from unanswered/incorrect status filters until the exam ends', async () => {
    const user = await createUser(db, cleanup);
    const questionRepo = new DrizzleQuestionRepository(db);
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const attemptRepo = new DrizzleAttemptRepository(db);
    const tag = await createTag(db, cleanup, {
      slug: `it-bug195-tag-${randomUUID()}`,
      kind: 'topic',
    });

    const qExamIncorrect = await createQuestion(db, cleanup, {
      slug: `it-bug195-exam-incorrect-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      tagIds: [tag.id],
    });
    const qAdhocIncorrect = await createQuestion(db, cleanup, {
      slug: `it-bug195-adhoc-incorrect-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      tagIds: [tag.id],
    });
    const qAdhocCorrect = await createQuestion(db, cleanup, {
      slug: `it-bug195-adhoc-correct-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      tagIds: [tag.id],
    });
    const qNeverAnswered = await createQuestion(db, cleanup, {
      slug: `it-bug195-never-answered-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      createdAt: new Date('2026-01-04T00:00:00.000Z'),
      tagIds: [tag.id],
    });

    const examSession = await sessionRepo.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [qExamIncorrect.id],
      },
    });

    await attemptRepo.insert({
      userId: user.id,
      questionId: qExamIncorrect.id,
      practiceSessionId: examSession.id,
      selectedChoiceId: qExamIncorrect.incorrectChoiceId,
      isCorrect: false,
      timeSpentSeconds: 0,
    });
    await attemptRepo.insert({
      userId: user.id,
      questionId: qAdhocIncorrect.id,
      practiceSessionId: null,
      selectedChoiceId: qAdhocIncorrect.incorrectChoiceId,
      isCorrect: false,
      timeSpentSeconds: 0,
    });
    await attemptRepo.insert({
      userId: user.id,
      questionId: qAdhocCorrect.id,
      practiceSessionId: null,
      selectedChoiceId: qAdhocCorrect.correctChoiceId,
      isCorrect: true,
      timeSpentSeconds: 0,
    });

    const activeUnanswered = await questionRepo.listPublishedCandidateIds({
      tagSlugs: [tag.slug],
      difficulties: [],
      statuses: ['unanswered'],
      userId: user.id,
    });
    expect(new Set(activeUnanswered)).toEqual(
      new Set([qNeverAnswered.id, qExamIncorrect.id]),
    );
    await expect(
      questionRepo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['unanswered'],
        userId: user.id,
      }),
    ).resolves.toBe(2);

    const activeIncorrect = await questionRepo.listPublishedCandidateIds({
      tagSlugs: [tag.slug],
      difficulties: [],
      statuses: ['incorrect'],
      userId: user.id,
    });
    expect(activeIncorrect).toEqual([qAdhocIncorrect.id]);
    await expect(
      questionRepo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['incorrect'],
        userId: user.id,
      }),
    ).resolves.toBe(1);

    await sessionRepo.end(examSession.id, user.id);

    const endedUnanswered = await questionRepo.listPublishedCandidateIds({
      tagSlugs: [tag.slug],
      difficulties: [],
      statuses: ['unanswered'],
      userId: user.id,
    });
    expect(endedUnanswered).toEqual([qNeverAnswered.id]);
    await expect(
      questionRepo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['unanswered'],
        userId: user.id,
      }),
    ).resolves.toBe(1);

    const endedIncorrect = await questionRepo.listPublishedCandidateIds({
      tagSlugs: [tag.slug],
      difficulties: [],
      statuses: ['incorrect'],
      userId: user.id,
    });
    expect(new Set(endedIncorrect)).toEqual(
      new Set([qExamIncorrect.id, qAdhocIncorrect.id]),
    );
    await expect(
      questionRepo.countPublishedCandidateIds({
        tagSlugs: [tag.slug],
        difficulties: [],
        statuses: ['incorrect'],
        userId: user.id,
      }),
    ).resolves.toBe(2);
  });
});

// ---------------------------------------------------------------------------
// BUG-188: CAS comparison works with legacy params_json (no questionStates)
// ---------------------------------------------------------------------------

describe('BUG-188: CAS works with legacy JSON shapes', () => {
  it('succeeds CAS on legacy params_json without questionStates key', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-legacy-cas-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    // Insert session with legacy JSON shape (no questionStates key)
    const legacyParamsJson: PracticeSessionParams = {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [question.id],
    };

    const [row] = await db
      .insert(schema.practiceSessions)
      .values({
        userId: user.id,
        mode: 'tutor',
        paramsJson: legacyParamsJson,
      })
      .returning({ id: schema.practiceSessions.id });

    if (!row) throw new Error('Failed to insert legacy session');

    const sessionRepo = new DrizzlePracticeSessionRepository(db);

    // CAS must succeed on first try despite legacy shape
    await expect(
      sessionRepo.recordQuestionAnswer({
        sessionId: row.id,
        userId: user.id,
        questionId: question.id,
        selectedChoiceId: question.correctChoiceId,
        isCorrect: true,
        answeredAt: new Date(),
      }),
    ).resolves.toMatchObject({
      questionId: question.id,
      latestIsCorrect: true,
    });

    // Verify the row is upgraded to include questionStates
    const updatedRow = await db.query.practiceSessions.findFirst({
      where: eq(schema.practiceSessions.id, row.id),
    });
    expect(updatedRow?.paramsJson).toHaveProperty('questionStates');
  });

  it('succeeds CAS on current-format params_json with questionStates', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-current-cas-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    // Use the normal create path which produces current-format JSON
    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    // CAS must succeed on current-format shape
    await expect(
      sessionRepo.recordQuestionAnswer({
        sessionId: session.id,
        userId: user.id,
        questionId: question.id,
        selectedChoiceId: question.correctChoiceId,
        isCorrect: true,
        answeredAt: new Date(),
      }),
    ).resolves.toMatchObject({
      questionId: question.id,
      latestIsCorrect: true,
    });
  });

  it('succeeds CAS for setQuestionMarkedForReview with legacy params_json', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-legacy-mark-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    // Insert session with legacy JSON shape
    const legacyParamsJson: PracticeSessionParams = {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [question.id],
    };

    const [row] = await db
      .insert(schema.practiceSessions)
      .values({
        userId: user.id,
        mode: 'exam',
        paramsJson: legacyParamsJson,
      })
      .returning({ id: schema.practiceSessions.id });

    if (!row) throw new Error('Failed to insert legacy session');

    const sessionRepo = new DrizzlePracticeSessionRepository(db);

    // setQuestionMarkedForReview should also work with legacy shape
    await expect(
      sessionRepo.setQuestionMarkedForReview({
        sessionId: row.id,
        userId: user.id,
        questionId: question.id,
        markedForReview: true,
      }),
    ).resolves.toMatchObject({
      questionId: question.id,
      markedForReview: true,
    });
  });
});
