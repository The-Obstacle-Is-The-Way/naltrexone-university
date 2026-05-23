import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { FinalizeExamAnswersUseCase } from '@/src/application/use-cases/finalize-exam-answers';
import { GetNextQuestionUseCase } from '@/src/application/use-cases/get-next-question';
import { SaveExamDraftAnswerUseCase } from '@/src/application/use-cases/save-exam-draft-answer';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
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

function createFinalizeExamAnswersUseCase(input: { now: () => Date }) {
  return new FinalizeExamAnswersUseCase(
    new DrizzleQuestionRepository(db),
    new DrizzleAttemptRepository(db),
    new DrizzlePracticeSessionRepository(db, input.now),
    async (fn) =>
      db.transaction(async (tx) =>
        fn({
          questions: new DrizzleQuestionRepository(tx),
          attempts: new DrizzleAttemptRepository(tx),
          sessions: new DrizzlePracticeSessionRepository(tx, input.now),
        }),
      ),
  );
}

describe('exam timer integration', () => {
  it('rejects draft saves after expiry and finalizes omitted rows as incorrect', async () => {
    let now = new Date('2026-05-22T12:00:00.000Z');
    const clock = () => now;
    const user = await createUser(db, cleanup);
    const firstQuestion = await createQuestion(db, cleanup, {
      slug: `it-exam-timer-a-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const secondQuestion = await createQuestion(db, cleanup, {
      slug: `it-exam-timer-b-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const questions = new DrizzleQuestionRepository(db);
    const attempts = new DrizzleAttemptRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db, clock);
    const saveDraft = new SaveExamDraftAnswerUseCase(
      questions,
      sessions,
      clock,
    );
    const finalize = createFinalizeExamAnswersUseCase({ now: clock });

    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: [],
        questionIds: [firstQuestion.id, secondQuestion.id],
      },
    });

    now = new Date(session.startedAt.getTime() + 144_000);
    await expect(
      saveDraft.execute({
        userId: user.id,
        sessionId: session.id,
        questionId: firstQuestion.id,
        selectedChoiceId: firstQuestion.correctChoiceId,
        cumulativeMs: 30_000,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Exam time has expired',
    });

    const summary = await finalize.execute({
      userId: user.id,
      sessionId: session.id,
    });

    expect(summary).toMatchObject({
      sessionId: session.id,
      mode: 'exam',
      questionCount: 2,
      totals: {
        answered: 0,
        correct: 0,
        accuracy: 0,
      },
    });

    const endedSession = await sessions.findByIdAndUserId(session.id, user.id);
    expect(endedSession?.endedAt).toEqual(now);

    const sessionAttempts = await attempts.findBySessionId(session.id, user.id);
    expect(sessionAttempts).toHaveLength(2);
    expect(sessionAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          questionId: firstQuestion.id,
          outcome: { kind: 'omitted' },
          isCorrect: false,
        }),
        expect.objectContaining({
          questionId: secondQuestion.id,
          outcome: { kind: 'omitted' },
          isCorrect: false,
        }),
      ]),
    );
  });

  it('derives identical active exam deadlines across reloads from persisted startedAt', async () => {
    let now = new Date('2026-05-22T12:00:00.000Z');
    const clock = () => now;
    const user = await createUser(db, cleanup);
    const firstQuestion = await createQuestion(db, cleanup, {
      slug: `it-exam-timer-reload-a-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const secondQuestion = await createQuestion(db, cleanup, {
      slug: `it-exam-timer-reload-b-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const questions = new DrizzleQuestionRepository(db);
    const attempts = new DrizzleAttemptRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db, clock);

    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: [],
        questionIds: [firstQuestion.id, secondQuestion.id],
      },
    });

    const expectedDeadline = new Date(
      session.startedAt.getTime() + 144_000,
    ).toISOString();

    now = new Date(session.startedAt.getTime() + 30_000);
    const firstLoad = await new GetNextQuestionUseCase(
      questions,
      attempts,
      sessions,
      clock,
      createFinalizeExamAnswersUseCase({ now: clock }),
    ).execute({
      userId: user.id,
      sessionId: session.id,
    });

    now = new Date(session.startedAt.getTime() + 60_000);
    const reload = await new GetNextQuestionUseCase(
      questions,
      attempts,
      sessions,
      clock,
      createFinalizeExamAnswersUseCase({ now: clock }),
    ).execute({
      userId: user.id,
      sessionId: session.id,
    });

    expect(firstLoad?.session?.deadlineAt).toBe(expectedDeadline);
    expect(reload?.session?.deadlineAt).toBe(firstLoad?.session?.deadlineAt);
  });
});
