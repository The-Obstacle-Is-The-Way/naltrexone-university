import { randomUUID } from 'node:crypto';
import { afterAll, afterEach } from 'vitest';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { runSessionHistoryScoreContract } from '@/tests/shared/session-history-score-contract';
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

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

runSessionHistoryScoreContract(
  'DrizzlePracticeSessionRepository',
  async () => ({
    async seed({ mode, items }) {
      const repository = new DrizzlePracticeSessionRepository(db);
      const user = await createUser(db, cleanup);
      const questions = [];
      for (const _item of items) {
        questions.push(
          await createQuestion(db, cleanup, {
            slug: `it-history-score-${randomUUID()}`,
            status: 'published',
            difficulty: 'easy',
          }),
        );
      }
      const session = await repository.create({
        userId: user.id,
        mode,
        paramsJson: {
          count: questions.length,
          tagSlugs: [],
          difficulties: [],
          questionIds: questions.map((question) => question.id),
        },
      });
      for (const [index, item] of items.entries()) {
        const question = questions[index];
        if (!question || item.answer === 'unanswered') continue;
        await repository.recordQuestionAnswer({
          sessionId: session.id,
          userId: user.id,
          questionId: question.id,
          selectedChoiceId:
            item.answer === 'correct'
              ? question.correctChoiceId
              : question.incorrectChoiceId,
          isCorrect: item.answer === 'correct',
          answeredAt: new Date(),
        });
      }
      // Taken out of the bank before the session ends.
      for (const [index, item] of items.entries()) {
        const question = questions[index];
        if (question && item.removedBeforeEnd) {
          await setQuestionState(db, question, 'retired');
        }
      }
      await repository.end(session.id, user.id);
      // As the bank stands when history is read.
      for (const [index, item] of items.entries()) {
        const question = questions[index];
        if (!question) continue;
        if (item.revisedAfter) {
          await reviseQuestion(db, question, item.revisedAfter);
        }
        await setQuestionState(db, question, item.now);
      }
      return { repository, userId: user.id };
    },
  }),
);
