import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import type {
  Logger,
  OperationalAlerts,
  RateLimiter,
} from '@/src/application/ports';

export const OPERATIONAL_ALERT_DRILL_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
export const OPERATIONAL_ALERT_DRILL_KEY = 'operational-alert-drill';

export type OperationalAlertDrillOutcome =
  | 'raised'
  | 'not_due'
  | 'gate_unavailable';

/**
 * DEBT-505: once per fixed 30-day window, raises a drill alert through the
 * real alert path: the port, its cooldowns, the server Sentry project and its
 * email workflow. The owner's inbox then proves the whole path works, and a
 * drill that stops arriving shows it broke. The gate is the shared Postgres
 * limiter, so every cron run and server instance shares one window. It never
 * throws: the renewal job it runs in must not fail because of it.
 */
export async function raiseOperationalAlertDrillIfDue(
  deps: {
    rateLimiter: Pick<RateLimiter, 'limit'>;
    alerts: OperationalAlerts;
    logger: Pick<Logger, 'warn'>;
  },
  options: { key?: string } = {},
): Promise<OperationalAlertDrillOutcome> {
  let due: boolean;
  try {
    const gate = await deps.rateLimiter.limit({
      key: options.key ?? OPERATIONAL_ALERT_DRILL_KEY,
      limit: 1,
      windowMs: OPERATIONAL_ALERT_DRILL_INTERVAL_MS,
    });
    due = gate.success;
  } catch (error) {
    deps.logger.warn(
      { error: projectSafeErrorDiagnostics(error) },
      'operational_alert_drill_gate_unavailable',
    );
    return 'gate_unavailable';
  }
  if (!due) return 'not_due';
  await deps.alerts.raise({ kind: 'operational_alert_drill', count: 1 });
  return 'raised';
}
