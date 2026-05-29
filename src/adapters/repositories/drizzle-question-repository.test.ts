import { describe, expect, it, vi } from 'vitest';
import { practiceSessions } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { QuestionProgressStatus } from '@/src/domain/value-objects';
import { DrizzleQuestionRepository } from './drizzle-question-repository';

type RepoDb = ConstructorParameters<typeof DrizzleQuestionRepository>[0];

const questionId = crypto.randomUUID();
const firstChoiceId = crypto.randomUUID();
const secondChoiceId = crypto.randomUUID();
const invalidChoiceId = crypto.randomUUID();
const tagId = crypto.randomUUID();
const userId = crypto.randomUUID();
const requestedFirstQuestionId = crypto.randomUUID();
const missingQuestionId = crypto.randomUUID();
const requestedThirdQuestionId = crypto.randomUUID();

type QuestionRow = {
  id: string;
  slug: string;
  stemMd: string;
  explanationMd: string;
  referenceMd: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  status: 'draft' | 'published' | 'archived';
  createdAt: Date;
  updatedAt: Date;
};

const baseQuestionRow: QuestionRow = {
  id: questionId,
  slug: 'question-1',
  stemMd: 'stem',
  explanationMd: 'explanation',
  referenceMd: null,
  difficulty: 'easy',
  status: 'published',
  createdAt: new Date('2026-02-01T00:00:00Z'),
  updatedAt: new Date('2026-02-01T00:00:00Z'),
};

function collectColumnNamesForTable(
  node: unknown,
  table: unknown,
): readonly string[] {
  const names = new Set<string>();

  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') {
      return;
    }

    const maybeNode = value as {
      table?: unknown;
      name?: unknown;
      queryChunks?: unknown[];
    };

    if (maybeNode.table === table && typeof maybeNode.name === 'string') {
      names.add(maybeNode.name);
    }

    if (Array.isArray(maybeNode.queryChunks)) {
      for (const chunk of maybeNode.queryChunks) {
        visit(chunk);
      }
    }
  };

  visit(node);
  return [...names];
}

function createQuestionRow(
  overrides: Partial<QuestionRow> = {},
  choices = [
    {
      id: firstChoiceId,
      questionId: baseQuestionRow.id,
      label: 'A',
      textMd: 'Choice A',
      isCorrect: true,
      explanationMd: 'Because A is correct.',
      sortOrder: 2,
    },
    {
      id: secondChoiceId,
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
      tagId: tagId,
      tag: {
        id: tagId,
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
      const row = createQuestionRow({ referenceMd: 'Anton RF et al. JAMA.' });
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
        secondChoiceId,
        firstChoiceId,
      ]);
      expect(result?.choices.map((c) => c.explanationMd)).toEqual([
        'Because B is incorrect.',
        'Because A is correct.',
      ]);
      expect(result?.tags).toEqual([
        {
          id: tagId,
          slug: 'addiction',
          name: 'Addiction',
          kind: 'topic',
        },
      ]);
      expect(result?.referenceMd).toBe('Anton RF et al. JAMA.');
    });

    it('throws INTERNAL_ERROR when a choice label is invalid', async () => {
      const row = createQuestionRow({}, [
        {
          id: invalidChoiceId,
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
      const row1 = createQuestionRow({
        id: requestedFirstQuestionId,
        slug: requestedFirstQuestionId,
      });
      const row3 = createQuestionRow({
        id: requestedThirdQuestionId,
        slug: requestedThirdQuestionId,
      });
      const db = {
        query: {
          questions: {
            findMany: async () => [row1, row3],
          },
        },
      } as const;

      const repo = new DrizzleQuestionRepository(db as unknown as RepoDb);

      const result = await repo.findPublishedByIds([
        requestedThirdQuestionId,
        missingQuestionId,
        requestedFirstQuestionId,
      ]);

      expect(result.map((q) => q.id)).toEqual([
        requestedThirdQuestionId,
        requestedFirstQuestionId,
      ]);
    });
  });

  describe('listPublishedCandidateIds', () => {
    it('throws VALIDATION_ERROR when statuses are provided without userId', async () => {
      const repo = new DrizzleQuestionRepository({} as unknown as RepoDb);

      const promise = repo.listPublishedCandidateIds({
        tagSlugs: [],
        difficulties: [],
        statuses: ['unanswered'],
      });

      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'userId is required when filtering by status',
      });
    });

    it('throws INTERNAL_ERROR when an unknown status is provided', async () => {
      const repo = new DrizzleQuestionRepository({} as unknown as RepoDb);

      const promise = repo.listPublishedCandidateIds({
        tagSlugs: [],
        difficulties: [],
        statuses: ['unknown' as unknown as QuestionProgressStatus],
        userId: userId,
      });

      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'Unhandled QuestionProgressStatus: unknown',
      });
    });
  });

  describe('countPublishedCandidateIds', () => {
    it('throws VALIDATION_ERROR when statuses are provided without userId', async () => {
      const repo = new DrizzleQuestionRepository({} as unknown as RepoDb);

      const promise = repo.countPublishedCandidateIds({
        tagSlugs: [],
        difficulties: [],
        statuses: ['unanswered'],
      });

      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'userId is required when filtering by status',
      });
    });

    it('throws INTERNAL_ERROR when an unknown status is provided', async () => {
      const repo = new DrizzleQuestionRepository({} as unknown as RepoDb);

      const promise = repo.countPublishedCandidateIds({
        tagSlugs: [],
        difficulties: [],
        statuses: ['unknown' as unknown as QuestionProgressStatus],
        userId: userId,
      });

      await expect(promise).rejects.toBeInstanceOf(ApplicationError);
      await expect(promise).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'Unhandled QuestionProgressStatus: unknown',
      });
    });

    // Structural assertion: ensures unanswered status filtering references
    // practiceSessions columns so active exam attempts can be excluded.
    it('applies active-exam secrecy filtering when building unanswered status counts', async () => {
      const unansweredSubqueryWhere = vi.fn((..._args: unknown[]) => ({}));
      const unansweredSubqueryLeftJoin = vi.fn((..._args: unknown[]) => ({
        where: unansweredSubqueryWhere,
      }));
      const unansweredSubqueryFrom = vi.fn((_table: unknown) => ({
        leftJoin: unansweredSubqueryLeftJoin,
        where: unansweredSubqueryWhere,
      }));

      const countWhere = vi.fn(async (..._args: unknown[]) => [{ count: 5 }]);
      const countFrom = vi.fn((_table: unknown) => ({
        where: countWhere,
      }));

      const db = {
        select: (fields: Record<string, unknown>) => {
          if ('count' in fields) {
            return { from: countFrom };
          }
          return { from: unansweredSubqueryFrom };
        },
        selectDistinct: (_fields: Record<string, unknown>) => ({
          from: unansweredSubqueryFrom,
        }),
      } as const;

      const repo = new DrizzleQuestionRepository(db as unknown as RepoDb);

      await expect(
        repo.countPublishedCandidateIds({
          tagSlugs: [],
          difficulties: [],
          statuses: ['unanswered'],
          userId: userId,
        }),
      ).resolves.toBe(5);

      expect(unansweredSubqueryLeftJoin).toHaveBeenCalledTimes(1);
      const unansweredWhereClause = unansweredSubqueryWhere.mock.calls[0]?.[0];
      expect(unansweredWhereClause).toBeDefined();

      const practiceSessionColumns = collectColumnNamesForTable(
        unansweredWhereClause,
        practiceSessions,
      );
      expect(practiceSessionColumns).toContain('mode');
      expect(practiceSessionColumns).toContain('ended_at');
    });

    // Structural assertion: ensures latest-attempt status filtering references
    // practiceSessions columns so active exam attempts can be excluded.
    it('applies active-exam secrecy filtering when building incorrect status counts', async () => {
      const latestAttemptRowsAs = () => ({
        __isLatestAttemptRows: true,
        questionId: Symbol.for('latest_attempt_rows.questionId'),
        isCorrect: Symbol.for('latest_attempt_rows.isCorrect'),
        attemptRank: Symbol.for('latest_attempt_rows.attemptRank'),
      });

      const latestAttemptRowsWhere = vi.fn((..._args: unknown[]) => ({
        as: latestAttemptRowsAs,
      }));
      const latestAttemptRowsLeftJoin = vi.fn((..._args: unknown[]) => ({
        where: latestAttemptRowsWhere,
      }));
      const latestAttemptRowsFrom = vi.fn((table: unknown) => {
        if (table === practiceSessions) {
          throw new Error('unexpected practiceSessions base table');
        }
        return {
          leftJoin: latestAttemptRowsLeftJoin,
          where: latestAttemptRowsWhere,
        };
      });

      const statusSubqueryWhere = vi.fn((..._args: unknown[]) => ({}));
      const statusSubqueryFrom = vi.fn((_table: unknown) => ({
        where: statusSubqueryWhere,
      }));

      const countWhere = vi.fn(async (..._args: unknown[]) => [{ count: 1 }]);
      const countFrom = vi.fn((_table: unknown) => ({
        where: countWhere,
      }));

      const db = {
        select: (fields: Record<string, unknown>) => {
          if ('count' in fields) {
            return { from: countFrom };
          }
          if ('attemptRank' in fields) {
            return { from: latestAttemptRowsFrom };
          }
          return { from: statusSubqueryFrom };
        },
      } as const;

      const repo = new DrizzleQuestionRepository(db as unknown as RepoDb);

      await expect(
        repo.countPublishedCandidateIds({
          tagSlugs: [],
          difficulties: [],
          statuses: ['incorrect'],
          userId: userId,
        }),
      ).resolves.toBe(1);

      expect(latestAttemptRowsLeftJoin).toHaveBeenCalledTimes(1);
      const latestAttemptRowsWhereClause =
        latestAttemptRowsWhere.mock.calls[0]?.[0];
      expect(latestAttemptRowsWhereClause).toBeDefined();

      const practiceSessionColumns = collectColumnNamesForTable(
        latestAttemptRowsWhereClause,
        practiceSessions,
      );
      expect(practiceSessionColumns).toContain('mode');
      expect(practiceSessionColumns).toContain('ended_at');
    });
  });
});
