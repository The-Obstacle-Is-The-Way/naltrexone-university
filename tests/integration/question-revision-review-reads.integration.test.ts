import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { GetCompletedSessionQuestionsWithFeedbackUseCase } from '@/src/application/use-cases/get-completed-session-questions-with-feedback';
import { GetPracticeSessionReviewUseCase } from '@/src/application/use-cases/get-practice-session-review';
import { GetPreviousAttemptUseCase } from '@/src/application/use-cases/get-previous-attempt';
import {
  addCurrentRevision,
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
  currentRevisionIdOf,
} from './helpers';

// ADR-021 phase 2a, third increment (3c-i): reviewing a session or an earlier
// attempt shows the revision the learner was shown and graded against, even
// after the question gains a newer revision.
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
const sessions = new DrizzlePracticeSessionRepository(db);

async function createPublishedQuestion(label: string) {
  return createQuestion(db, cleanup, {
    slug: `it-revision-review-${label}-${randomUUID()}`,
    status: 'published',
    difficulty: 'easy',
  });
}

// A tutor session over two questions: the first answered correctly, the
// second left unanswered. The session ends, then both questions gain a newer
// current revision.
async function createAnsweredSessionThenRevise() {
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
    questionRevisionId: null,
    practiceSessionId: session.id,
    outcome: { kind: 'answered', selectedChoiceId: answered.correctChoiceId },
    isCorrect: true,
    timeSpentSeconds: 9,
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
  const answeredRevisionId = await currentRevisionIdOf(db, answered.id);
  await addCurrentRevision(db, answered.id);
  await addCurrentRevision(db, unanswered.id);
  return { answered, unanswered, user, session, attempt, answeredRevisionId };
}

function previousAttempt() {
  return new GetPreviousAttemptUseCase(
    attempts,
    questions,
    new FakeLogger(),
    sessions,
  );
}

describe('ADR-021 phase 2a: review reads use the bound revision', () => {
  it('carries the revision an attempt graded', async () => {
    const { user, attempt, answeredRevisionId } =
      await createAnsweredSessionThenRevise();

    const read = await attempts.findByIdAndUserId(attempt.id, user.id);

    expect(read?.questionRevisionId).toBe(answeredRevisionId);
  });

  it('reviews a session as the revisions its items were bound to', async () => {
    const { user, session } = await createAnsweredSessionThenRevise();

    const review = await new GetPracticeSessionReviewUseCase(
      sessions,
      questions,
      new FakeLogger(),
    ).execute({ userId: user.id, sessionId: session.id });

    expect(
      review.rows.map((row) =>
        row.isAvailable ? [row.stemMd, row.difficulty] : null,
      ),
    ).toEqual([
      ['# Stem', 'easy'],
      ['# Stem', 'easy'],
    ]);
  });

  it('gives a completed session’s feedback from the bound revision', async () => {
    const { answered, user, session } = await createAnsweredSessionThenRevise();

    const feedback = await new GetCompletedSessionQuestionsWithFeedbackUseCase(
      sessions,
      questions,
      attempts,
      new FakeLogger(),
    ).execute({ userId: user.id, sessionId: session.id });

    const [row] = feedback.rows;
    expect(row).toMatchObject({
      isAvailable: true,
      stemMd: '# Stem',
      selectedChoiceId: answered.correctChoiceId,
      correctChoiceId: answered.correctChoiceId,
      explanationMd: '# Explanation',
    });
    expect(
      row?.isAvailable ? row.choices.map((choice) => choice.id).sort() : [],
    ).toEqual([answered.correctChoiceId, answered.incorrectChoiceId].sort());
  });

  it('shows an earlier session attempt as the revision it graded', async () => {
    const { answered, user, attempt } = await createAnsweredSessionThenRevise();

    const result = await previousAttempt().execute({
      userId: user.id,
      questionId: answered.id,
      attemptId: attempt.id,
    });

    expect(result).toMatchObject({
      kind: 'attempt',
      correctChoiceId: answered.correctChoiceId,
      explanationMd: '# Explanation',
    });
  });

  it('shows an earlier attempt outside a session as the revision it graded', async () => {
    const question = await createPublishedQuestion('standalone');
    const user = await createUser(db, cleanup);
    const attempt = await attempts.insert({
      userId: user.id,
      questionId: question.id,
      questionRevisionId: null,
      practiceSessionId: null,
      outcome: {
        kind: 'answered',
        selectedChoiceId: question.incorrectChoiceId,
      },
      isCorrect: false,
      timeSpentSeconds: 4,
    });
    await addCurrentRevision(db, question.id);

    const result = await previousAttempt().execute({
      userId: user.id,
      questionId: question.id,
    });

    expect(result).toMatchObject({
      kind: 'attempt',
      attemptId: attempt.id,
      selectedChoiceId: question.incorrectChoiceId,
      correctChoiceId: question.correctChoiceId,
    });
  });

  it('reveals an unanswered item of an ended session as its bound revision', async () => {
    const { unanswered, user, session } =
      await createAnsweredSessionThenRevise();

    const result = await previousAttempt().execute({
      userId: user.id,
      questionId: unanswered.id,
      sessionId: session.id,
    });

    expect(result).toMatchObject({
      kind: 'session_unanswered',
      correctChoiceId: unanswered.correctChoiceId,
      explanationMd: '# Explanation',
    });
  });
});
