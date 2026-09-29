import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { GetCompletedSessionQuestionsWithFeedbackUseCase } from '@/src/application/use-cases/get-completed-session-questions-with-feedback';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

// ADR-021 §3, phase 2a increment 5: a question withdrawn after a learner
// answered it stays reviewable by that learner, as the revision they answered,
// and is marked withdrawn (Pattern Registry F-11).
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

const attempts = new DrizzleAttemptRepository(db);
const sessions = new DrizzlePracticeSessionRepository(db);

async function createPublishedQuestion(label: string) {
  return createQuestion(db, cleanup, {
    slug: `it-withdrawn-review-${label}-${randomUUID()}`,
    status: 'published',
    difficulty: 'easy',
  });
}

// A tutor session over two questions, both answered, then ended.
async function createCompletedSession() {
  const kept = await createPublishedQuestion('kept');
  const withdrawn = await createPublishedQuestion('withdrawn');
  const user = await createUser(db, cleanup);
  const session = await sessions.create({
    userId: user.id,
    mode: 'tutor',
    paramsJson: {
      count: 2,
      tagSlugs: [],
      difficulties: [],
      questionIds: [kept.id, withdrawn.id],
    },
  });
  for (const question of [kept, withdrawn]) {
    const attempt = await attempts.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: session.id,
      outcome: {
        kind: 'answered',
        selectedChoiceId: question.incorrectChoiceId,
      },
      isCorrect: false,
      timeSpentSeconds: 7,
    });
    await sessions.recordQuestionAnswer({
      sessionId: session.id,
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.incorrectChoiceId,
      isCorrect: false,
      answeredAt: attempt.answeredAt,
    });
  }
  await sessions.end(session.id, user.id);
  return { kept, withdrawn, user, session };
}

async function withdraw(questionId: string) {
  await db
    .update(schema.questions)
    .set({ status: 'archived' })
    .where(eq(schema.questions.id, questionId));
}

describe('ADR-021 §3: a withdrawn question stays reviewable by the learner who answered it', () => {
  it('gives completed-session feedback for a withdrawn question as answered, marked withdrawn', async () => {
    const { kept, withdrawn, user, session } = await createCompletedSession();
    await withdraw(withdrawn.id);

    const feedback = await new GetCompletedSessionQuestionsWithFeedbackUseCase(
      sessions,
      new DrizzleQuestionRepository(db),
      attempts,
      new FakeLogger(),
    ).execute({ userId: user.id, sessionId: session.id });

    expect(feedback.rows).toEqual([
      expect.objectContaining({
        isAvailable: true,
        questionId: kept.id,
        withdrawn: false,
      }),
      expect.objectContaining({
        isAvailable: true,
        questionId: withdrawn.id,
        withdrawn: true,
        stemMd: '# Stem',
        selectedChoiceId: withdrawn.incorrectChoiceId,
        correctChoiceId: withdrawn.correctChoiceId,
        explanationMd: '# Explanation',
      }),
    ]);
  });
});
