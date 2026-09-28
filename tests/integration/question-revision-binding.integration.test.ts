import { randomUUID } from 'node:crypto';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleAttemptRepository } from '@/src/adapters/repositories/drizzle-attempt-repository';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

// ADR-021 phase 2a, first increment: every new practice session binds each
// item to its question's current revision, every new attempt binds the
// revision it graded, and the database refuses a selected choice that belongs
// to another revision of the same question.
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

async function currentRevisionId(questionId: string) {
  const [row] = await db
    .select({ id: schema.questions.currentRevisionId })
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId));
  return row?.id ?? null;
}

async function stateRevisionId(sessionId: string, questionId: string) {
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

async function attemptRevisionId(attemptId: string) {
  const [row] = await db
    .select({ id: schema.attempts.questionRevisionId })
    .from(schema.attempts)
    .where(eq(schema.attempts.id, attemptId));
  return row?.id ?? null;
}

async function createSessionWith(questionIds: string[]) {
  const user = await createUser(db, cleanup);
  const session = await new DrizzlePracticeSessionRepository(db).create({
    userId: user.id,
    mode: 'tutor',
    paramsJson: {
      count: questionIds.length,
      tagSlugs: [],
      difficulties: [],
      questionIds,
    },
  });
  return { user, session };
}

async function createPublishedQuestion(label: string) {
  return createQuestion(db, cleanup, {
    slug: `it-revision-binding-${label}-${randomUUID()}`,
    status: 'published',
    difficulty: 'medium',
  });
}

// A second revision of the question with its own choice, as phase 2b will
// write; phase 2a never creates one, but the database must already refuse a
// selection that mixes revisions.
async function createOtherRevisionChoice(questionId: string) {
  const [revision] = await db
    .insert(schema.questionRevisions)
    .values({
      questionId,
      revisionNumber: 2,
      stemMd: '# Stem, revised',
      explanationMd: '# Explanation',
      difficulty: 'medium',
      canonicalizationVersion: 'stored-fields-json-v1',
      contentHash: 'a'.repeat(64),
    })
    .returning({ id: schema.questionRevisions.id });
  const [choice] = await db
    .insert(schema.choices)
    .values({
      questionId,
      questionRevisionId: revision?.id,
      label: 'C',
      textMd: 'Choice C, revised',
      isCorrect: true,
      sortOrder: 3,
    })
    .returning({ id: schema.choices.id });
  return String(choice?.id);
}

function foreignKeyViolation(error: unknown): string | null {
  let current: unknown = error;
  while (current && typeof current === 'object') {
    const candidate = current as {
      code?: unknown;
      constraint_name?: unknown;
      cause?: unknown;
    };
    if (candidate.code === '23503') {
      return String(candidate.constraint_name);
    }
    current = candidate.cause;
  }
  return null;
}

describe('ADR-021 phase 2a: new sessions and attempts bind a revision', () => {
  it("binds each new session item to its question's current revision", async () => {
    const first = await createPublishedQuestion('first');
    const second = await createPublishedQuestion('second');

    const { session } = await createSessionWith([first.id, second.id]);

    for (const question of [first, second]) {
      const expected = await currentRevisionId(question.id);
      expect(expected).not.toBeNull();
      await expect(stateRevisionId(session.id, question.id)).resolves.toBe(
        expected,
      );
    }
  });

  it("binds a session attempt to its item's revision", async () => {
    const question = await createPublishedQuestion('session-attempt');
    const { user, session } = await createSessionWith([question.id]);

    const attempt = await new DrizzleAttemptRepository(db).insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: session.id,
      outcome: { kind: 'answered', selectedChoiceId: question.correctChoiceId },
      isCorrect: true,
      timeSpentSeconds: 12,
    });

    const bound = await stateRevisionId(session.id, question.id);
    expect(bound).not.toBeNull();
    await expect(attemptRevisionId(attempt.id)).resolves.toBe(bound);
  });

  it("binds an attempt outside a session to the question's current revision", async () => {
    const question = await createPublishedQuestion('no-session');
    const user = await createUser(db, cleanup);

    const attempt = await new DrizzleAttemptRepository(db).insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: null,
      outcome: { kind: 'answered', selectedChoiceId: question.correctChoiceId },
      isCorrect: true,
      timeSpentSeconds: 9,
    });

    const current = await currentRevisionId(question.id);
    expect(current).not.toBeNull();
    await expect(attemptRevisionId(attempt.id)).resolves.toBe(current);
  });

  it("binds an attempt in a session created before binding to the question's current revision", async () => {
    const question = await createPublishedQuestion('legacy-session');
    const { user, session } = await createSessionWith([question.id]);
    // A session created by the N-1 deployment has no bound revision.
    await db
      .update(schema.practiceSessionQuestionStates)
      .set({ questionRevisionId: null })
      .where(
        eq(schema.practiceSessionQuestionStates.practiceSessionId, session.id),
      );

    const attempt = await new DrizzleAttemptRepository(db).insert({
      userId: user.id,
      questionId: question.id,
      practiceSessionId: session.id,
      outcome: { kind: 'answered', selectedChoiceId: question.correctChoiceId },
      isCorrect: true,
      timeSpentSeconds: 7,
    });

    const current = await currentRevisionId(question.id);
    expect(current).not.toBeNull();
    await expect(attemptRevisionId(attempt.id)).resolves.toBe(current);
  });

  // N-1: the serving deployment leaves the revision NULL until it is
  // replaced, and MATCH SIMPLE keys accept that.
  it('accepts an attempt with no bound revision, as the N-1 deployment writes it', async () => {
    const question = await createPublishedQuestion('n-minus-1');
    const user = await createUser(db, cleanup);

    const [row] = await db
      .insert(schema.attempts)
      .values({
        userId: user.id,
        questionId: question.id,
        selectedChoiceId: question.correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 4,
      })
      .returning({ revisionId: schema.attempts.questionRevisionId });

    expect(row).toEqual({ revisionId: null });
  });

  it('refuses an attempt whose selected choice belongs to another revision', async () => {
    const question = await createPublishedQuestion('attempt-mixed');
    const { user, session } = await createSessionWith([question.id]);
    const otherChoiceId = await createOtherRevisionChoice(question.id);

    const error = await new DrizzleAttemptRepository(db)
      .insert({
        userId: user.id,
        questionId: question.id,
        practiceSessionId: session.id,
        outcome: { kind: 'answered', selectedChoiceId: otherChoiceId },
        isCorrect: true,
        timeSpentSeconds: 5,
      })
      .catch((caught: unknown) => caught);

    expect(foreignKeyViolation(error)).toBe(
      'attempts_selected_choice_revision_fk',
    );
  });

  it.each([
    [
      'latest',
      {
        latestSelectedChoiceId: 'choice',
        latestIsCorrect: true,
        latestAnsweredAt: new Date(),
      },
      'practice_session_question_states_latest_choice_revision_fk',
    ],
    [
      'draft',
      { draftSelectedChoiceId: 'choice', draftSavedAt: new Date() },
      'practice_session_question_states_draft_choice_revision_fk',
    ],
  ] as const)(
    'refuses a %s session selection that belongs to another revision',
    async (_kind, selection, constraint) => {
      const question = await createPublishedQuestion('state-mixed');
      const { session } = await createSessionWith([question.id]);
      const otherChoiceId = await createOtherRevisionChoice(question.id);
      const values = Object.fromEntries(
        Object.entries(selection).map(([key, value]) => [
          key,
          value === 'choice' ? otherChoiceId : value,
        ]),
      );

      const error = await db
        .update(schema.practiceSessionQuestionStates)
        .set(values)
        .where(
          eq(
            schema.practiceSessionQuestionStates.practiceSessionId,
            session.id,
          ),
        )
        .catch((caught: unknown) => caught);

      expect(foreignKeyViolation(error)).toBe(constraint);
    },
  );

  it('keeps every question on one revision whose choices are all bound to it', async () => {
    const question = await createPublishedQuestion('mirror');

    const rows = await db.execute<{ unbound: number }>(drizzleSql`
      SELECT count(*)::int AS unbound
      FROM choices c
      JOIN questions q ON q.id = c.question_id
      WHERE q.id = ${question.id}
        AND c.question_revision_id IS DISTINCT FROM q.current_revision_id
    `);

    await expect(currentRevisionId(question.id)).resolves.not.toBeNull();
    expect(rows[0]?.unbound).toBe(0);
  });
});
