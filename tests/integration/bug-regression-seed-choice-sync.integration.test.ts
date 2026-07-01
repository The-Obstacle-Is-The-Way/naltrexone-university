import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

function buildSeedQuestionWithRemovedChoice(slug: string): string {
  return [
    '---',
    `slug: ${slug}`,
    'difficulty: easy',
    'status: published',
    'tags:',
    '  - slug: general',
    '    name: General',
    '    kind: topic',
    '  - slug: alcohol',
    '    name: Alcohol',
    '    kind: substance',
    'choices:',
    '  - label: B',
    '    text: Choice B',
    '    correct: true',
    '  - label: C',
    '    text: Choice C',
    '    correct: false',
    '    explanation: Choice C is not correct.',
    '---',
    '',
    '## Stem',
    '',
    '# Stem',
    '',
    '## Explanation',
    '',
    '# Explanation',
  ].join('\n');
}

function buildSeedQuestionWithInsertedChoice(slug: string): string {
  return [
    '---',
    `slug: ${slug}`,
    'difficulty: easy',
    'status: published',
    'tags:',
    '  - slug: general',
    '    name: General',
    '    kind: topic',
    '  - slug: alcohol',
    '    name: Alcohol',
    '    kind: substance',
    'choices:',
    '  - label: A',
    '    text: Choice A',
    '    correct: false',
    '    explanation: Choice A is not correct.',
    '  - label: B',
    '    text: Choice B',
    '    correct: false',
    '    explanation: Choice B is not correct.',
    '  - label: C',
    '    text: Choice C',
    '    correct: true',
    '---',
    '',
    '## Stem',
    '',
    '# Stem',
    '',
    '## Explanation',
    '',
    '# Explanation',
  ].join('\n');
}

function buildSeedQuestionWithInvalidTag(slug: string): string {
  return [
    '---',
    `slug: ${slug}`,
    'difficulty: easy',
    'status: published',
    'tags:',
    '  - slug: not-canonical',
    '    name: Not Canonical',
    '    kind: topic',
    '  - slug: alcohol',
    '    name: Alcohol',
    '    kind: substance',
    'choices:',
    '  - label: A',
    '    text: Choice A',
    '    correct: false',
    '    explanation: Choice A is not correct.',
    '  - label: B',
    '    text: Choice B',
    '    correct: true',
    '---',
    '',
    '## Stem',
    '',
    '# Stem',
    '',
    '## Explanation',
    '',
    '# Explanation',
  ].join('\n');
}

describe('BUG-266 seed choice sync guard', () => {
  it('refuses to delete a choice referenced only by normalized practice-session draft state', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-seed-choice-sync-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
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
        draftSelectedChoiceId: question.incorrectChoiceId,
        draftSavedAt: new Date('2026-06-30T12:00:00.000Z'),
        draftCumulativeMs: 1000,
      })
      .where(
        and(
          eq(
            schema.practiceSessionQuestionStates.practiceSessionId,
            session.id,
          ),
          eq(schema.practiceSessionQuestionStates.questionId, question.id),
        ),
      );

    await expect(
      syncQuestionsFromFiles(db, [
        {
          absolutePath: `${question.slug}.mdx`,
          raw: buildSeedQuestionWithRemovedChoice(question.slug),
        },
      ]),
    ).rejects.toThrow(
      `Refusing to delete choice ${question.incorrectChoiceId} (A) because it is referenced by an attempt or practice session state`,
    );
  });
});

describe('BUG-270 seed choice reorder', () => {
  it('syncs an inserted choice whose final sort order is still held by a survivor row', async () => {
    const slug = `it-seed-choice-reorder-${randomUUID()}`;
    const question = await createQuestion(db, cleanup, {
      slug,
      status: 'published',
      difficulty: 'easy',
    });
    await db
      .update(schema.choices)
      .set({ label: 'C' })
      .where(eq(schema.choices.id, question.correctChoiceId));

    await expect(
      syncQuestionsFromFiles(db, [
        {
          absolutePath: `${slug}.mdx`,
          raw: buildSeedQuestionWithInsertedChoice(slug),
        },
      ]),
    ).resolves.toEqual({ inserted: 0, updated: 1, skipped: 0 });

    const choices = await db
      .select({
        label: schema.choices.label,
        sortOrder: schema.choices.sortOrder,
      })
      .from(schema.choices)
      .where(eq(schema.choices.questionId, question.id))
      .orderBy(asc(schema.choices.sortOrder));

    expect(choices).toEqual([
      { label: 'A', sortOrder: 1 },
      { label: 'B', sortOrder: 2 },
      { label: 'C', sortOrder: 3 },
    ]);
  });

  it('adds file context to seed failures and keeps later files untouched', async () => {
    const badSlug = `it-seed-choice-fail-${randomUUID()}`;
    const skippedSlug = `it-seed-choice-skipped-${randomUUID()}`;

    await expect(
      syncQuestionsFromFiles(db, [
        {
          absolutePath: `/tmp/${badSlug}.mdx`,
          raw: buildSeedQuestionWithInvalidTag(badSlug),
        },
        {
          absolutePath: `/tmp/${skippedSlug}.mdx`,
          raw: buildSeedQuestionWithInsertedChoice(skippedSlug),
        },
      ]),
    ).rejects.toThrow(
      new RegExp(`Failed to sync seed question "${badSlug}".*/tmp/${badSlug}`),
    );

    const laterRows = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.slug, skippedSlug));

    expect(laterRows).toEqual([]);
  });
});
