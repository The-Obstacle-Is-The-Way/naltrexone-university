import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type * as schema from '@/db/schema';
import { questions, questionTags, tags } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  QuestionFilters,
  QuestionRepository,
} from '@/src/application/ports/repositories';
import { isValidChoiceLabel } from '@/src/domain/value-objects';
import type { DrizzleDb } from '../shared/database-types';

export class DrizzleQuestionRepository implements QuestionRepository {
  constructor(private readonly db: DrizzleDb) {}

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
    const hasDifficultyFilter = filters.difficulties.length > 0;
    const hasTagFilter = filters.tagSlugs.length > 0;

    const whereParts = [eq(questions.status, 'published')] as Array<
      ReturnType<typeof eq>
    >;

    if (hasDifficultyFilter) {
      whereParts.push(inArray(questions.difficulty, [...filters.difficulties]));
    }

    const baseOrderBy = [desc(questions.createdAt), asc(questions.id)] as const;

    if (!hasTagFilter) {
      const rows = await this.db
        .select({ id: questions.id })
        .from(questions)
        .where(and(...whereParts))
        .orderBy(...baseOrderBy);

      return rows.map((r) => r.id);
    }

    const rows = await this.db
      .select({ id: questions.id, createdAt: questions.createdAt })
      .from(questions)
      .innerJoin(questionTags, eq(questionTags.questionId, questions.id))
      .innerJoin(tags, eq(tags.id, questionTags.tagId))
      .where(and(...whereParts, inArray(tags.slug, [...filters.tagSlugs])))
      .groupBy(questions.id, questions.createdAt)
      .orderBy(desc(questions.createdAt), asc(questions.id));

    return rows.map((r) => r.id);
  }

  private toDomain(
    row: schema.Question & {
      choices: schema.Choice[];
      questionTags: Array<schema.QuestionTag & { tag: schema.Tag }>;
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
        sortOrder: c.sortOrder,
      };
    });

    return {
      id: row.id,
      slug: row.slug,
      stemMd: row.stemMd,
      explanationMd: row.explanationMd,
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
