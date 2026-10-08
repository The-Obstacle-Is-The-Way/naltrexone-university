import type {
  OperationalAlert,
  OperationalAlerts,
} from '@/src/application/ports/operational-alerts';

export class FakeOperationalAlerts implements OperationalAlerts {
  readonly raised: OperationalAlert[] = [];

  async raise(alert: OperationalAlert): Promise<void> {
    this.raised.push(alert);
  }
}
