import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type {
  Choice,
  Question,
  QuestionRevision,
  QuestionTag,
  Tag,
} from '@/db/schema';
import {
  attempts,
  bookmarks,
  practiceSessions,
  questionHolds,
  questionRevisions,
  questions,
  questionTags,
  questionWithdrawals,
  tags,
} from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  QuestionFilters,
  QuestionRepository,
  QuestionRevisionBinding,
} from '@/src/application/ports/repositories';
import {
  deriveQuestionAvailability,
  isValidChoiceLabel,
  NO_QUESTION_OVERLAY,
  type QuestionOverlay,
  type QuestionProgressStatus,
} from '@/src/domain/value-objects';
import type { DrizzleDb } from '../shared/database-types';
import { getActiveExamVisibilityCondition } from './shared/active-exam-visibility';
import { latestAttemptRankSql } from './shared/latest-attempt-rank-sql';

function isNonEmptyArray<T>(
  values: readonly T[],
): values is readonly [T, ...T[]] {
  return values.length > 0;
}

// ADR-021 phase 2a: content and choices come from the question's current
// revision, not the legacy columns or every choice of the question.
const questionRelations = {
  currentRevision: { with: { choices: true } },
  questionTags: {
    with: {
      tag: true,
    },
  },
} as const;

type RevisionWithChoices = QuestionRevision & { choices: Choice[] };

type QuestionRowWithRelations = Question & {
  currentRevision: RevisionWithChoices | null;
  questionTags: Array<QuestionTag & { tag: Tag }>;
};

export class DrizzleQuestionRepository implements QuestionRepository {
  constructor(private readonly db: DrizzleDb) {}

  private buildPublishedCandidateWhere(filters: QuestionFilters): {
    hasTagFilter: boolean;
    where: SQL;
  } {
    const hasDifficultyFilter = filters.difficulties.length > 0;
    const hasTagFilter = filters.tagSlugs.length > 0;
    const statuses = filters.statuses ?? [];

    const whereParts: [SQL, ...SQL[]] = [eq(questions.status, 'published')];

    if (hasDifficultyFilter) {
      // ADR-021 phase 2a: the difficulty the learner is shown is the current
      // revision's.
      whereParts.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(questionRevisions)
            .where(
              and(
                eq(questionRevisions.id, questions.currentRevisionId),
                inArray(questionRevisions.difficulty, [
                  ...filters.difficulties,
                ]),
              ),
            ),
        ),
      );
    }

    if (isNonEmptyArray(statuses)) {
      if (typeof filters.userId !== 'string') {
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'userId is required when filtering by status',
        );
      }

      const userId = filters.userId;
      const [firstStatus, ...remainingStatuses] = statuses;
      const firstStatusCondition = this.buildStatusCondition(
        firstStatus,
        userId,
      );
      const remainingStatusConditions = remainingStatuses.map((status) =>
        this.buildStatusCondition(status, userId),
      );
      const statusCondition =
        remainingStatusConditions.length === 0
          ? firstStatusCondition
          : (or(firstStatusCondition, ...remainingStatusConditions) ??
            firstStatusCondition);
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
      with: questionRelations,
    });

    // Published, so available whatever its overlay.
    return row ? this.toDomain(row, NO_QUESTION_OVERLAY) : null;
  }

  async findPublishedBySlug(slug: string) {
    const row = await this.db.query.questions.findFirst({
      where: and(eq(questions.slug, slug), eq(questions.status, 'published')),
      with: questionRelations,
    });

    return row ? this.toDomain(row, NO_QUESTION_OVERLAY) : null;
  }

  async findIdBySlug(slug: string) {
    const [row] = await this.db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.slug, slug))
      .limit(1);
    return row?.id ?? null;
  }

  async findByIdForSession(item: QuestionRevisionBinding) {
    const [question] = await this.findByIdsForSession([item]);
    return question ?? null;
  }

  async findByIdsForSession(items: readonly QuestionRevisionBinding[]) {
    return this.findByBindings(items);
  }

  // ADR-021: a session item or attempt shows the revision it is bound to.
  private async findByBindings(bindings: readonly QuestionRevisionBinding[]) {
    if (bindings.length === 0) return [];

    const byId = inArray(
      questions.id,
      bindings.map((binding) => binding.questionId),
    );
    const rows = await this.db.query.questions.findMany({
      where: byId,
      with: questionRelations,
    });
    const boundRevisions = await this.db.query.questionRevisions.findMany({
      where: inArray(questionRevisions.id, [
        ...new Set(bindings.map((binding) => binding.questionRevisionId)),
      ]),
      with: { choices: true },
    });

    const rowById = new Map(rows.map((row) => [row.id, row]));
    const overlays = await this.overlaysOf(
      rows.filter((row) => row.status !== 'published').map((row) => row.id),
    );
    const revisionById = new Map(
      boundRevisions.map((revision) => [revision.id, revision]),
    );
    return bindings.flatMap((binding) => {
      const row = rowById.get(binding.questionId);
      if (!row) return [];
      const revision = revisionById.get(binding.questionRevisionId);
      // Composite keys make a session state's or attempt's revision one of its
      // question's, so any other binding is a broken invariant.
      if (!revision || revision.questionId !== row.id) {
        throw new ApplicationError(
          'INTERNAL_ERROR',
          `Revision ${binding.questionRevisionId} is not a revision of question ${row.id}`,
        );
      }
      return [
        this.toDomain(
          row,
          overlays.get(row.id) ?? NO_QUESTION_OVERLAY,
          revision,
        ),
      ];
    });
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
      .leftJoin(
        practiceSessions,
        eq(attempts.practiceSessionId, practiceSessions.id),
      )
      .where(
        and(eq(attempts.userId, userId), getActiveExamVisibilityCondition()),
      )
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
            .leftJoin(
              practiceSessions,
              eq(attempts.practiceSessionId, practiceSessions.id),
            )
            .where(
              and(
                eq(attempts.userId, userId),
                getActiveExamVisibilityCondition(),
              ),
            ),
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

  // ADR-022 Decision 1: the overlay on each question that is not published,
  // read only for those, so a read of published questions costs nothing more.
  // A hold is found through the question's revisions, whose key leads with
  // the question; holds have no index that does.
  private async overlaysOf(
    questionIds: readonly string[],
  ): Promise<Map<string, QuestionOverlay>> {
    if (questionIds.length === 0) return new Map();
    const ids = [...questionIds];
    const withdrawn = await this.db
      .selectDistinct({ questionId: questionWithdrawals.questionId })
      .from(questionWithdrawals)
      .where(inArray(questionWithdrawals.questionId, ids));
    const held = await this.db
      .selectDistinct({ questionId: questionRevisions.questionId })
      .from(questionRevisions)
      .innerJoin(
        questionHolds,
        and(
          eq(questionHolds.questionRevisionId, questionRevisions.id),
          isNull(questionHolds.liftedAt),
        ),
      )
      .where(inArray(questionRevisions.questionId, ids));
    const withdrawnIds = new Set(withdrawn.map((row) => row.questionId));
    const heldIds = new Set(held.map((row) => row.questionId));
    return new Map(
      ids.map((id) => [
        id,
        { withdrawn: withdrawnIds.has(id), underReview: heldIds.has(id) },
      ]),
    );
  }

  private toDomain(
    row: QuestionRowWithRelations,
    overlay: QuestionOverlay,
    content: RevisionWithChoices | null = row.currentRevision,
  ) {
    // Only the seed writes questions, and it mirrors each into a revision in
    // the same transaction.
    if (!content) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        `Question ${row.id} has no current revision`,
      );
    }
    const mappedChoices = content.choices.map((c) => {
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
      revisionId: content.id,
      isCurrentRevision: content.id === row.currentRevisionId,
      slug: row.slug,
      stemMd: content.stemMd,
      explanationMd: content.explanationMd,
      referenceMd: content.referenceMd ?? null,
      difficulty: content.difficulty,
      status: row.status,
      availability: deriveQuestionAvailability(row.status, overlay),
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
