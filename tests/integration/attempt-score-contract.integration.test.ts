import { randomUUID } from 'node:crypto';
import { afterAll, afterEach } from 'vitest';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { answeredOutcome, omittedOutcome } from '@/src/domain/value-objects';
import {
  type AttemptScoreHarness,
  runAttemptScoreContract,
} from '@/tests/shared/attempt-score-contract';
import { runAttemptedQuestionResultContract } from '@/tests/shared/attempted-question-result-contract';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';
import {
  reviseQuestion,
  setQuestionState,
} from './question-state-test-helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

const createHarness = async (): Promise<AttemptScoreHarness> => ({
  async seed(attempts) {
    const repository = new DrizzleAttemptRepository(db);
    const sessions = new DrizzlePracticeSessionRepository(db);
    const user = await createUser(db, cleanup);
    const now = new Date();
    const questionByKey = new Map<
      string,
      Awaited<ReturnType<typeof createQuestion>>
    >();
    for (const key of new Set(attempts.map((attempt) => attempt.question))) {
      questionByKey.set(
        key,
        await createQuestion(db, cleanup, {
          slug: `it-attempt-score-${randomUUID()}`,
          status: 'published',
          difficulty: 'easy',
        }),
      );
    }
    // The learner's one exam, over every question answered in it.
    const examQuestions = [
      ...new Set(
        attempts
          .filter((attempt) => attempt.inExam)
          .map((attempt) => attempt.question),
      ),
    ].flatMap((key) => questionByKey.get(key) ?? []);
    const exam =
      examQuestions.length > 0
        ? await sessions.create({
            userId: user.id,
            mode: 'exam',
            paramsJson: {
              count: examQuestions.length,
              tagSlugs: [],
              difficulties: [],
              questionIds: examQuestions.map((question) => question.id),
            },
          })
        : null;
    for (const attempt of attempts) {
      const question = questionByKey.get(attempt.question);
      if (!question) throw new Error('question');
      await repository.insert({
        userId: user.id,
        questionId: question.id,
        questionRevisionId: question.revisionId,
        practiceSessionId: attempt.inExam ? (exam?.id ?? null) : null,
        outcome:
          attempt.outcome === 'omitted'
            ? omittedOutcome()
            : answeredOutcome(
                attempt.outcome === 'correct'
                  ? question.correctChoiceId
                  : question.incorrectChoiceId,
              ),
        isCorrect: attempt.outcome === 'correct',
        timeSpentSeconds: 30,
        answeredAt: new Date(now.getTime() - attempt.daysAgo * DAY_MS),
      });
    }
    if (exam) {
      for (const attempt of attempts) {
        const question = questionByKey.get(attempt.question);
        if (question && attempt.removedBeforeEnd) {
          await setQuestionState(db, question, 'retired');
        }
      }
      await sessions.end(exam.id, user.id);
    }
    for (const attempt of attempts) {
      const question = questionByKey.get(attempt.question);
      if (question && attempt.heldThenLifted) {
        await setQuestionState(db, question, 'under_review');
        await setQuestionState(db, question, 'available');
      }
    }
    for (const [key, question] of questionByKey) {
      const revisedAfter = attempts.find(
        (attempt) => attempt.question === key,
      )?.revisedAfter;
      if (revisedAfter) await reviseQuestion(db, question, revisedAfter);
    }
    // As the bank stands when the score is read.
    for (const [key, question] of questionByKey) {
      const seed = attempts.find((attempt) => attempt.question === key);
      await setQuestionState(db, question, seed?.now ?? 'available');
    }
    const questionIds = new Map(
      [...questionByKey].map(([key, question]) => [key, question.id]),
    );
    return { repository, userId: user.id, now, questionIds };
  },
});

runAttemptScoreContract('DrizzleAttemptRepository', createHarness);
runAttemptedQuestionResultContract('DrizzleAttemptRepository', createHarness);
