import type {
  OperationalAlert,
  OperationalAlertOutcome,
  OperationalAlerts,
} from '@/src/application/ports/operational-alerts';

export class FakeOperationalAlerts implements OperationalAlerts {
  readonly raised: OperationalAlert[] = [];
  private readonly outcomes: OperationalAlertOutcome[] = [];

  /** Makes the next alerts meet these outcomes, in order; later ones are sent. */
  nextOutcomes(...outcomes: OperationalAlertOutcome[]): void {
    this.outcomes.push(...outcomes);
  }

  async raise(alert: OperationalAlert): Promise<OperationalAlertOutcome> {
    this.raised.push(alert);
    return this.outcomes.shift() ?? 'sent';
  }
}
