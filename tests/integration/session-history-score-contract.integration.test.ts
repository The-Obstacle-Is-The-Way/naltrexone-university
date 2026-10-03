import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach } from 'vitest';
import * as schema from '@/db/schema';
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
    async seed(items) {
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
        mode: 'tutor',
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
      await repository.end(session.id, user.id);
      // Taken out of the bank after the session ended.
      const unpublished = questions
        .filter((_question, index) => !items[index]?.published)
        .map((question) => question.id);
      if (unpublished.length > 0) {
        await db
          .update(schema.questions)
          .set({ status: 'archived' })
          .where(inArray(schema.questions.id, unpublished));
      }
      return { repository, userId: user.id };
    },
  }),
);
