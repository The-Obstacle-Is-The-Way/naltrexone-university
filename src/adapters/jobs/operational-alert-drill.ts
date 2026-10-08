import { eq } from 'drizzle-orm';
import { operationalAlertDrills } from '@/db/schema';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type { Logger, OperationalAlerts } from '@/src/application/ports';

export const OPERATIONAL_ALERT_DRILL_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export type OperationalAlertDrillOutcome =
  | 'raised'
  | 'not_sent'
  | 'not_due'
  | 'claim_unavailable';

/** The drill's once-per-cycle claims, kept in `operational_alert_drills`. */
export type OperationalAlertDrillCycles = {
  /** True for the one caller whose claim creates the cycle's row. */
  claim: (cycle: number) => Promise<boolean>;
  /** Gives a claimed cycle back, so a later run can send its drill. */
  release: (cycle: number) => Promise<void>;
};

/** The fixed 30-day drill cycle an instant falls in, counted from the epoch. */
export function operationalAlertDrillCycle(at: Date): number {
  return Math.floor(at.getTime() / OPERATIONAL_ALERT_DRILL_INTERVAL_MS);
}

/**
 * The drill cycles in Postgres. A claim inserts the cycle's row, so exactly
 * one caller wins, across cron runs and server instances alike.
 */
export function operationalAlertDrillCycles(deps: {
  db: DrizzleDb;
}): OperationalAlertDrillCycles {
  return {
    claim: async (cycle) => {
      const [claimed] = await deps.db
        .insert(operationalAlertDrills)
        .values({ cycle })
        .onConflictDoNothing()
        .returning({ cycle: operationalAlertDrills.cycle });
      return claimed !== undefined;
    },
    release: async (cycle) => {
      await deps.db
        .delete(operationalAlertDrills)
        .where(eq(operationalAlertDrills.cycle, cycle));
    },
  };
}

/**
 * DEBT-505: once per fixed 30-day cycle, raises a drill alert through the
 * real alert path: the port, its cooldowns, the server Sentry project and its
 * email workflow. The owner's inbox then proves the whole path works, and a
 * drill that stops arriving shows it broke. A drill that was not sent gives
 * its cycle back, so the next daily run tries again. `raised` means handed to
 * Sentry; only the inbox proves delivery. It never throws: the renewal job it
 * runs in must not fail because of it.
 */
export async function raiseOperationalAlertDrillIfDue(deps: {
  now: () => Date;
  cycles: OperationalAlertDrillCycles;
  alerts: OperationalAlerts;
  logger: Pick<Logger, 'warn'>;
}): Promise<OperationalAlertDrillOutcome> {
  const cycle = operationalAlertDrillCycle(deps.now());
  let claimed: boolean;
  try {
    claimed = await deps.cycles.claim(cycle);
  } catch (error) {
    deps.logger.warn(
      { error: projectSafeErrorDiagnostics(error) },
      'operational_alert_drill_claim_unavailable',
    );
    return 'claim_unavailable';
  }
  if (!claimed) return 'not_due';
  const outcome = await deps.alerts.raise({
    kind: 'operational_alert_drill',
    count: 1,
  });
  if (outcome === 'sent') return 'raised';
  try {
    await deps.cycles.release(cycle);
  } catch (error) {
    deps.logger.warn(
      { error: projectSafeErrorDiagnostics(error) },
      'operational_alert_drill_release_failed',
    );
  }
  return 'not_sent';
}
