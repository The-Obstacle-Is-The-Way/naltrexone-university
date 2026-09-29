import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { GetCompletedSessionQuestionsWithFeedbackUseCase } from '@/src/application/use-cases/get-completed-session-questions-with-feedback';
import { GetPreviousAttemptUseCase } from '@/src/application/use-cases/get-previous-attempt';
import { GetQuestionForViewUseCase } from '@/src/application/use-cases/get-question-for-view';
import {
  addCurrentRevision,
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

function questionForView() {
  return new GetQuestionForViewUseCase(
    new DrizzleQuestionRepository(db),
    attempts,
    sessions,
  );
}

// A learner's answer outside a session, to a question later withdrawn.
async function answerThenWithdraw(label: string) {
  const question = await createPublishedQuestion(label);
  const user = await createUser(db, cleanup);
  const attempt = await attempts.insert({
    userId: user.id,
    questionId: question.id,
    practiceSessionId: null,
    outcome: { kind: 'answered', selectedChoiceId: question.correctChoiceId },
    isCorrect: true,
    timeSpentSeconds: 5,
  });
  await withdraw(question.id);
  return { question, user, attempt };
}

describe('ADR-021 §3: the standalone review of a withdrawn question', () => {
  it('shows it to the learner by the attempt they are reviewing, marked withdrawn', async () => {
    const { question, user, attempt } = await answerThenWithdraw('by-attempt');

    const view = await questionForView().execute({
      userId: user.id,
      slug: question.slug,
      review: { attemptId: attempt.id },
    });

    expect(view).toMatchObject({
      withdrawn: true,
      question: { id: question.id, stemMd: '# Stem' },
    });
  });

  it('shows it by the learner’s latest attempt when the review names none', async () => {
    const { question, user } = await answerThenWithdraw('latest');

    const view = await questionForView().execute({
      userId: user.id,
      slug: question.slug,
      review: {},
    });

    expect(view).toMatchObject({ withdrawn: true });
  });

  it('shows it by the learner’s finished session item', async () => {
    const { withdrawn, user, session } = await createCompletedSession();
    await withdraw(withdrawn.id);

    const view = await questionForView().execute({
      userId: user.id,
      slug: withdrawn.slug,
      review: { sessionId: session.id },
    });

    expect(view).toMatchObject({ withdrawn: true });
  });

  it('never shows it to a learner who did not answer it', async () => {
    const { question } = await answerThenWithdraw('stranger');
    const stranger = await createUser(db, cleanup);

    await expect(
      questionForView().execute({
        userId: stranger.id,
        slug: question.slug,
        review: {},
      }),
    ).resolves.toBeNull();
  });

  it('never shows it through another learner’s attempt', async () => {
    const { question, attempt } = await answerThenWithdraw('borrowed');
    const stranger = await createUser(db, cleanup);

    await expect(
      questionForView().execute({
        userId: stranger.id,
        slug: question.slug,
        review: { attemptId: attempt.id },
      }),
    ).resolves.toBeNull();
  });

  it('never shows it outside review', async () => {
    const { question, user } = await answerThenWithdraw('practice');

    await expect(
      questionForView().execute({ userId: user.id, slug: question.slug }),
    ).resolves.toBeNull();
  });

  it('reviews a published question as the revision the learner answered', async () => {
    const question = await createPublishedQuestion('revised');
    const user = await createUser(db, cleanup);
    const attempt = await attempts.insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      outcome: { kind: 'answered', selectedChoiceId: question.correctChoiceId },
      isCorrect: true,
      timeSpentSeconds: 5,
    });
    await addCurrentRevision(db, question.id);

    const view = await questionForView().execute({
      userId: user.id,
      slug: question.slug,
      review: { attemptId: attempt.id },
    });

    expect(view).toMatchObject({
      withdrawn: false,
      question: { stemMd: '# Stem' },
    });
    expect(view?.question.choices.map((choice) => choice.id).sort()).toEqual(
      [question.correctChoiceId, question.incorrectChoiceId].sort(),
    );
  });

  it('gives the previous attempt of a withdrawn question to the learner who answered it', async () => {
    const { question, user, attempt } = await answerThenWithdraw('previous');

    const previous = await new GetPreviousAttemptUseCase(
      attempts,
      new DrizzleQuestionRepository(db),
      new FakeLogger(),
      sessions,
    ).execute({
      userId: user.id,
      questionId: question.id,
      attemptId: attempt.id,
    });

    expect(previous).toMatchObject({
      kind: 'attempt',
      correctChoiceId: question.correctChoiceId,
    });
  });
});

// A finished tutor session whose second item the learner never answered, and
// which is withdrawn afterwards: the learner never attempted it (ADR-021 §3).
async function finishWithUnansweredThenWithdraw() {
  const answered = await createPublishedQuestion('answered');
  const unanswered = await createPublishedQuestion('unanswered');
  const user = await createUser(db, cleanup);
  const session = await sessions.create({
    userId: user.id,
    mode: 'tutor',
    paramsJson: {
      count: 2,
      tagSlugs: [],
      difficulties: [],
      questionIds: [answered.id, unanswered.id],
    },
  });
  const attempt = await attempts.insert({
    userId: user.id,
    questionId: answered.id,
    practiceSessionId: session.id,
    outcome: { kind: 'answered', selectedChoiceId: answered.correctChoiceId },
    isCorrect: true,
    timeSpentSeconds: 4,
  });
  await sessions.recordQuestionAnswer({
    sessionId: session.id,
    userId: user.id,
    questionId: answered.id,
    selectedChoiceId: answered.correctChoiceId,
    isCorrect: true,
    answeredAt: attempt.answeredAt,
  });
  await sessions.end(session.id, user.id);
  await withdraw(unanswered.id);
  return { answered, unanswered, user, session };
}

describe('ADR-021 §3: a withdrawn question the learner never attempted stays hidden', () => {
  it('keeps it unavailable in completed-session feedback', async () => {
    const { answered, unanswered, user, session } =
      await finishWithUnansweredThenWithdraw();

    const feedback = await new GetCompletedSessionQuestionsWithFeedbackUseCase(
      sessions,
      new DrizzleQuestionRepository(db),
      attempts,
      new FakeLogger(),
    ).execute({ userId: user.id, sessionId: session.id });

    expect(feedback.rows).toEqual([
      expect.objectContaining({ isAvailable: true, questionId: answered.id }),
      { ...feedback.rows[1], isAvailable: false, questionId: unanswered.id },
    ]);
    expect(feedback.rows[1]).not.toHaveProperty('stemMd');
  });

  it('shows no standalone review of it by the session', async () => {
    const { unanswered, user, session } =
      await finishWithUnansweredThenWithdraw();

    await expect(
      questionForView().execute({
        userId: user.id,
        slug: unanswered.slug,
        review: { sessionId: session.id },
      }),
    ).resolves.toBeNull();
  });

  it('reveals no answer to it for the session', async () => {
    const { unanswered, user, session } =
      await finishWithUnansweredThenWithdraw();

    await expect(
      new GetPreviousAttemptUseCase(
        attempts,
        new DrizzleQuestionRepository(db),
        new FakeLogger(),
        sessions,
      ).execute({
        userId: user.id,
        questionId: unanswered.id,
        sessionId: session.id,
      }),
    ).resolves.toBeNull();
  });
});
