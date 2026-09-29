import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { DrizzleQuestionRepository } from '@/src/adapters/repositories/drizzle-question-repository';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { FinalizeExamAnswersUseCase } from '@/src/application/use-cases/finalize-exam-answers';
import { GetNextQuestionUseCase } from '@/src/application/use-cases/get-next-question';
import { SaveExamDraftAnswerUseCase } from '@/src/application/use-cases/save-exam-draft-answer';
import { SubmitAnswerUseCase } from '@/src/application/use-cases/submit-answer';
import type { PracticeMode } from '@/src/domain/value-objects';
import {
  addCurrentRevision,
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

// ADR-021 phase 2a, third increment (3b): what a session shows, what it grades
// and what its attempt records are the revision the session item was bound to
// when the session began, even after the question gains a newer revision.
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

function transaction<T>(
  fn: (tx: {
    questions: DrizzleQuestionRepository;
    attempts: DrizzleAttemptRepository;
    sessions: DrizzlePracticeSessionRepository;
  }) => Promise<T>,
) {
  return db.transaction((tx) =>
    fn({
      questions: new DrizzleQuestionRepository(tx),
      attempts: new DrizzleAttemptRepository(tx),
      sessions: new DrizzlePracticeSessionRepository(tx),
    }),
  );
}

// A one-question session bound to revision 1, after which revision 2 becomes
// the question's current revision.
async function createSessionThenRevise(mode: PracticeMode) {
  const question = await createQuestion(db, cleanup, {
    slug: `it-revision-session-${mode}-${randomUUID()}`,
    status: 'published',
    difficulty: 'easy',
  });
  const user = await createUser(db, cleanup);
  const session = await sessions.create({
    userId: user.id,
    mode,
    paramsJson: {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [question.id],
    },
  });
  const revised = await addCurrentRevision(db, question.id);
  return { question, user, session, revised };
}

async function attemptRevisionIds(sessionId: string) {
  const rows = await db
    .select({
      revisionId: schema.attempts.questionRevisionId,
      isCorrect: schema.attempts.isCorrect,
    })
    .from(schema.attempts)
    .where(eq(schema.attempts.practiceSessionId, sessionId));
  return rows;
}

async function boundRevisionId(sessionId: string, questionId: string) {
  const [row] = await db
    .select({ id: schema.practiceSessionQuestionStates.questionRevisionId })
    .from(schema.practiceSessionQuestionStates)
    .where(
      and(
        eq(schema.practiceSessionQuestionStates.practiceSessionId, sessionId),
        eq(schema.practiceSessionQuestionStates.questionId, questionId),
      ),
    );
  return row?.id ?? null;
}

function submitAnswer() {
  return new SubmitAnswerUseCase(
    questions,
    attempts,
    sessions,
    new FakeLogger(),
    transaction,
  );
}

describe('ADR-021 phase 2a: session reads and grading use the bound revision', () => {
  it('carries each session item’s bound revision', async () => {
    const { question, user, session } = await createSessionThenRevise('tutor');

    const read = await sessions.findByIdAndUserId(session.id, user.id);

    expect(read?.questionStates[0]?.questionRevisionId).toBe(
      await boundRevisionId(session.id, question.id),
    );
  });

  it('shows a session item as the revision it was bound to', async () => {
    const { question, user, session } = await createSessionThenRevise('tutor');

    const next = await new GetNextQuestionUseCase(
      questions,
      attempts,
      sessions,
    ).execute({ userId: user.id, sessionId: session.id });

    expect(next?.stemMd).toBe('# Stem');
    expect(next?.choices.map((choice) => choice.id).sort()).toEqual(
      [question.correctChoiceId, question.incorrectChoiceId].sort(),
    );
  });

  it('shows an item an older deployment left unbound as the current revision', async () => {
    const { user, session, revised } = await createSessionThenRevise('tutor');
    await db
      .update(schema.practiceSessionQuestionStates)
      .set({ questionRevisionId: null })
      .where(
        eq(schema.practiceSessionQuestionStates.practiceSessionId, session.id),
      );

    const next = await new GetNextQuestionUseCase(
      questions,
      attempts,
      sessions,
    ).execute({ userId: user.id, sessionId: session.id });

    expect(next?.stemMd).toBe('# Revised stem');
    expect(next?.choices.map((choice) => choice.id).sort()).toEqual(
      [revised.correctChoiceId, revised.incorrectChoiceId].sort(),
    );
  });

  it('grades a session answer against the bound revision and records it', async () => {
    const { question, user, session } = await createSessionThenRevise('tutor');

    const result = await submitAnswer().execute({
      userId: user.id,
      questionId: question.id,
      choiceId: question.correctChoiceId,
      sessionId: session.id,
    });

    expect(result).toMatchObject({
      isCorrect: true,
      correctChoiceId: question.correctChoiceId,
      explanationMd: '# Explanation',
    });
    await expect(attemptRevisionIds(session.id)).resolves.toEqual([
      {
        revisionId: await boundRevisionId(session.id, question.id),
        isCorrect: true,
      },
    ]);
  });

  it('refuses a choice of a newer revision in a session bound to an older one', async () => {
    const { question, user, session, revised } =
      await createSessionThenRevise('tutor');

    await expect(
      submitAnswer().execute({
        userId: user.id,
        questionId: question.id,
        choiceId: revised.correctChoiceId,
        sessionId: session.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(attemptRevisionIds(session.id)).resolves.toEqual([]);
  });

  it('saves and grades an exam draft against the bound revision', async () => {
    const { question, user, session, revised } =
      await createSessionThenRevise('exam');
    const saveDraft = new SaveExamDraftAnswerUseCase(questions, sessions);

    await expect(
      saveDraft.execute({
        userId: user.id,
        sessionId: session.id,
        questionId: question.id,
        selectedChoiceId: revised.correctChoiceId,
        cumulativeMs: 1_000,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await saveDraft.execute({
      userId: user.id,
      sessionId: session.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      cumulativeMs: 1_000,
    });
    await new FinalizeExamAnswersUseCase(
      questions,
      attempts,
      sessions,
      transaction,
    ).execute({ userId: user.id, sessionId: session.id });

    await expect(attemptRevisionIds(session.id)).resolves.toEqual([
      {
        revisionId: await boundRevisionId(session.id, question.id),
        isCorrect: true,
      },
    ]);
  });
});
