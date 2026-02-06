import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleQuestionRepository } from './drizzle-question-repository';

type RepoDb = ConstructorParameters<typeof DrizzleQuestionRepository>[0];

const baseQuestionRow = {
  id: 'question_1',
  slug: 'question-1',
  stemMd: 'stem',
  explanationMd: 'explanation',
  difficulty: 'easy',
  status: 'published',
  createdAt: new Date('2026-02-01T00:00:00Z'),
  updatedAt: new Date('2026-02-01T00:00:00Z'),
};

function createQuestionRow(
  overrides: Partial<typeof baseQuestionRow> = {},
  choices = [
    {
      id: 'choice_1',
      questionId: baseQuestionRow.id,
      label: 'A',
      textMd: 'Choice A',
      isCorrect: true,
      explanationMd: 'Because A is correct.',
      sortOrder: 2,
    },
    {
      id: 'choice_2',
      questionId: baseQuestionRow.id,
      label: 'B',
      textMd: 'Choice B',
      isCorrect: false,
      explanationMd: 'Because B is incorrect.',
      sortOrder: 1,
    },
  ],
  tags = [
    {
      questionId: baseQuestionRow.id,
      tagId: 'tag_1',
      tag: {
        id: 'tag_1',
        slug: 'addiction',
        name: 'Addiction',
        kind: 'topic',
      },
    },
  ],
) {
  return {
    ...baseQuestionRow,
    ...overrides,
    choices,
    questionTags: tags,
  };
}

describe('DrizzleQuestionRepository', () => {
  describe('findPublishedById', () => {
    it('returns null when no row exists', async () => {
      const db = {
        query: {
          questions: {
            findFirst: async () => null,
          },
        },
      } as const;

      const repo = new DrizzleQuestionRepository(db as unknown as RepoDb);

      await expect(repo.findPublishedById('missing')).resolves.toBeNull();
    });

    it('maps the question, sorts choices, and maps tags', async () => {
      const row = createQuestionRow();
      const db = {
        query: {
          questions: {
            findFirst: async () => row,
          },
        },
      } as const;

      const repo = new DrizzleQuestionRepository(db as unknown as RepoDb);

      const result = await repo.findPublishedById(row.id);

      expect(result?.choices.map((c) => c.id)).toEqual([
        'choice_2',
        'choice_1',
      ]);
      expect(result?.choices.map((c) => c.explanationMd)).toEqual([
        'Because B is incorrect.',
        'Because A is correct.',
      ]);
      expect(result?.tags).toEqual([
        {
          id: 'tag_1',
          slug: 'addiction',
          name: 'Addiction',
          kind: 'topic',
        },
      ]);
    });

    it('throws INTERNAL_ERROR when a choice label is invalid', async () => {
      const row = createQuestionRow({}, [
        {
          id: 'choice_bad',
          questionId: baseQuestionRow.id,
          label: 'Z',
          textMd: 'Invalid',
          isCorrect: false,
          explanationMd: 'Invalid explanation',
          sortOrder: 1,
        },
      ]);
      const db = {
        query: {
          questions: {
            findFirst: async () => row,
          },
        },
      } as const;

      const repo = new DrizzleQuestionRepository(db as unknown as RepoDb);

      const promise = repo.findPublishedById(row.id);
      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });
  });

  describe('findPublishedBySlug', () => {
    it('returns the mapped question when found', async () => {
      const row = createQuestionRow({ slug: 'slug-1' });
      const db = {
        query: {
          questions: {
            findFirst: async () => row,
          },
        },
      } as const;

      const repo = new DrizzleQuestionRepository(db as unknown as RepoDb);

      const result = await repo.findPublishedBySlug('slug-1');

      expect(result?.slug).toBe('slug-1');
      expect(result?.choices.map((c) => c.sortOrder)).toEqual([1, 2]);
    });
  });

  describe('findPublishedByIds', () => {
    it('returns empty array when ids list is empty', async () => {
      const db = {
        query: {
          questions: {
            findMany: async () => {
              throw new Error('unexpected query');
            },
          },
        },
      } as const;

      const repo = new DrizzleQuestionRepository(db as unknown as RepoDb);

      await expect(repo.findPublishedByIds([])).resolves.toEqual([]);
    });

    it('returns results ordered by requested ids and filters missing', async () => {
      const row1 = createQuestionRow({ id: 'q1', slug: 'q1' });
      const row3 = createQuestionRow({ id: 'q3', slug: 'q3' });
      const db = {
        query: {
          questions: {
            findMany: async () => [row1, row3],
          },
        },
      } as const;

      const repo = new DrizzleQuestionRepository(db as unknown as RepoDb);

      const result = await repo.findPublishedByIds(['q3', 'q2', 'q1']);

      expect(result.map((q) => q.id)).toEqual(['q3', 'q1']);
    });
  });

  describe('listPublishedCandidateIds', () => {
    it('returns ordered ids when no tag filter is applied', async () => {
      const rows = [{ id: 'q1' }, { id: 'q2' }];
      const orderBy = vi.fn(async () => rows);
      const where = vi.fn(() => ({ orderBy }));
      const from = vi.fn(() => ({ where }));
      const select = vi.fn(() => ({ from }));

      const db = { select } as const;

      const repo = new DrizzleQuestionRepository(db as unknown as RepoDb);

      await expect(
        repo.listPublishedCandidateIds({ tagSlugs: [], difficulties: [] }),
      ).resolves.toEqual(['q1', 'q2']);

      expect(select).toHaveBeenCalledTimes(1);
      expect(orderBy).toHaveBeenCalledTimes(1);
    });

    it('returns ids when tag filters are applied', async () => {
      const rows = [{ id: 'q1', createdAt: new Date('2026-02-01T00:00:00Z') }];
      const orderBy = vi.fn(async () => rows);
      const groupBy = vi.fn(() => ({ orderBy }));
      const where = vi.fn(() => ({ groupBy }));
      const innerJoin2 = vi.fn(() => ({ where }));
      const innerJoin1 = vi.fn(() => ({ innerJoin: innerJoin2 }));
      const from = vi.fn(() => ({ innerJoin: innerJoin1 }));
      const select = vi.fn(() => ({ from }));

      const db = { select } as const;

      const repo = new DrizzleQuestionRepository(db as unknown as RepoDb);

      await expect(
        repo.listPublishedCandidateIds({
          tagSlugs: ['tag-1'],
          difficulties: ['easy'],
        }),
      ).resolves.toEqual(['q1']);

      expect(select).toHaveBeenCalledTimes(1);
      expect(orderBy).toHaveBeenCalledTimes(1);
    });
  });
});
