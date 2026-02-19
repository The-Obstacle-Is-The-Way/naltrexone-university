import { ApplicationError } from '@/src/application/errors';
import type {
  QuestionFilters,
  QuestionRepository,
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

export class FakeQuestionRepository implements QuestionRepository {
  private readonly questions: readonly Question[];
  readonly findPublishedByIdsCalls: string[][] = [];
  readonly listPublishedCandidateIdsCalls: QuestionFilters[] = [];
  readonly countPublishedCandidateIdsCalls: QuestionFilters[] = [];

  constructor(questions: readonly Question[]) {
    this.questions = questions;
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

  async findPublishedByIds(
    ids: readonly string[],
  ): Promise<readonly Question[]> {
    this.findPublishedByIdsCalls.push([...ids]);
    const byId = new Map(
      this.questions
        .filter((q) => q.status === 'published')
        .map((q) => [q.id, q]),
    );
    return ids.map((id) => byId.get(id)).filter((q): q is Question => !!q);
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
      .slice()
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
