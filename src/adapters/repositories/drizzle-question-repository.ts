import {
  and,
  asc,
  desc,
  eq,
  inArray,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { Choice, Question, QuestionTag, Tag } from '@/db/schema';
import {
  attempts,
  bookmarks,
  questions,
  questionTags,
  tags,
} from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  QuestionFilters,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import {
  isValidChoiceLabel,
  type QuestionProgressStatus,
} from '@/src/domain/value-objects';
import type { DrizzleDb } from '../shared/database-types';
import { latestAttemptRankSql } from './shared/latest-attempt-rank-sql';

export class DrizzleQuestionRepository implements QuestionRepository {
  constructor(private readonly db: DrizzleDb) {}

  private buildPublishedCandidateWhere(filters: QuestionFilters): {
    hasTagFilter: boolean;
    where: SQL;
  } {
    const hasDifficultyFilter = filters.difficulties.length > 0;
    const hasTagFilter = filters.tagSlugs.length > 0;
    const statuses = filters.statuses ?? [];
    const hasStatusFilter = statuses.length > 0;

    const whereParts: SQL[] = [eq(questions.status, 'published')];

    if (hasDifficultyFilter) {
      whereParts.push(inArray(questions.difficulty, [...filters.difficulties]));
    }

    if (hasStatusFilter) {
      if (typeof filters.userId !== 'string') {
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'userId is required when filtering by status',
        );
      }

      const userId = filters.userId;
      const statusConditions = statuses.map((status) =>
        this.buildStatusCondition(status, userId),
      );
      const statusCondition =
        statusConditions.length === 1
          ? statusConditions[0]
          : (or(...statusConditions) ?? statusConditions[0]);
      whereParts.push(statusCondition);
    }

    const baseWhere = and(...whereParts) ?? whereParts[0];

    return {
      hasTagFilter,
      where: hasTagFilter
        ? (and(baseWhere, inArray(tags.slug, [...filters.tagSlugs])) ??
          baseWhere)
        : baseWhere,
    };
  }

  async findPublishedById(id: string) {
    const row = await this.db.query.questions.findFirst({
      where: and(eq(questions.id, id), eq(questions.status, 'published')),
      with: {
        choices: true,
        questionTags: {
          with: {
            tag: true,
          },
        },
      },
    });

    return row ? this.toDomain(row) : null;
  }

  async findPublishedBySlug(slug: string) {
    const row = await this.db.query.questions.findFirst({
      where: and(eq(questions.slug, slug), eq(questions.status, 'published')),
      with: {
        choices: true,
        questionTags: {
          with: {
            tag: true,
          },
        },
      },
    });

    return row ? this.toDomain(row) : null;
  }

  async findPublishedByIds(ids: readonly string[]) {
    if (ids.length === 0) return [];

    const rows = await this.db.query.questions.findMany({
      where: and(
        inArray(questions.id, [...ids]),
        eq(questions.status, 'published'),
      ),
      with: {
        choices: true,
        questionTags: {
          with: {
            tag: true,
          },
        },
      },
    });

    const byId = new Map(rows.map((row) => [row.id, this.toDomain(row)]));
    return ids
      .map((id) => byId.get(id))
      .filter((q): q is NonNullable<typeof q> => !!q);
  }

  async listPublishedCandidateIds(filters: QuestionFilters) {
    const { hasTagFilter, where } = this.buildPublishedCandidateWhere(filters);

    const baseOrderBy = [desc(questions.createdAt), asc(questions.id)] as const;

    const baseQuery = this.db
      .select({ id: questions.id, createdAt: questions.createdAt })
      .from(questions);

    const query = hasTagFilter
      ? baseQuery
          .innerJoin(questionTags, eq(questionTags.questionId, questions.id))
          .innerJoin(tags, eq(tags.id, questionTags.tagId))
          .where(where)
          .groupBy(questions.id, questions.createdAt)
      : baseQuery.where(where);

    const rows = await query.orderBy(...baseOrderBy);

    return rows.map((r) => r.id);
  }

  async countPublishedCandidateIds(filters: QuestionFilters): Promise<number> {
    const { hasTagFilter, where } = this.buildPublishedCandidateWhere(filters);

    const baseQuery = this.db
      .select({ count: sql<number>`count(distinct ${questions.id})::int` })
      .from(questions);

    const query = hasTagFilter
      ? baseQuery
          .innerJoin(questionTags, eq(questionTags.questionId, questions.id))
          .innerJoin(tags, eq(tags.id, questionTags.tagId))
          .where(where)
      : baseQuery.where(where);

    const [row] = await query;
    return row?.count ?? 0;
  }

  private latestAttemptRowsSubquery(userId: string) {
    return this.db
      .select({
        questionId: attempts.questionId,
        isCorrect: attempts.isCorrect,
        attemptRank: latestAttemptRankSql({
          questionId: attempts.questionId,
          answeredAt: attempts.answeredAt,
          id: attempts.id,
        }).as('attempt_rank'),
      })
      .from(attempts)
      .where(eq(attempts.userId, userId))
      .as('latest_attempt_rows');
  }

  private buildStatusCondition(
    status: QuestionProgressStatus,
    userId: string,
  ): SQL {
    switch (status) {
      case 'unanswered':
        // `attempts.questionId` is NOT NULL (db/schema.ts), so the NOT IN subquery
        // cannot return NULL and is safe from NULL-related semantics. If
        // `attempts.questionId` ever becomes nullable, prefer a NOT EXISTS / LEFT
        // JOIN pattern instead.
        return notInArray(
          questions.id,
          this.db
            .selectDistinct({ questionId: attempts.questionId })
            .from(attempts)
            .where(eq(attempts.userId, userId)),
        );
      case 'incorrect': {
        const latestAttemptRows = this.latestAttemptRowsSubquery(userId);
        return inArray(
          questions.id,
          this.db
            .select({ questionId: latestAttemptRows.questionId })
            .from(latestAttemptRows)
            .where(
              and(
                eq(latestAttemptRows.attemptRank, 1),
                eq(latestAttemptRows.isCorrect, false),
              ),
            ),
        );
      }
      case 'bookmarked':
        return inArray(
          questions.id,
          this.db
            .select({ questionId: bookmarks.questionId })
            .from(bookmarks)
            .where(eq(bookmarks.userId, userId)),
        );
      default: {
        const _exhaustive: never = status;
        throw new ApplicationError(
          'INTERNAL_ERROR',
          `Unhandled QuestionProgressStatus: ${_exhaustive}`,
        );
      }
    }
  }

  private toDomain(
    row: Question & {
      choices: Choice[];
      questionTags: Array<QuestionTag & { tag: Tag }>;
    },
  ) {
    const mappedChoices = row.choices.map((c) => {
      if (!isValidChoiceLabel(c.label)) {
        throw new ApplicationError(
          'INTERNAL_ERROR',
          `Invalid choice label "${c.label}" for choice ${c.id}`,
        );
      }

      return {
        id: c.id,
        questionId: c.questionId,
        label: c.label,
        textMd: c.textMd,
        isCorrect: c.isCorrect,
        explanationMd: c.explanationMd,
        sortOrder: c.sortOrder,
      };
    });

    return {
      id: row.id,
      slug: row.slug,
      stemMd: row.stemMd,
      explanationMd: row.explanationMd,
      referenceMd: row.referenceMd ?? null,
      difficulty: row.difficulty,
      status: row.status,
      choices: mappedChoices.sort((a, b) => a.sortOrder - b.sortOrder),
      tags: row.questionTags.map((qt) => ({
        id: qt.tag.id,
        slug: qt.tag.slug,
        name: qt.tag.name,
        kind: qt.tag.kind,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
