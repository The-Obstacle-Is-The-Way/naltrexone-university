import { randomUUID } from 'node:crypto';
import { afterAll, afterEach } from 'vitest';
import { appendQuestionRevision } from '@/scripts/seed/question-revision-writer';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { runAnswerKeyChangeContract } from '@/tests/shared/answer-key-change-contract';
import {
  addCurrentRevision,
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

runAnswerKeyChangeContract('DrizzleQuestionRepository', async () => ({
  async seed(change) {
    const question = await createQuestion(db, cleanup, {
      slug: `it-answer-key-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    // `createQuestion`'s first revision keys B, "Choice B". The helper's
    // revision keys C, "Revised C"; the stem-only revision keeps B.
    const current =
      change === 'correct choice'
        ? (await addCurrentRevision(db, question.id)).revisionId
        : (
            await appendQuestionRevision(db, question.id, {
              stemMd: '# Reworded stem',
              explanationMd: '# Explanation',
              referenceMd: null,
              difficulty: 'easy',
              choices: [
                {
                  label: 'A',
                  textMd: 'Choice A',
                  isCorrect: false,
                  explanationMd: null,
                  sortOrder: 1,
                },
                {
                  label: 'B',
                  textMd: 'Choice B',
                  isCorrect: true,
                  explanationMd: null,
                  sortOrder: 2,
                },
              ],
            })
          ).revisionId;
    return {
      repository: new DrizzleQuestionRepository(db),
      questionId: question.id,
      currentRevisionId: current,
      earlierRevisionId: question.revisionId,
    };
  },
}));
