import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { FinalizeExamAnswersUseCase } from '@/src/application/use-cases/finalize-exam-answers';
import { GetPracticeSessionSummaryUseCase } from '@/src/application/use-cases/get-practice-session-summary';
import { GetSessionHistoryUseCase } from '@/src/application/use-cases/get-session-history';
import { GetUserStatsUseCase } from '@/src/application/use-cases/get-user-stats';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';
import { setQuestionState } from './question-state-test-helpers';

// DEBT-493 / ADR-022 Amendment (DEBT-494): one scoring rule everywhere. An
// item counts when the learner had a fair chance at it, recorded when the
// session ended, and its content is not now in doubt. The session summary,
// History and the Dashboard must agree at every step.
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
const questions = new DrizzleQuestionRepository(db);

describe('ADR-022 Amendment: every score counts the same items', () => {
  it('agrees across the summary, History and the Dashboard as content changes during and after an exam', async () => {
    const [kept, heldDuring, heldAfter, retiredAfter] = await Promise.all(
      ['kept', 'held-during', 'held-after', 'retired-after'].map((label) =>
        createQuestion(db, cleanup, {
          slug: `it-scores-${label}-${randomUUID()}`,
          status: 'published',
          difficulty: 'easy',
        }),
      ),
    );
    if (!kept || !heldDuring || !heldAfter || !retiredAfter) {
      throw new Error('questions');
    }
    const user = await createUser(db, cleanup);
    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 4,
        tagSlugs: [],
        difficulties: [],
        questionIds: [kept.id, heldDuring.id, heldAfter.id, retiredAfter.id],
      },
    });
    for (const [question, choiceId] of [
      [kept, kept.correctChoiceId],
      [heldDuring, heldDuring.correctChoiceId],
      [heldAfter, heldAfter.correctChoiceId],
      [retiredAfter, retiredAfter.incorrectChoiceId],
    ] as const) {
      await sessions.saveDraftAnswer({
        sessionId: session.id,
        userId: user.id,
        questionId: question.id,
        selectedChoiceId: choiceId,
        cumulativeMs: 5_000,
      });
    }
    // Held before the learner submits: no fair chance at it.
    await setQuestionState(db, heldDuring, 'under_review');

    const finalized = await new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      (fn) =>
        db.transaction((tx) =>
          fn({
            questions: new DrizzleQuestionRepository(tx),
            attempts: new DrizzleAttemptRepository(tx),
            sessions: new DrizzlePracticeSessionRepository(tx),
          }),
        ),
    ).execute({ userId: user.id, sessionId: session.id });

    const reader = { userId: user.id, sessionId: session.id };
    const scores = async () => {
      const summary = await new GetPracticeSessionSummaryUseCase(
        sessions,
        questions,
      ).execute(reader);
      const history = await new GetSessionHistoryUseCase(sessions).execute({
        userId: user.id,
        limit: 10,
        offset: 0,
      });
      const stats = await new GetUserStatsUseCase(
        attempts,
        questions,
        new FakeLogger(),
      ).execute({ userId: user.id });
      return { summary: summary.totals, history: history.rows, stats };
    };
    const expectEverywhere = async (
      totals: { scored: number; correct: number; accuracy: number },
      unscoredQuestions: number,
    ) => {
      const now = await scores();
      expect(now.summary).toMatchObject({ answered: 4, ...totals });
      expect(now.history).toEqual([
        expect.objectContaining({ answered: 4, ...totals }),
      ]);
      expect(now.stats).toMatchObject({
        totalAnswered: 4,
        scoredOverall: totals.scored,
        accuracyOverall: totals.accuracy,
        unscoredQuestionsOverall: unscoredQuestions,
      });
    };

    // At submission: the item held during the exam is left out.
    expect(finalized.totals).toMatchObject({
      answered: 4,
      scored: 3,
      correct: 2,
      accuracy: 2 / 3,
    });
    await expectEverywhere({ scored: 3, correct: 2, accuracy: 2 / 3 }, 1);

    // After the exam: a hold leaves its item out; retirement changes nothing.
    await setQuestionState(db, heldAfter, 'under_review');
    await setQuestionState(db, retiredAfter, 'retired');
    await expectEverywhere({ scored: 2, correct: 1, accuracy: 0.5 }, 2);

    // Both holds lift: only the item held after the exam returns, since the
    // learner had no fair chance at the other.
    await setQuestionState(db, heldDuring, 'available');
    await setQuestionState(db, heldAfter, 'available');
    await expectEverywhere({ scored: 3, correct: 2, accuracy: 2 / 3 }, 1);
  });
});
