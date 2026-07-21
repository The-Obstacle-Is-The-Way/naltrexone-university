import {
  createDatabaseTargetPlan,
  type DatabaseTargetPlan,
} from '../database-target';

/**
 * Non-interactive authorization for checked-in CI, Vercel, E2E, and resolver
 * wrappers. It is intentionally unavailable through an env var or CLI flag.
 */
export function authorizeManagedDatabaseTargets(
  databaseUrls: readonly string[],
): DatabaseTargetPlan {
  return createDatabaseTargetPlan(databaseUrls);
}
