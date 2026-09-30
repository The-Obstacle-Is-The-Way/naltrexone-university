import { randomUUID } from 'node:crypto';
import { sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
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

// ADR-021 phase 2a, second increment: a bounded, batched function binds every
// older session state and attempt to its question's revision, as new rows are
// bound since the first increment, and the history keys are validated.
const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

// The function binds globally, so rows another run left behind would compete
// for the batch (#1197 review). Each case starts by binding every bindable
// row, and counts what stays unbound as its baseline.
let baseline: { states: number; attempts: number };

beforeEach(async () => {
  const drained = await bindHistoryRevisions(1_000_000);
  baseline = {
    states: drained.statesRemaining,
    attempts: drained.attemptsRemaining,
  };
});

type BindResult = {
  statesBound: number;
  attemptsBound: number;
  statesRemaining: number;
  attemptsRemaining: number;
};

async function bindHistoryRevisions(limit: number): Promise<BindResult> {
  const rows = await db.execute<{
    states_bound: number;
    attempts_bound: number;
    states_remaining: number;
    attempts_remaining: number;
  }>(drizzleSql`SELECT * FROM bind_history_revisions_v1(${limit})`);
  const row = rows[0];
  return {
    statesBound: Number(row?.states_bound),
    attemptsBound: Number(row?.attempts_bound),
    statesRemaining: Number(row?.states_remaining),
    attemptsRemaining: Number(row?.attempts_remaining),
  };
}

async function currentRevisionId(questionId: string) {
  const [row] = await db
    .select({ id: schema.questions.currentRevisionId })
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId));
  return row?.id ?? null;
}

async function createPublishedQuestion(label: string) {
  return createQuestion(db, cleanup, {
    slug: `it-revision-backfill-${label}-${randomUUID()}`,
    status: 'published',
    difficulty: 'medium',
  });
}

// A session and its answer as the deployment before the first increment wrote
// them: no bound revision.
async function createLegacySessionWithAnswer(label: string) {
  const question = await createPublishedQuestion(label);
  const user = await createUser(db, cleanup);
  const session = await new DrizzlePracticeSessionRepository(db).create({
    userId: user.id,
    mode: 'tutor',
    paramsJson: {
      count: 1,
      tagSlugs: [],
      difficulties: [],
      questionIds: [question.id],
    },
  });
  const attempt = await new DrizzleAttemptRepository(db).insert({
    userId: user.id,
    questionId: question.id,
    questionRevisionId: null,
    practiceSessionId: session.id,
    outcome: { kind: 'answered', selectedChoiceId: question.correctChoiceId },
    isCorrect: true,
    timeSpentSeconds: 11,
  });
  await db
    .update(schema.practiceSessionQuestionStates)
    .set({
      questionRevisionId: null,
      latestSelectedChoiceId: question.correctChoiceId,
      latestIsCorrect: true,
      latestAnsweredAt: new Date(),
    })
    .where(
      eq(schema.practiceSessionQuestionStates.practiceSessionId, session.id),
    );
  await db
    .update(schema.attempts)
    .set({ questionRevisionId: null })
    .where(eq(schema.attempts.id, attempt.id));
  return { question, user, session, attempt };
}

async function stateRevisionIds(sessionIds: string[]) {
  const rows = await db
    .select({ id: schema.practiceSessionQuestionStates.questionRevisionId })
    .from(schema.practiceSessionQuestionStates)
    .where(
      inArray(
        schema.practiceSessionQuestionStates.practiceSessionId,
        sessionIds,
      ),
    );
  return rows.map((row) => row.id);
}

async function attemptRevisionId(attemptId: string) {
  const [row] = await db
    .select({ id: schema.attempts.questionRevisionId })
    .from(schema.attempts)
    .where(eq(schema.attempts.id, attemptId));
  return row?.id ?? null;
}

describe('ADR-021 phase 2a: binding older history to its revision', () => {
  it("binds an older session state and its attempt to the question's revision", async () => {
    const legacy = await createLegacySessionWithAnswer('session');
    const revision = await currentRevisionId(legacy.question.id);
    expect(revision).not.toBeNull();

    const result = await bindHistoryRevisions(1_000);

    await expect(stateRevisionIds([legacy.session.id])).resolves.toEqual([
      revision,
    ]);
    await expect(attemptRevisionId(legacy.attempt.id)).resolves.toBe(revision);
    expect(result).toEqual({
      statesBound: 1,
      attemptsBound: 1,
      statesRemaining: baseline.states,
      attemptsRemaining: baseline.attempts,
    });
  });

  it("binds an older attempt outside a session to the question's revision", async () => {
    const question = await createPublishedQuestion('standalone');
    const user = await createUser(db, cleanup);
    const [attempt] = await db
      .insert(schema.attempts)
      .values({
        userId: user.id,
        questionId: question.id,
        selectedChoiceId: question.incorrectChoiceId,
        isCorrect: false,
        timeSpentSeconds: 6,
      })
      .returning({ id: schema.attempts.id });

    await bindHistoryRevisions(1_000);

    await expect(attemptRevisionId(String(attempt?.id))).resolves.toBe(
      await currentRevisionId(question.id),
    );
  });

  it('binds at most the given number of rows per table and reports the rest', async () => {
    const first = await createLegacySessionWithAnswer('bounded-first');
    const second = await createLegacySessionWithAnswer('bounded-second');

    const result = await bindHistoryRevisions(1);

    expect(result).toEqual({
      statesBound: 1,
      attemptsBound: 1,
      statesRemaining: baseline.states + 1,
      attemptsRemaining: baseline.attempts + 1,
    });
    const bound = await stateRevisionIds([first.session.id, second.session.id]);
    expect(bound.filter((id) => id !== null)).toHaveLength(1);
  });

  it('binds nothing more when run again', async () => {
    await createLegacySessionWithAnswer('idempotent');
    await bindHistoryRevisions(1_000);

    await expect(bindHistoryRevisions(1_000)).resolves.toEqual({
      statesBound: 0,
      attemptsBound: 0,
      statesRemaining: baseline.states,
      attemptsRemaining: baseline.attempts,
    });
  });

  it('leaves a row whose selection is not a choice of the revision unbound, and reports it', async () => {
    const legacy = await createLegacySessionWithAnswer('foreign-choice');
    // A choice of another revision, selected while the state was unbound.
    const [revision] = await db
      .insert(schema.questionRevisions)
      .values({
        questionId: legacy.question.id,
        revisionNumber: 2,
        stemMd: '# Stem, revised',
        explanationMd: '# Explanation',
        difficulty: 'medium',
        canonicalizationVersion: 'stored-fields-json-v1',
        contentHash: 'b'.repeat(64),
      })
      .returning({ id: schema.questionRevisions.id });
    const [foreignChoice] = await db
      .insert(schema.choices)
      .values({
        questionId: legacy.question.id,
        questionRevisionId: revision?.id,
        label: 'C',
        textMd: 'Choice C, revised',
        isCorrect: true,
        sortOrder: 3,
      })
      .returning({ id: schema.choices.id });
    await db
      .update(schema.practiceSessionQuestionStates)
      .set({
        draftSelectedChoiceId: foreignChoice?.id,
        draftSavedAt: new Date(),
      })
      .where(
        eq(
          schema.practiceSessionQuestionStates.practiceSessionId,
          legacy.session.id,
        ),
      );

    const result = await bindHistoryRevisions(1_000);

    await expect(stateRevisionIds([legacy.session.id])).resolves.toEqual([
      null,
    ]);
    expect(result.statesRemaining).toBe(baseline.states + 1);
  });

  it('validates every history revision key', async () => {
    const rows = await db.execute<{ conname: string; convalidated: boolean }>(
      drizzleSql`
        SELECT conname, convalidated
        FROM pg_constraint
        WHERE conname IN (
          ${schema.ATTEMPTS_QUESTION_REVISION_FK},
          ${schema.PRACTICE_SESSION_QUESTION_STATES_QUESTION_REVISION_FK},
          ${schema.ATTEMPTS_SELECTED_CHOICE_REVISION_FK},
          ${schema.PRACTICE_SESSION_QUESTION_STATES_LATEST_CHOICE_REVISION_FK},
          ${schema.PRACTICE_SESSION_QUESTION_STATES_DRAFT_CHOICE_REVISION_FK}
        )
        ORDER BY conname
      `,
    );

    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.convalidated)).toBe(true);
  });
});
