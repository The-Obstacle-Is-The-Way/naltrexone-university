import type { RateLimiter } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type {
  OperationalAlert,
  OperationalAlertKind,
  OperationalAlerts,
} from '@/src/application/ports/operational-alerts';
import type { OperationalAlertEvent } from '../shared/operational-alert-events';
import { projectSafeErrorDiagnostics } from '../shared/safe-error-diagnostics';

export const OPERATIONAL_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const OPERATIONAL_ALERT_COOLDOWN_KEY_PREFIX = 'operational-alert:';

/**
 * The in-process cooldown. Containers are built per request, so production
 * shares one instance per server process.
 */
export class LocalAlertCooldown {
  private readonly lastAdmittedAt = new Map<OperationalAlertKind, number>();

  admit(kind: OperationalAlertKind, nowMs: number): boolean {
    const last = this.lastAdmittedAt.get(kind);
    if (last !== undefined && nowMs - last < OPERATIONAL_ALERT_COOLDOWN_MS) {
      return false;
    }
    this.lastAdmittedAt.set(kind, nowMs);
    return true;
  }
}

// The limiter's fixed windows start at multiples of their length since the
// epoch; the event names the same window the shared cooldown counted it in.
function cooldownWindowStart(nowMs: number): string {
  return new Date(
    nowMs - (nowMs % OPERATIONAL_ALERT_COOLDOWN_MS),
  ).toISOString();
}

export type CooldownOperationalAlertsDeps = {
  rateLimiter: Pick<RateLimiter, 'limit'>;
  send: (event: OperationalAlertEvent) => Promise<void>;
  logger: Pick<Logger, 'error' | 'warn'>;
  now: () => Date;
  localCooldown: LocalAlertCooldown;
  keyPrefix: string;
};

// DEBT-505: two cooldowns per kind, each six hours. The in-process one is
// checked first and always holds. The shared one, a limit of one per fixed
// window on the Postgres limiter, makes it one event per kind per window
// across instances. When the limiter fails the event is still sent, tagged,
// since BUG-323's alert reports that same database failing; the in-process
// cooldown then bounds it to one per kind per instance.
export class CooldownOperationalAlerts implements OperationalAlerts {
  constructor(private readonly deps: CooldownOperationalAlertsDeps) {}

  async raise(alert: OperationalAlert): Promise<void> {
    try {
      const nowMs = this.deps.now().getTime();
      if (!this.deps.localCooldown.admit(alert.kind, nowMs)) return;
      const sharedCooldown = await this.takeSharedCooldown(alert.kind);
      if (sharedCooldown === 'taken') return;
      await this.deps.send({
        kind: alert.kind,
        count: alert.count,
        sharedCooldown,
        window: cooldownWindowStart(nowMs),
      });
    } catch (error) {
      try {
        this.deps.logger.error(
          { alertKind: alert.kind, error: projectSafeErrorDiagnostics(error) },
          'operational_alert_send_failed',
        );
      } catch {
        // An alert that cannot be sent must not change the caller's outcome.
      }
    }
  }

  private async takeSharedCooldown(
    kind: OperationalAlertKind,
  ): Promise<'held' | 'taken' | 'unavailable'> {
    try {
      const result = await this.deps.rateLimiter.limit({
        key: `${this.deps.keyPrefix}${kind}`,
        limit: 1,
        windowMs: OPERATIONAL_ALERT_COOLDOWN_MS,
      });
      return result.success ? 'held' : 'taken';
    } catch (error) {
      this.deps.logger.warn(
        { alertKind: kind, error: projectSafeErrorDiagnostics(error) },
        'operational_alert_shared_cooldown_unavailable',
      );
      return 'unavailable';
    }
  }
}
