import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { GetAttemptedQuestionsUseCase } from '@/src/application/use-cases/get-attempted-questions';
import { answeredOutcome } from '@/src/domain/value-objects';
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

// ADR-022 Amendment 2026-10-05 (DEBT-498): History's result filters list only
// what a score counts, while the practice filter above still offers a
// key-corrected question again (Decision 4). The two filters differ on purpose.
describe("History's result filters and corrected keys", () => {
  it('lists a result no score counts under neither History filter, while the practice Incorrect filter still offers a key-corrected question', async () => {
    const user = await createUser(db, cleanup);
    const attempts = new DrizzleAttemptRepository(db);
    const questionRepository = new DrizzleQuestionRepository(db);
    const [corrected, held, scored] = await Promise.all(
      ['corrected', 'held', 'scored'].map((label) =>
        createQuestion(db, cleanup, {
          slug: `it-history-result-${label}-${randomUUID()}`,
          status: 'published',
          difficulty: 'easy',
        }),
      ),
    );
    if (!corrected || !held || !scored) throw new Error('questions');
    for (const [index, question] of [corrected, held, scored].entries()) {
      await attempts.insert({
        userId: user.id,
        questionId: question.id,
        questionRevisionId: question.revisionId,
        practiceSessionId: null,
        outcome: answeredOutcome(question.correctChoiceId),
        isCorrect: true,
        timeSpentSeconds: 10,
        answeredAt: new Date(Date.now() - (index + 1) * 60_000),
      });
    }
    await reviseQuestion(db, corrected, 'key');
    await setQuestionState(db, held, 'under_review');
    const history = new GetAttemptedQuestionsUseCase(
      attempts,
      questionRepository,
      new FakeLogger(),
    );
    const page = { userId: user.id, limit: 10, offset: 0 };

    const all = await history.execute(page);
    const correct = await history.execute({ ...page, result: 'correct' });
    const incorrect = await history.execute({ ...page, result: 'incorrect' });
    const practiceIncorrect =
      await questionRepository.listPublishedCandidateIds({
        tagSlugs: [],
        difficulties: [],
        statuses: ['incorrect'],
        userId: user.id,
      });

    expect(all.rows).toEqual([
      expect.objectContaining({
        questionId: corrected.id,
        answerKeyChanged: true,
      }),
      expect.objectContaining({
        questionId: held.id,
        availability: 'under_review',
      }),
      expect.objectContaining({
        questionId: scored.id,
        answerKeyChanged: false,
      }),
    ]);
    expect(correct.rows.map((row) => row.questionId)).toEqual([scored.id]);
    expect(correct.totalCount).toBe(1);
    expect(incorrect.rows).toEqual([]);
    expect(incorrect.totalCount).toBe(0);
    expect(practiceIncorrect).toContain(corrected.id);
  });
});
