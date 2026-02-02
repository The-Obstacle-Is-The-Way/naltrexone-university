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
