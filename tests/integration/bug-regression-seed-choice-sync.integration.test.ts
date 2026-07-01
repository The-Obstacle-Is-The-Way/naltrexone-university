import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
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
