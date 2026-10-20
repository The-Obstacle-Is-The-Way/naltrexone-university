import { randomUUID } from 'node:crypto';
import { afterAll, afterEach } from 'vitest';
import type { QuestionRevisionFields } from '@/lib/content/question-revision-hash';
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
    const unchangedKey = (textMd: string): QuestionRevisionFields => ({
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
          textMd,
          isCorrect: true,
          explanationMd: null,
          sortOrder: 2,
        },
      ],
    });
    const earlierRevisionId =
      change === 'key normalization'
        ? (
            await appendQuestionRevision(
              db,
              question.id,
              unchangedKey(' \r\nChoice B\t\r\n'),
            )
          ).revisionId
        : question.revisionId;
    // `createQuestion`'s first revision keys B, "Choice B". The helper's
    // revision keys C, "Revised C"; the stem-only revision keeps B.
    const current =
      change === 'correct choice'
        ? (await addCurrentRevision(db, question.id)).revisionId
        : (
            await appendQuestionRevision(
              db,
              question.id,
              unchangedKey('Choice B'),
            )
          ).revisionId;
    return {
      repository: new DrizzleQuestionRepository(db),
      questionId: question.id,
      currentRevisionId: current,
      earlierRevisionId,
    };
  },
}));
