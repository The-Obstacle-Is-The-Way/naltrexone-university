import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { answeredOutcome } from '@/src/domain/value-objects';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';
import { reviseQuestion } from './question-state-test-helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

// ADR-022 Decision 4: an answer graded on a key corrected since is included
// in the Incorrect practice filter, so a learner who may have learned the old
// answer practises the corrected one.
describe('the Incorrect practice filter and corrected keys', () => {
  it('includes a latest answer whose key was corrected since, but not one whose stem was reworded', async () => {
    const user = await createUser(db, cleanup);
    const attempts = new DrizzleAttemptRepository(db);
    const [corrected, reworded, missed] = await Promise.all(
      ['corrected', 'reworded', 'missed'].map((label) =>
        createQuestion(db, cleanup, {
          slug: `it-key-filter-${label}-${randomUUID()}`,
          status: 'published',
          difficulty: 'easy',
        }),
      ),
    );
    if (!corrected || !reworded || !missed) throw new Error('questions');
    for (const [question, right] of [
      [corrected, true],
      [reworded, true],
      [missed, false],
    ] as const) {
      await attempts.insert({
        userId: user.id,
        questionId: question.id,
        questionRevisionId: question.revisionId,
        practiceSessionId: null,
        outcome: answeredOutcome(
          right ? question.correctChoiceId : question.incorrectChoiceId,
        ),
        isCorrect: right,
        timeSpentSeconds: 10,
      });
    }
    await reviseQuestion(db, corrected, 'key');
    await reviseQuestion(db, reworded, 'stem');

    const ids = await new DrizzleQuestionRepository(
      db,
    ).listPublishedCandidateIds({
      tagSlugs: [],
      difficulties: [],
      statuses: ['incorrect'],
      userId: user.id,
    });

    expect([...ids].sort()).toEqual([corrected.id, missed.id].sort());
  });
});
