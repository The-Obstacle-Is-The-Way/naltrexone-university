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
