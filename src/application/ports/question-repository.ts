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

/**
 * A question and the revision a session item or attempt is bound to
 * (ADR-021). A `PracticeSessionQuestionState` and an `Attempt` are each one.
 * A null revision, on a row a deployment older than binding wrote, reads the
 * question's current revision.
 */
export type QuestionRevisionBinding = {
  readonly questionId: string;
  readonly questionRevisionId: string | null;
};

export interface QuestionRepository {
  findPublishedById(id: string): Promise<Question | null>;
  findPublishedBySlug(slug: string): Promise<Question | null>;
  findPublishedByIds(ids: readonly string[]): Promise<readonly Question[]>;

  /**
   * Returns a published question as the revision its binding names, else as
   * its current revision: what a review of a session item or an earlier
   * attempt shows (ADR-021).
   */
  findPublishedByBinding(
    binding: QuestionRevisionBinding,
  ): Promise<Question | null>;

  /**
   * Returns published questions, in the bindings' order, as
   * `findPublishedByBinding` does.
   */
  findPublishedByBindings(
    bindings: readonly QuestionRevisionBinding[],
  ): Promise<readonly Question[]>;

  /**
   * Returns a session item's question regardless of `questions.status`, with
   * the content and choices of the revision the item is bound to, else of the
   * question's current revision (an item an older deployment left unbound).
   *
   * Callers MUST take the item from the caller's owned practice session. This
   * deliberately bypasses the published boundary and must never back public
   * browsing or candidate selection.
   */
  findByIdForSession(item: QuestionRevisionBinding): Promise<Question | null>;

  /**
   * Returns session items' questions, in the items' order, as
   * `findByIdForSession` does.
   *
   * Callers MUST take the items from the caller's owned practice session. This
   * deliberately bypasses the published boundary and must never back public
   * browsing or candidate selection.
   */
  findByIdsForSession(
    items: readonly QuestionRevisionBinding[],
  ): Promise<readonly Question[]>;

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

  /**
   * Return the total number of published question candidates for the given filters.
   *
   * Requirements:
   * - Only counts `questions.status='published'`.
   * - Applies the same filter semantics as `listPublishedCandidateIds`.
   */
  countPublishedCandidateIds(filters: QuestionFilters): Promise<number>;
}
