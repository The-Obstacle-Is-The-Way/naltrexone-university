import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { FinalizeExamAnswersUseCase } from '@/src/application/use-cases/finalize-exam-answers';
import { GetAttemptedQuestionsUseCase } from '@/src/application/use-cases/get-attempted-questions';
import { GetCompletedSessionQuestionsWithFeedbackUseCase } from '@/src/application/use-cases/get-completed-session-questions-with-feedback';
import { GetNextQuestionUseCase } from '@/src/application/use-cases/get-next-question';
import { GetPracticeSessionReviewUseCase } from '@/src/application/use-cases/get-practice-session-review';
import { GetPreviousAttemptUseCase } from '@/src/application/use-cases/get-previous-attempt';
import { GetQuestionForViewUseCase } from '@/src/application/use-cases/get-question-for-view';
import { GetUserStatsUseCase } from '@/src/application/use-cases/get-user-stats';
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
      questionRevisionId: question.revisionId,
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
    questionRevisionId: question.revisionId,
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
      questionRevisionId: question.revisionId,
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
    questionRevisionId: answered.revisionId,
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

describe('ADR-021 §3: an attempt inside an exam still in progress is not yet reviewable', () => {
  it('shows no withdrawn question by that attempt, as the reveal gives none', async () => {
    const question = await createPublishedQuestion('exam-in-progress');
    const user = await createUser(db, cleanup);
    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    const attempt = await attempts.insert({
      userId: user.id,
      questionId: question.id,
      questionRevisionId: question.revisionId,
      practiceSessionId: session.id,
      outcome: { kind: 'answered', selectedChoiceId: question.correctChoiceId },
      isCorrect: true,
      timeSpentSeconds: 3,
    });
    await withdraw(question.id);
    const review = { attemptId: attempt.id };

    await expect(
      questionForView().execute({
        userId: user.id,
        slug: question.slug,
        review,
      }),
    ).resolves.toBeNull();
    await expect(
      new GetPreviousAttemptUseCase(
        attempts,
        new DrizzleQuestionRepository(db),
        new FakeLogger(),
        sessions,
      ).execute({ userId: user.id, questionId: question.id, ...review }),
    ).resolves.toBeNull();
  });
});

describe('ADR-021 §3: the attempt lists keep a withdrawn question the learner attempted', () => {
  it('lists it among attempted questions, as answered and marked withdrawn', async () => {
    const { question, user } = await answerThenWithdraw('attempted-list');

    const listed = await new GetAttemptedQuestionsUseCase(
      attempts,
      new DrizzleQuestionRepository(db),
      new FakeLogger(),
    ).execute({ userId: user.id, limit: 10, offset: 0 });

    expect(listed.rows).toEqual([
      expect.objectContaining({
        isAvailable: true,
        withdrawn: true,
        questionId: question.id,
        slug: question.slug,
        stemMd: '# Stem',
      }),
    ]);
  });

  it('shows each recent attempt as the revision it graded, marked withdrawn', async () => {
    const question = await createPublishedQuestion('recent-activity');
    const user = await createUser(db, cleanup);
    await attempts.insert({
      userId: user.id,
      questionId: question.id,
      questionRevisionId: question.revisionId,
      practiceSessionId: null,
      outcome: { kind: 'answered', selectedChoiceId: question.correctChoiceId },
      isCorrect: true,
      timeSpentSeconds: 5,
    });
    const revised = await addCurrentRevision(db, question.id);
    await attempts.insert({
      userId: user.id,
      questionId: question.id,
      questionRevisionId: revised.revisionId,
      practiceSessionId: null,
      outcome: { kind: 'answered', selectedChoiceId: revised.correctChoiceId },
      isCorrect: true,
      timeSpentSeconds: 5,
    });
    await withdraw(question.id);

    const stats = await new GetUserStatsUseCase(
      attempts,
      new DrizzleQuestionRepository(db),
      new FakeLogger(),
    ).execute({ userId: user.id });

    expect(stats.recentActivity).toEqual([
      expect.objectContaining({
        isAvailable: true,
        withdrawn: true,
        stemMd: '# Revised stem',
      }),
      expect.objectContaining({
        isAvailable: true,
        withdrawn: true,
        stemMd: '# Stem',
      }),
    ]);
  });
});

// A tutor session over two questions whose first item is answered; both are
// withdrawn afterwards.
async function answerFirstOfTwoThenWithdrawBoth(end: boolean) {
  const answered = await createPublishedQuestion('breakdown-answered');
  const unanswered = await createPublishedQuestion('breakdown-unanswered');
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
    questionRevisionId: answered.revisionId,
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
  if (end) await sessions.end(session.id, user.id);
  await withdraw(answered.id);
  await withdraw(unanswered.id);
  const review = await new GetPracticeSessionReviewUseCase(
    sessions,
    new DrizzleQuestionRepository(db),
    new FakeLogger(),
  ).execute({ userId: user.id, sessionId: session.id });
  return { answered, unanswered, review };
}

describe('ADR-021 §3: the session breakdown keeps a withdrawn item the learner attempted', () => {
  it('shows the answered item of an ended session, marked withdrawn, and hides the unanswered one', async () => {
    const { answered, unanswered, review } =
      await answerFirstOfTwoThenWithdrawBoth(true);

    expect(review.rows).toEqual([
      expect.objectContaining({
        isAvailable: true,
        withdrawn: true,
        questionId: answered.id,
        stemMd: '# Stem',
      }),
      expect.objectContaining({
        isAvailable: false,
        questionId: unanswered.id,
      }),
    ]);
  });

  it('hides a withdrawn item while the session is still in progress', async () => {
    const { answered, review } = await answerFirstOfTwoThenWithdrawBoth(false);

    expect(review.rows[0]).toMatchObject({
      isAvailable: false,
      questionId: answered.id,
    });
  });
});

describe('ADR-021 §3: an active session reaches a withdrawn item as withdrawn, with no content', () => {
  it('returns the item by id, and as the next unanswered item, with its place in the session', async () => {
    const first = await createPublishedQuestion('active-first');
    const second = await createPublishedQuestion('active-second');
    const user = await createUser(db, cleanup);
    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 2,
        tagSlugs: [],
        difficulties: [],
        questionIds: [first.id, second.id],
      },
    });
    await withdraw(second.id);
    const nextQuestion = new GetNextQuestionUseCase(
      new DrizzleQuestionRepository(db),
      attempts,
      sessions,
    );

    const byId = await nextQuestion.execute({
      userId: user.id,
      sessionId: session.id,
      questionId: second.id,
    });
    const sequential = await nextQuestion.execute({
      userId: user.id,
      sessionId: session.id,
      fromIndex: 0,
    });

    for (const item of [byId, sequential]) {
      expect(item).toEqual({
        withdrawn: true,
        questionId: second.id,
        session: expect.objectContaining({
          sessionId: session.id,
          mode: 'exam',
          index: 1,
          total: 2,
          isMarkedForReview: false,
        }),
      });
    }
  });
});

// ADR-022 Decision 2: an exam item the learner left unanswered is finalized as
// an omitted attempt. An omitted attempt is not an answer, so once the
// question is withdrawn, no read reveals its content: not the stem, the key or
// the explanation.
describe('ADR-022 Decision 2: an omitted exam item withdrawn since reveals nothing', () => {
  it('finalizes an exam with an unanswered item, then hides it from every review once withdrawn', async () => {
    const question = await createPublishedQuestion('omitted');
    const user = await createUser(db, cleanup);
    const session = await sessions.create({
      userId: user.id,
      mode: 'exam',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });
    await new FinalizeExamAnswersUseCase(
      new DrizzleQuestionRepository(db),
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
    await withdraw(question.id);
    const questions = new DrizzleQuestionRepository(db);
    const reader = { userId: user.id, sessionId: session.id };

    const feedback = await new GetCompletedSessionQuestionsWithFeedbackUseCase(
      sessions,
      questions,
      attempts,
      new FakeLogger(),
    ).execute(reader);
    const review = await new GetPracticeSessionReviewUseCase(
      sessions,
      questions,
      new FakeLogger(),
    ).execute(reader);
    const history = await new GetAttemptedQuestionsUseCase(
      attempts,
      questions,
      new FakeLogger(),
    ).execute({ userId: user.id, limit: 10, offset: 0 });
    const stats = await new GetUserStatsUseCase(
      attempts,
      questions,
      new FakeLogger(),
    ).execute({ userId: user.id });

    expect(feedback.rows).toEqual([
      expect.objectContaining({ isAvailable: false, isOmitted: true }),
    ]);
    expect(review.rows).toEqual([
      expect.objectContaining({ isAvailable: false, isOmitted: true }),
    ]);
    expect(history.rows).toEqual([
      expect.objectContaining({ isAvailable: false, questionId: question.id }),
    ]);
    expect(stats.recentActivity).toEqual([
      expect.objectContaining({ isAvailable: false, questionId: question.id }),
    ]);
    for (const row of [
      ...feedback.rows,
      ...review.rows,
      ...history.rows,
      ...stats.recentActivity,
    ]) {
      expect(row).not.toHaveProperty('stemMd');
    }
    await expect(
      questionForView().execute({
        userId: user.id,
        slug: question.slug,
        review: { sessionId: session.id },
      }),
    ).resolves.toBeNull();
    await expect(
      questionForView().execute({
        userId: user.id,
        slug: question.slug,
        review: {},
      }),
    ).resolves.toBeNull();
    await expect(
      new GetPreviousAttemptUseCase(
        attempts,
        questions,
        new FakeLogger(),
        sessions,
      ).execute({ userId: user.id, questionId: question.id }),
    ).resolves.toBeNull();
  });
});
