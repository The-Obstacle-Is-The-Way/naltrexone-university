import type { Question } from '@/src/domain/entities';
import type {
  QuestionAvailability,
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
 * (ADR-021). A `PracticeSessionQuestionState` and an `Attempt` are each one;
 * every one names its revision (migration 0043).
 */
export type QuestionRevisionBinding = {
  readonly questionId: string;
  readonly questionRevisionId: string;
};

export interface QuestionRepository {
  findPublishedById(id: string): Promise<Question | null>;
  findPublishedBySlug(slug: string): Promise<Question | null>;

  /**
   * Returns a question's id by slug, whatever its status. Only for resolving a
   * review the caller then proves the learner owns (ADR-021 §3); never for
   * showing content.
   */
  findIdBySlug(slug: string): Promise<string | null>;

  /**
   * Returns a session item's or attempt's question regardless of
   * `questions.status`, with the content and choices of the revision it is
   * bound to.
   *
   * Callers MUST take the binding from the caller's own practice session or
   * attempts (ADR-021 §3). This deliberately bypasses the published boundary
   * and must never back public browsing or candidate selection.
   */
  findByIdForSession(item: QuestionRevisionBinding): Promise<Question | null>;

  /**
   * Returns the questions of session items or attempts, in the bindings'
   * order, as `findByIdForSession` does. A missing question is omitted for
   * every binding of it; every other binding yields exactly one question, so
   * two bindings of one question at different revisions yield both.
   *
   * Callers MUST take the bindings from the caller's own practice session or
   * attempts (ADR-021 §3). This deliberately bypasses the published boundary
   * and must never back public browsing or candidate selection.
   */
  findByIdsForSession(
    items: readonly QuestionRevisionBinding[],
  ): Promise<readonly Question[]>;

  /**
   * Returns each question's availability by id, whatever its status, derived
   * as every other read derives it (ADR-022 Decision 1). An id with no
   * question is left out. It reveals no content, so it serves a reference
   * that binds no revision, such as a bookmark.
   */
  findAvailabilityByIds(
    questionIds: readonly string[],
  ): Promise<ReadonlyMap<string, QuestionAvailability>>;

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
