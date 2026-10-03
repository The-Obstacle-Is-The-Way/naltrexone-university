import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
} from './helpers';
import {
  type QuestionStateNow,
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

// The helper leaves a question as the content commands do, so the question
// repository reads back the learner-facing state it was given (ADR-022
// Decision 1).
describe('setQuestionState', () => {
  async function readBack(states: readonly QuestionStateNow[]) {
    const question = await createQuestion(db, cleanup, {
      slug: `it-question-state-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    for (const state of states) await setQuestionState(db, question, state);
    const read = await new DrizzleQuestionRepository(db).findByIdForSession({
      questionId: question.id,
      questionRevisionId: question.revisionId,
    });
    return read?.availability;
  }

  it.each(['available', 'retired', 'withdrawn', 'under_review'] as const)(
    'reads back %s',
    async (state) => {
      await expect(readBack([state])).resolves.toBe(state);
    },
  );

  it('lifts a hold when the question becomes available again', async () => {
    await expect(
      readBack(['under_review', 'available', 'retired']),
    ).resolves.toBe('retired');
  });
});
