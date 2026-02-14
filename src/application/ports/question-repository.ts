import type { Question } from '@/src/domain/entities';
import type {
  QuestionDifficulty,
  QuestionProgressStatus,
} from '@/src/domain/value-objects';

/**
 * Filters for querying published question candidates.
 *
 * **Invariant:** When `statuses` is non-empty, `userId` MUST be provided.
 * Status values (`unanswered`, `incorrect`, `bookmarked`) are per-user concepts
 * that require attempt/bookmark lookups scoped to a specific user.
 * The repository implementation enforces this at runtime with a
 * `VALIDATION_ERROR` throw.
 */
export type QuestionFilters = {
  tagSlugs: readonly string[];
  difficulties: readonly QuestionDifficulty[];
  statuses?: readonly QuestionProgressStatus[];
  userId?: string;
};

export interface QuestionRepository {
  findPublishedById(id: string): Promise<Question | null>;
  findPublishedBySlug(slug: string): Promise<Question | null>;
  findPublishedByIds(ids: readonly string[]): Promise<readonly Question[]>;

  /**
   * Return candidate question ids for "next question" selection.
   *
   * Requirements:
   * - Only returns `questions.status='published'`.
   * - Applies filters deterministically.
   * - Returns ids in a deterministic order (repository defines ordering).
   */
  listPublishedCandidateIds(
    filters: QuestionFilters,
  ): Promise<readonly string[]>;
}
