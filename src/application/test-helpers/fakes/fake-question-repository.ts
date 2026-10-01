import { ApplicationError } from '@/src/application/errors';
import type {
  QuestionFilters,
  QuestionRepository,
  QuestionRevisionBinding,
} from '@/src/application/ports/repositories';
import type { Question } from '@/src/domain/entities';
import type { QuestionDifficulty } from '@/src/domain/value-objects';

function matchesDifficulty(
  difficulty: QuestionDifficulty,
  filter: readonly QuestionDifficulty[],
): boolean {
  if (filter.length === 0) return true;
  return filter.includes(difficulty);
}

function matchesTags(question: Question, tagSlugs: readonly string[]): boolean {
  if (tagSlugs.length === 0) return true;
  const slugs = new Set(question.tags.map((t) => t.slug));
  return tagSlugs.some((slug) => slugs.has(slug));
}

function validateStatusFilterInvariant(filters: QuestionFilters): void {
  const statuses = filters.statuses ?? [];
  if (statuses.length > 0 && typeof filters.userId !== 'string') {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'userId is required when filtering by status',
    );
  }
}

// Each listed question is one revision. A test may list several revisions of
// a question (same id, different revisionId), the current one first. As the
// Drizzle adapter composes a read, a revision keeps its content, difficulty
// and choices and takes the rest from its question: slug, status, tags and
// timestamps. `isCurrentRevision` follows the order, as the adapter derives it
// from the question's current-revision pointer.
export function listedRevisions(
  questions: readonly Question[],
): readonly Question[] {
  const currentById = new Map<string, Question>();
  return questions.map((revision) => {
    const current = currentById.get(revision.id);
    if (!current) {
      currentById.set(revision.id, revision);
      return revision.isCurrentRevision
        ? revision
        : { ...revision, isCurrentRevision: true };
    }
    return {
      ...revision,
      isCurrentRevision: false,
      slug: current.slug,
      status: current.status,
      tags: current.tags,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    };
  });
}

// Every lookup except a bound session item or attempt reads the current
// revision.
export class FakeQuestionRepository implements QuestionRepository {
  private readonly questions: readonly Question[];
  private readonly revisions: readonly Question[];
  readonly findByIdsForSessionCalls: string[][] = [];
  readonly listPublishedCandidateIdsCalls: QuestionFilters[] = [];
  readonly countPublishedCandidateIdsCalls: QuestionFilters[] = [];

  constructor(questions: readonly Question[]) {
    this.revisions = listedRevisions(questions);
    this.questions = this.revisions.filter(
      (question) => question.isCurrentRevision,
    );
  }

  async findPublishedById(id: string): Promise<Question | null> {
    const found = this.questions.find((q) => q.id === id);
    if (!found) return null;
    if (found.status !== 'published') return null;
    return found;
  }

  async findPublishedBySlug(slug: string): Promise<Question | null> {
    const found = this.questions.find((q) => q.slug === slug);
    if (!found) return null;
    if (found.status !== 'published') return null;
    return found;
  }

  async findIdBySlug(slug: string): Promise<string | null> {
    return this.questions.find((q) => q.slug === slug)?.id ?? null;
  }

  async findByIdForSession(
    item: QuestionRevisionBinding,
  ): Promise<Question | null> {
    return this.findByBinding(item);
  }

  async findByIdsForSession(
    items: readonly QuestionRevisionBinding[],
  ): Promise<readonly Question[]> {
    this.findByIdsForSessionCalls.push(items.map((item) => item.questionId));
    return items
      .map((item) => this.findByBinding(item))
      .filter((q): q is Question => !!q);
  }

  private findByBinding(item: QuestionRevisionBinding): Question | null {
    if (!this.questions.some((q) => q.id === item.questionId)) return null;
    const bound = this.revisions.find(
      (q) =>
        q.id === item.questionId && q.revisionId === item.questionRevisionId,
    );
    if (!bound) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        `Revision ${item.questionRevisionId} is not a revision of question ${item.questionId}`,
      );
    }
    return bound;
  }

  async listPublishedCandidateIds(
    filters: QuestionFilters,
  ): Promise<readonly string[]> {
    validateStatusFilterInvariant(filters);
    this.listPublishedCandidateIdsCalls.push(filters);
    const matches = this.questions
      .filter((q) => q.status === 'published')
      .filter((q) => matchesDifficulty(q.difficulty, filters.difficulties))
      .filter((q) => matchesTags(q, filters.tagSlugs))
      .sort((a, b) => {
        // Deterministic order: createdAt desc, then id asc
        const created = b.createdAt.getTime() - a.createdAt.getTime();
        if (created !== 0) return created;
        return a.id.localeCompare(b.id);
      });

    return matches.map((q) => q.id);
  }

  async countPublishedCandidateIds(filters: QuestionFilters): Promise<number> {
    validateStatusFilterInvariant(filters);
    this.countPublishedCandidateIdsCalls.push(filters);

    return this.questions
      .filter((q) => q.status === 'published')
      .filter((q) => matchesDifficulty(q.difficulty, filters.difficulties))
      .filter((q) => matchesTags(q, filters.tagSlugs)).length;
  }
}
