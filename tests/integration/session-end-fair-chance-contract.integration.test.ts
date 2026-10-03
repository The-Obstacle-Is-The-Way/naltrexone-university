import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { runSessionEndFairChanceContract } from '@/tests/shared/session-end-fair-chance-contract';
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

runSessionEndFairChanceContract(
  'DrizzlePracticeSessionRepository',
  async () => ({
    async seed({ mode, items }) {
      const repository = new DrizzlePracticeSessionRepository(db);
      const user = await createUser(db, cleanup);
      const questions = [];
      for (const _item of items) {
        questions.push(
          await createQuestion(db, cleanup, {
            slug: `it-fair-chance-${randomUUID()}`,
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
        if (!question || !item.answered) continue;
        await repository.recordQuestionAnswer({
          sessionId: session.id,
          userId: user.id,
          questionId: question.id,
          selectedChoiceId: question.correctChoiceId,
          isCorrect: true,
          answeredAt: new Date(),
        });
      }
      // Taken out of the bank before the session ends.
      const unpublished = questions
        .filter((_question, index) => !items[index]?.published)
        .map((question) => question.id);
      if (unpublished.length > 0) {
        await db
          .update(schema.questions)
          .set({ status: 'archived' })
          .where(inArray(schema.questions.id, unpublished));
      }
      return { repository, sessionId: session.id, userId: user.id };
    },
  }),
);
