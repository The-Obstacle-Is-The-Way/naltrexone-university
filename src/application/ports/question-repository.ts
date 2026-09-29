import type {
  PracticeSessionQuestionState,
  Question,
} from '@/src/domain/entities';
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
 * A practice-session item's question and the revision it is bound to
 * (ADR-021). A `PracticeSessionQuestionState` is one.
 */
export type SessionItemBinding = Pick<
  PracticeSessionQuestionState,
  'questionId' | 'questionRevisionId'
>;

export interface QuestionRepository {
  findPublishedById(id: string): Promise<Question | null>;
  findPublishedBySlug(slug: string): Promise<Question | null>;
  findPublishedByIds(ids: readonly string[]): Promise<readonly Question[]>;

  /**
   * Returns a session item's question regardless of `questions.status`, with
   * the content and choices of the revision the item is bound to, else of the
   * question's current revision (an item an older deployment left unbound).
   *
   * Callers MUST take the item from the caller's owned practice session. This
   * deliberately bypasses the published boundary and must never back public
   * browsing or candidate selection.
   */
  findByIdForSession(item: SessionItemBinding): Promise<Question | null>;

  /**
   * Returns session items' questions, in the items' order, as
   * `findByIdForSession` does.
   *
   * Callers MUST take the items from the caller's owned practice session. This
   * deliberately bypasses the published boundary and must never back public
   * browsing or candidate selection.
   */
  findByIdsForSession(
    items: readonly SessionItemBinding[],
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
