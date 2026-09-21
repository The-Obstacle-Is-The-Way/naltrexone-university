import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

function source(
  slug: string,
  input: {
    stem?: string;
    alcoholName?: string;
    alcoholKind?: 'substance' | 'diagnosis';
  } = {},
) {
  const alcoholKind = input.alcoholKind ?? 'substance';
  return {
    absolutePath: `/tmp/${slug}.mdx`,
    raw: [
      '---',
      `slug: ${slug}`,
      'difficulty: easy',
      'status: published',
      'tags:',
      '  - {slug: general, name: General, kind: topic}',
      `  - {slug: alcohol, name: ${input.alcoholName ?? 'Alcohol'}, kind: ${alcoholKind}}`,
      ...(alcoholKind === 'diagnosis'
        ? ['  - {slug: cannabis, name: Cannabis, kind: substance}']
        : []),
      'choices:',
      '  - {label: A, text: Choice A, correct: false, explanation: Wrong option.}',
      '  - {label: B, text: Choice B, correct: true}',
      '---',
      '## Stem',
      input.stem ?? 'A validated synthetic task.',
      '## Explanation',
      'A validated synthetic explanation.',
      '### Reference',
      'Synthetic citation.',
    ].join('\n'),
  };
}

async function trackQuestions(slugs: string[]) {
  const rows = await db
    .select()
    .from(schema.questions)
    .where(inArray(schema.questions.slug, slugs));
  for (const row of rows) {
    if (!cleanup.questionIds.includes(row.id)) cleanup.questionIds.push(row.id);
  }
  return rows;
}

async function snapshot(slug: string) {
  const [question] = await trackQuestions([slug]);
  if (!question) return null;
  const choices = await db
    .select()
    .from(schema.choices)
    .where(eq(schema.choices.questionId, question.id))
    .orderBy(schema.choices.label);
  const tags = await db
    .select()
    .from(schema.questionTags)
    .where(eq(schema.questionTags.questionId, question.id))
    .orderBy(schema.questionTags.tagId);
  return { question, choices, tags };
}

const invalidLaterFiles: ReadonlyArray<
  readonly [string, (raw: string) => string]
> = [
  ['empty stem', (raw) => raw.replace('A validated synthetic task.', '')],
  [
    'empty general explanation',
    (raw) => raw.replace('A validated synthetic explanation.', ''),
  ],
  [
    'missing reference',
    (raw) => raw.replace('### Reference\nSynthetic citation.', ''),
  ],
  ['empty reference', (raw) => raw.replace('Synthetic citation.', '')],
  [
    'invalid answer key',
    (raw) => raw.replace('correct: true', 'correct: false'),
  ],
  [
    'invalid taxonomy',
    (raw) => raw.replace('slug: general', 'slug: invalid-topic'),
  ],
];

describe.each(['insert', 'update'] as const)(
  'seed bundle preflight before an earlier %s',
  (operation) => {
    it.each(invalidLaterFiles)(
      'rejects a later %s without committing earlier content',
      async (_name, invalidate) => {
        const firstSlug = `it-preflight-first-${randomUUID()}`;
        if (operation === 'update') {
          await createQuestion(db, cleanup, {
            slug: firstSlug,
            difficulty: 'easy',
            status: 'published',
          });
        }
        const before = await snapshot(firstSlug);
        const laterSlug = `it-preflight-invalid-${randomUUID()}`;
        const later = source(laterSlug);
        later.raw = invalidate(later.raw);

        try {
          await expect(
            syncQuestionsFromFiles(db, [source(firstSlug), later]),
          ).rejects.toThrow(later.absolutePath);
        } finally {
          await trackQuestions([firstSlug, laterSlug]);
        }

        expect(await snapshot(firstSlug)).toEqual(before);
      },
    );
  },
);

describe('seed bundle identity and taxonomy consistency', () => {
  it.each([false, true])(
    'rejects duplicate slugs before writes (changedBody=%s)',
    async (changedBody) => {
      const slug = `it-preflight-duplicate-${randomUUID()}`;
      const first = source(slug);
      const duplicate = source(
        slug,
        changedBody ? { stem: 'Different task.' } : {},
      );
      duplicate.absolutePath = `/tmp/other-source/${slug}.mdx`;

      try {
        const sync = syncQuestionsFromFiles(db, [first, duplicate]);
        await expect(sync).rejects.toThrow(/Duplicate seed question/);
        await expect(sync).rejects.toThrow(first.absolutePath);
        await expect(sync).rejects.toThrow(duplicate.absolutePath);
      } finally {
        await trackQuestions([slug]);
      }
      expect(await snapshot(slug)).toBeNull();
    },
  );

  it.each([
    ['name', { alcoholName: 'Conflicting name' }],
    ['kind', { alcoholKind: 'diagnosis' as const }],
  ] as const)(
    'rejects conflicting tag %s before writes',
    async (_field, edits) => {
      const firstSlug = `it-preflight-tags-first-${randomUUID()}`;
      const secondSlug = `it-preflight-tags-second-${randomUUID()}`;
      const first = source(firstSlug);
      const second = source(secondSlug, edits);
      try {
        const sync = syncQuestionsFromFiles(db, [first, second]);
        await expect(sync).rejects.toThrow(/Conflicting seed tag "alcohol"/);
        await expect(sync).rejects.toThrow(first.absolutePath);
        await expect(sync).rejects.toThrow(second.absolutePath);
      } finally {
        await trackQuestions([firstSlug, secondSlug]);
      }
      expect(await snapshot(firstSlug)).toBeNull();
      expect(await snapshot(secondSlug)).toBeNull();
    },
  );

  it('syncs a valid bundle with shared tags and skips its unchanged replay', async () => {
    const slugs = [
      `it-preflight-valid-a-${randomUUID()}`,
      `it-preflight-valid-b-${randomUUID()}`,
    ];
    const files = slugs.map((slug) => source(slug));
    try {
      await expect(syncQuestionsFromFiles(db, files)).resolves.toEqual({
        inserted: 2,
        updated: 0,
        skipped: 0,
      });
      await expect(syncQuestionsFromFiles(db, files)).resolves.toEqual({
        inserted: 0,
        updated: 0,
        skipped: 2,
      });
    } finally {
      await trackQuestions(slugs);
    }
  });
});
