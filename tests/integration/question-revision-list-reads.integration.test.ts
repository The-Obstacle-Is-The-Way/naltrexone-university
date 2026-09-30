import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzleBookmarkRepository } from '@/src/adapters/repositories/drizzle-bookmark-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { GetAttemptedQuestionsUseCase } from '@/src/application/use-cases/get-attempted-questions';
import { GetUserStatsUseCase } from '@/src/application/use-cases/get-user-stats';
import type { QuestionDifficulty } from '@/src/domain/value-objects';
import {
  addCurrentRevision,
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

// ADR-021 phase 2a, third increment (3c-ii): lists of earlier answers show and
// filter by the revision each was answered against; bookmarks, which bind no
// revision, show the current one.
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

const questions = new DrizzleQuestionRepository(db);
const attempts = new DrizzleAttemptRepository(db);

async function createPublishedQuestion(
  label: string,
  difficulty: QuestionDifficulty,
) {
  return createQuestion(db, cleanup, {
    slug: `it-revision-list-${label}-${randomUUID()}`,
    status: 'published',
    difficulty,
  });
}

// A newer revision made current. As the seed does, the legacy row is rewritten
// with the new content too, so a read of the legacy columns is caught.
async function reviseQuestion(questionId: string) {
  const revised = await addCurrentRevision(db, questionId);
  await db
    .update(schema.questions)
    .set({ stemMd: '# Revised stem', difficulty: 'hard' })
    .where(eq(schema.questions.id, questionId));
  return revised;
}

async function answer(
  userId: string,
  question: { id: string; correctChoiceId: string },
  answeredAt: Date,
) {
  return attempts.insert({
    userId,
    questionId: question.id,
    questionRevisionId: null,
    practiceSessionId: null,
    outcome: { kind: 'answered', selectedChoiceId: question.correctChoiceId },
    isCorrect: true,
    timeSpentSeconds: 5,
    answeredAt,
  });
}

function attemptedQuestions() {
  return new GetAttemptedQuestionsUseCase(
    attempts,
    questions,
    new FakeLogger(),
  );
}

describe('ADR-021 phase 2a: list reads use the answered revision', () => {
  it('shows and filters an attempted question by the revision it was answered against', async () => {
    const user = await createUser(db, cleanup);
    const question = await createPublishedQuestion('attempted', 'easy');
    await answer(user.id, question, new Date('2026-09-01T10:00:00Z'));
    await reviseQuestion(question.id);
    const page = { userId: user.id, limit: 10, offset: 0 };

    const easy = await attemptedQuestions().execute({
      ...page,
      difficulty: 'easy',
    });
    const hard = await attemptedQuestions().execute({
      ...page,
      difficulty: 'hard',
    });

    expect(easy.totalCount).toBe(1);
    expect(easy.rows).toEqual([
      expect.objectContaining({
        isAvailable: true,
        questionId: question.id,
        stemMd: '# Stem',
        difficulty: 'easy',
      }),
    ]);
    expect(hard.totalCount).toBe(0);
    expect(hard.rows).toEqual([]);
  });

  it('sorts attempted questions by the difficulty each was answered at', async () => {
    const user = await createUser(db, cleanup);
    const alwaysHard = await createPublishedQuestion('always-hard', 'hard');
    const answeredEasy = await createPublishedQuestion('answered-easy', 'easy');
    await answer(user.id, alwaysHard, new Date('2026-09-01T10:00:00Z'));
    await answer(user.id, answeredEasy, new Date('2026-09-02T10:00:00Z'));
    await reviseQuestion(answeredEasy.id);

    const sorted = await attemptedQuestions().execute({
      userId: user.id,
      limit: 10,
      offset: 0,
      sort: 'difficulty',
    });

    expect(sorted.rows.map((row) => row.questionId)).toEqual([
      alwaysHard.id,
      answeredEasy.id,
    ]);
  });

  it('shows each recent attempt as the revision it graded', async () => {
    const user = await createUser(db, cleanup);
    const question = await createPublishedQuestion('recent', 'easy');
    await answer(user.id, question, new Date('2026-09-01T10:00:00Z'));
    const revised = await reviseQuestion(question.id);
    // The second answer selects a choice of the revision now current.
    await answer(
      user.id,
      { id: question.id, correctChoiceId: revised.correctChoiceId },
      new Date('2026-09-02T10:00:00Z'),
    );

    const stats = await new GetUserStatsUseCase(
      attempts,
      questions,
      new FakeLogger(),
    ).execute({ userId: user.id });

    expect(
      stats.recentActivity.map((row) =>
        row.isAvailable ? [row.stemMd, row.difficulty] : null,
      ),
    ).toEqual([
      ['# Revised stem', 'hard'],
      ['# Stem', 'easy'],
    ]);
  });

  it('shows a bookmark as its question’s current revision', async () => {
    const user = await createUser(db, cleanup);
    const question = await createPublishedQuestion('bookmark', 'easy');
    await db
      .insert(schema.bookmarks)
      .values({ userId: user.id, questionId: question.id });
    await addCurrentRevision(db, question.id);

    const summaries = await new DrizzleBookmarkRepository(
      db,
    ).listSummariesByUserId(user.id);

    expect(summaries).toEqual([
      expect.objectContaining({
        isAvailable: true,
        stemMd: '# Revised stem',
        difficulty: 'hard',
      }),
    ]);
  });
});
