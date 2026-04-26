import { isNotNull, isNull, ne, or, type SQL } from 'drizzle-orm';
import { practiceSessions } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';

/**
 * Returns the SQL predicate that hides attempt rows belonging to active
 * (non-ended) exam sessions. Standalone attempts (no session) and tutor /
 * ended-exam attempts pass through.
 *
 * Callers MUST include
 * `leftJoin(practiceSessions, eq(attempts.practiceSessionId, practiceSessions.id))`
 * (or its equivalent for whichever attempts/sessions tables are in scope) so
 * `practiceSessions.id`, `practiceSessions.mode`, and `practiceSessions.endedAt`
 * resolve.
 */
export function getActiveExamVisibilityCondition(): SQL {
  const condition = or(
    isNull(practiceSessions.id),
    ne(practiceSessions.mode, 'exam'),
    isNotNull(practiceSessions.endedAt),
  );
  if (!condition) {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      'Active exam visibility condition unexpectedly missing',
    );
  }
  return condition;
}
