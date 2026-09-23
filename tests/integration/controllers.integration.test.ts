import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import type { QuestionControllerDeps } from '@/src/adapters/controllers/question-controller';
import {
  getNextQuestion,
  submitAnswer,
} from '@/src/adapters/controllers/question-controller';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzleIdempotencyKeyRepository } from '@/src/adapters/repositories/drizzle-idempotency-key-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import {
  FakeLogger,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import { FinalizeExamAnswersUseCase } from '@/src/application/use-cases/finalize-exam-answers';
import { GetNextQuestionUseCase } from '@/src/application/use-cases/get-next-question';
import { SaveExamDraftAnswerUseCase } from '@/src/application/use-cases/save-exam-draft-answer';
import { SubmitAnswerUseCase } from '@/src/application/use-cases/submit-answer';

import {
  cleanupAfterEach,
  closeConnection,
  createAuthGateway,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createTag,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});
afterAll(async () => {
  await closeConnection(sql);
});

class FailingRecordPracticeSessionRepository extends DrizzlePracticeSessionRepository {
  override async recordQuestionAnswer(): Promise<never> {
    throw new Error('Simulated recordQuestionAnswer failure');
  }
}

describe('question controllers (integration)', () => {
  it('fetches a question and inserts an attempts row when submitting an answer', async () => {
    const user = await createUser(db, cleanup);
    const tag = await createTag(db, cleanup, {
      slug: `it-tag-${randomUUID()}`,
      kind: 'topic',
    });
    const question = await createQuestion(db, cleanup, {
      slug: `it-q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      tagIds: [tag.id],
    });

    const authGateway = createAuthGateway(user);

    const questions = new DrizzleQuestionRepository(db);
    const attempts = new DrizzleAttemptRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db, () => new Date());
    const idempotencyKeyRepository = new DrizzleIdempotencyKeyRepository(
      db,
      () => new Date(),
    );
    const logger = new FakeLogger();

    const deps: QuestionControllerDeps = {
      authGateway,
      logger,
      rateLimiter: new FakeRateLimiter(),
      idempotencyKeyRepository,
      now: () => new Date(),
      checkEntitlementUseCase: { execute: async () => ({ isEntitled: true }) },
      getNextQuestionUseCase: new GetNextQuestionUseCase(
        questions,
        attempts,
        sessions,
        () => new Date(),
      ),
      submitAnswerUseCase: new SubmitAnswerUseCase(
        questions,
        attempts,
        sessions,
        logger,
      ),
    };

    const next = await getNextQuestion(
      { filters: { tagSlugs: [tag.slug], difficulties: [] } },
      deps,
    );

    expect(next).toMatchObject({
      ok: true,
      data: { questionId: question.id },
    });

    const result = await submitAnswer(
      { questionId: question.id, choiceId: question.correctChoiceId },
      deps,
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        isCorrect: true,
        correctChoiceId: question.correctChoiceId,
        explanationMd: '# Explanation',
      },
    });

    const inserted = await attempts.findByUserId(user.id, {
      limit: 10,
      offset: 0,
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      userId: user.id,
      questionId: question.id,
      outcome: {
        kind: 'answered',
        selectedChoiceId: question.correctChoiceId,
      },
      isCorrect: true,
    });
  });

  it('BUG-237 rejects active-exam submitAnswer without attempt or latest-state writes', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-submit-exam-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const authGateway = createAuthGateway(user);

    const questions = new DrizzleQuestionRepository(db);
    const attempts = new DrizzleAttemptRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db, () => new Date());
    const idempotencyKeyRepository = new DrizzleIdempotencyKeyRepository(
      db,
      () => new Date(),
    );
    const logger = new FakeLogger();

    const deps: QuestionControllerDeps = {
      authGateway,
      logger,
      rateLimiter: new FakeRateLimiter(),
      idempotencyKeyRepository,
      now: () => new Date(),
      checkEntitlementUseCase: { execute: async () => ({ isEntitled: true }) },
      getNextQuestionUseCase: new GetNextQuestionUseCase(
        questions,
        attempts,
        sessions,
        () => new Date(),
      ),
      submitAnswerUseCase: new SubmitAnswerUseCase(
        questions,
        attempts,
        sessions,
        logger,
        async (fn) =>
          db.transaction(async (tx) =>
            fn({
              attempts: new DrizzleAttemptRepository(tx),
              sessions: new DrizzlePracticeSessionRepository(
                tx,
                () => new Date(),
              ),
            }),
          ),
      ),
    };

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

    const result = await submitAnswer(
      {
        questionId: question.id,
        choiceId: question.correctChoiceId,
        sessionId: session.id,
      },
      deps,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Per-question submit is not available in exam mode',
      },
    });

    await expect(
      attempts.findBySessionIdAndQuestionId(session.id, user.id, question.id),
    ).resolves.toBeNull();

    const [stateRow] = await db
      .select({
        questionId: schema.practiceSessionQuestionStates.questionId,
        latestSelectedChoiceId:
          schema.practiceSessionQuestionStates.latestSelectedChoiceId,
        latestIsCorrect: schema.practiceSessionQuestionStates.latestIsCorrect,
        latestAnsweredAt: schema.practiceSessionQuestionStates.latestAnsweredAt,
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
    expect(stateRow).toEqual({
      questionId: question.id,
      latestSelectedChoiceId: null,
      latestIsCorrect: null,
      latestAnsweredAt: null,
    });
  });

  it('BUG-237 keeps draft finalization from colliding with a prior active-exam submitAnswer', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-submit-exam-finalize-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const omittedQuestion = await createQuestion(db, cleanup, {
      slug: `it-submit-exam-omitted-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const questions = new DrizzleQuestionRepository(db);
    const attempts = new DrizzleAttemptRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db, () => new Date());
    const logger = new FakeLogger();

    const submitAnswerUseCase = new SubmitAnswerUseCase(
      questions,
      attempts,
      sessions,
      logger,
      async (fn) =>
        db.transaction(async (tx) =>
          fn({
            attempts: new DrizzleAttemptRepository(tx),
            sessions: new DrizzlePracticeSessionRepository(
              tx,
              () => new Date(),
            ),
          }),
        ),
    );
    const saveExamDraftAnswerUseCase = new SaveExamDraftAnswerUseCase(
      questions,
      sessions,
    );
    const finalizeExamAnswersUseCase = new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      async (fn) =>
        db.transaction(async (tx) =>
          fn({
            questions: new DrizzleQuestionRepository(tx),
            attempts: new DrizzleAttemptRepository(tx),
            sessions: new DrizzlePracticeSessionRepository(
              tx,
              () => new Date(),
            ),
          }),
        ),
    );

    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id, omittedQuestion.id],
      },
    });

    await expect(
      submitAnswerUseCase.execute({
        userId: user.id,
        questionId: question.id,
        choiceId: question.correctChoiceId,
        sessionId: session.id,
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Per-question submit is not available in exam mode',
    });

    await saveExamDraftAnswerUseCase.execute({
      userId: user.id,
      sessionId: session.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      cumulativeMs: 30_000,
    });

    await expect(
      finalizeExamAnswersUseCase.execute({
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

    const sessionAttempts = await attempts.findBySessionId(session.id, user.id);
    expect(sessionAttempts).toHaveLength(2);
    expect(sessionAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          questionId: question.id,
          outcome: {
            kind: 'answered',
            selectedChoiceId: question.correctChoiceId,
          },
          isCorrect: true,
        }),
        expect.objectContaining({
          questionId: omittedQuestion.id,
          outcome: { kind: 'omitted' },
          isCorrect: false,
          timeSpentSeconds: 0,
        }),
      ]),
    );
  });

  it('rolls back the attempt insert when recordQuestionAnswer fails inside a transaction', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-txn-rollback-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const questions = new DrizzleQuestionRepository(db);
    const attempts = new DrizzleAttemptRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db, () => new Date());
    const logger = new FakeLogger();

    const session = await sessions.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    // Transaction where attempt insert succeeds but recordQuestionAnswer throws
    const failingTransaction = async <T>(
      fn: (tx: {
        attempts: DrizzleAttemptRepository;
        sessions: DrizzlePracticeSessionRepository;
      }) => Promise<T>,
    ): Promise<T> =>
      db.transaction(async (tx) => {
        const txSessions = new FailingRecordPracticeSessionRepository(
          tx,
          () => new Date(),
        );
        // Only the write is faulted; inherited reads must still use this transaction.
        expect(
          await txSessions.findByIdAndUserId(session.id, user.id),
        ).toMatchObject({ id: session.id });
        return fn({
          attempts: new DrizzleAttemptRepository(tx),
          sessions: txSessions,
        });
      });

    const useCase = new SubmitAnswerUseCase(
      questions,
      attempts,
      sessions,
      logger,
      failingTransaction,
    );

    await expect(
      useCase.execute({
        userId: user.id,
        questionId: question.id,
        choiceId: question.correctChoiceId,
        sessionId: session.id,
      }),
    ).rejects.toThrow('Simulated recordQuestionAnswer failure');

    // Gold-standard proof: no attempt row was committed despite the insert running
    const inserted = await attempts.findByUserId(user.id, {
      limit: 10,
      offset: 0,
    });
    const attemptsForQuestion = inserted.filter(
      (a) => a.questionId === question.id,
    );
    expect(attemptsForQuestion).toHaveLength(0);
  });
});
