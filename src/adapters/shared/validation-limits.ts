/**
 * Shared validation limits used at adapter/controller boundaries.
 *
 * Rationale:
 * - Keep Zod schema constraints consistent across controllers.
 * - Prevent abuse via excessively large inputs (payload size / CPU / DB load).
 * - Avoid duplicated "magic numbers" scattered across files.
 */

/** Max number of rows per page in paginated controller outputs. */
export const MAX_PAGINATION_LIMIT = 100;

/** Max time allowed for a single question attempt (seconds). */
export const MAX_TIME_SPENT_SECONDS = 86_400; // 24 hours

/**
 * Practice session parameter limits.
 *
 * Rationale:
 * - Prevents excessively large `params_json` payloads and sessions that would be slow to start/render.
 * - Matches SSOT input constraints for `startPracticeSession` (docs/specs/master_spec.md §4.5.5).
 */

/** Max questions per practice session. */
export const MAX_PRACTICE_SESSION_QUESTIONS = 200;

/** Max tag filters per practice session. */
export const MAX_PRACTICE_SESSION_TAG_FILTERS = 50;

/** Max difficulty filters per practice session (easy/medium/hard). */
export const MAX_PRACTICE_SESSION_DIFFICULTY_FILTERS = 3;
