import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import * as schema from '@/db/schema';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';
import { type ContentEdits, source } from './seed-test-helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const ORIGINAL_ENV = snapshotProcessEnv();

beforeEach(() => {
  vi.stubEnv('SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY', 'false');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  restoreProcessEnv(ORIGINAL_ENV);
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

async function arrangeQuestion(history?: 'attempt' | 'session') {
  const question = await createQuestion(db, cleanup, {
    slug: `it-rewrite-${randomUUID()}`,
    difficulty: 'easy',
    status: 'published',
  });
  await syncQuestionsFromFiles(db, [source(question.slug)]);
  if (!history) return question;

  const user = await createUser(db, cleanup);
  if (history === 'attempt') {
    await db.insert(schema.attempts).values({
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      isCorrect: true,
      isOmitted: false,
      timeSpentSeconds: 1,
    });
  } else {
    const sessions = new DrizzlePracticeSessionRepository(db);
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
    await db
      .update(schema.practiceSessionQuestionStates)
      .set({
        latestSelectedChoiceId: question.correctChoiceId,
        latestIsCorrect: true,
        latestAnsweredAt: new Date('2026-09-20T00:00:00.000Z'),
      })
      .where(
        eq(schema.practiceSessionQuestionStates.practiceSessionId, session.id),
      );
    // Ended, so this suite exercises #951's graded-history guard. An
    // incomplete session defers any refresh of the revision it binds, which
    // seed-active-session-deferral covers.
    await sessions.end(session.id, user.id);
  }
  return question;
}

async function snapshot(questionId: string) {
  const [question] = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId));
  const choices = await db
    .select()
    .from(schema.choices)
    .where(eq(schema.choices.questionId, questionId))
    .orderBy(schema.choices.label);
  const attempts = await db
    .select()
    .from(schema.attempts)
    .where(eq(schema.attempts.questionId, questionId));
  const states = await db
    .select()
    .from(schema.practiceSessionQuestionStates)
    .where(eq(schema.practiceSessionQuestionStates.questionId, questionId));
  return { question, choices, attempts, states };
}

const rewrites: ReadonlyArray<readonly [string, ContentEdits]> = [
  ['clinical task', { stem: 'A different clinical task.' }],
  ['general explanation', { explanation: 'A different clinical rationale.' }],
  ['reference', { reference: 'A different reference.' }],
  ['correct option meaning', { correctText: 'A different correct option.' }],
  ['wrong option meaning', { wrongText: 'A different wrong option.' }],
  ['wrong option explanation', { wrongExplanation: 'A different rationale.' }],
  ['added option', { labels: ['A', 'B', 'C', 'D'] }],
  ['removed option', { labels: ['A', 'B'] }],
];

describe.each(['attempt', 'session'] as const)(
  'seed content identity with graded %s history',
  (history) => {
    it.each(rewrites)(
      'rejects a changed %s without changing stored history',
      async (_name, edits) => {
        const question = await arrangeQuestion(history);
        const before = await snapshot(question.id);

        await expect(
          syncQuestionsFromFiles(db, [source(question.slug, edits)]),
        ).rejects.toThrow(
          /Refusing to rewrite content.*graded history.*new question/i,
        );

        expect(await snapshot(question.id)).toEqual(before);
      },
    );

    it('allows canonical whitespace edits and explicit archival while preserving history', async () => {
      const question = await arrangeQuestion(history);
      const before = await snapshot(question.id);
      await expect(
        syncQuestionsFromFiles(db, [
          source(question.slug, {
            stem: '\r\nOriginal clinical task. \t\r\n',
            explanation: '\r\nOriginal general explanation. \t\r\n',
            reference: '\r\nOriginal synthetic reference. \t\r\n',
            correctText: 'Original correct option. \t',
            wrongExplanation: 'Original wrong-option explanation. \t',
            status: 'archived',
          }),
        ]),
      ).resolves.toEqual({ inserted: 0, updated: 1, skipped: 0, deferred: [] });
      const after = await snapshot(question.id);
      expect(after.question).toMatchObject({
        id: question.id,
        stemMd: before.question?.stemMd,
        explanationMd: before.question?.explanationMd,
        referenceMd: before.question?.referenceMd,
        status: 'archived',
      });
      expect(after.attempts).toEqual(before.attempts);
      expect(after.states).toEqual(before.states);
      expect(after.choices.map((choice) => choice.id)).toEqual(
        before.choices.map((choice) => choice.id),
      );
    });
  },
);

describe('seed rewrite policy boundaries', () => {
  it('allows rewrites before a question has graded history', async () => {
    const question = await arrangeQuestion();
    await expect(
      syncQuestionsFromFiles(db, [
        source(question.slug, { stem: 'Revised task.' }),
      ]),
    ).resolves.toEqual({ inserted: 0, updated: 1, skipped: 0, deferred: [] });
    expect((await snapshot(question.id)).question?.stemMd).toBe(
      'Revised task.',
    );
  });

  it('does not let the answer-key override authorize a concurrent clinical rewrite', async () => {
    const question = await arrangeQuestion('attempt');
    const before = await snapshot(question.id);
    vi.stubEnv('SEED_ALLOW_KEY_CHANGES_OVER_GRADED_HISTORY', 'true');

    await expect(
      syncQuestionsFromFiles(db, [
        source(question.slug, { stem: 'A different task.', correctLabel: 'A' }),
      ]),
    ).rejects.toThrow(
      /Refusing to rewrite content.*graded history.*new question/i,
    );
    expect(await snapshot(question.id)).toEqual(before);
  });
});
