import { operationalAlertDrills } from '@/db/schema';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { Logger, OperationalAlerts } from '@/src/application/ports';

export const OPERATIONAL_ALERT_DRILL_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export type OperationalAlertDrillOutcome =
  | 'raised'
  | 'not_due'
  | 'claim_unavailable';

/** The fixed 30-day drill cycle an instant falls in, counted from the epoch. */
export function operationalAlertDrillCycle(at: Date): number {
  return Math.floor(at.getTime() / OPERATIONAL_ALERT_DRILL_INTERVAL_MS);
}

/**
 * Claims a drill cycle: true for the one caller whose insert creates its row,
 * false for every other, across cron runs and server instances alike.
 */
export async function claimOperationalAlertDrillCycle(
  cycle: number,
  deps: { db: DrizzleDb },
): Promise<boolean> {
  const [claimed] = await deps.db
    .insert(operationalAlertDrills)
    .values({ cycle })
    .onConflictDoNothing()
    .returning({ cycle: operationalAlertDrills.cycle });
  return claimed !== undefined;
}

/**
 * DEBT-505: once per fixed 30-day cycle, raises a drill alert through the
 * real alert path: the port, its cooldowns, the server Sentry project and its
 * email workflow. The owner's inbox then proves the whole path works, and a
 * drill that stops arriving shows it broke. `raised` means handed to the
 * port; only the inbox proves delivery. It never throws: the renewal job it
 * runs in must not fail because of it.
 */
export async function raiseOperationalAlertDrillIfDue(deps: {
  now: () => Date;
  claimCycle: (cycle: number) => Promise<boolean>;
  alerts: OperationalAlerts;
  logger: Pick<Logger, 'warn'>;
}): Promise<OperationalAlertDrillOutcome> {
  let claimed: boolean;
  try {
    claimed = await deps.claimCycle(operationalAlertDrillCycle(deps.now()));
  } catch (error) {
    deps.logger.warn(
      { error: projectSafeErrorDiagnostics(error) },
      'operational_alert_drill_claim_unavailable',
    );
    return 'claim_unavailable';
  }
  if (!claimed) return 'not_due';
  await deps.alerts.raise({ kind: 'operational_alert_drill', count: 1 });
  return 'raised';
}
