import { describe, expect, it } from 'vitest';
import { FakeOperationalAlerts } from './fake-operational-alerts';

describe('FakeOperationalAlerts', () => {
  it('records every alert in order, with no cooldown', async () => {
    const alerts = new FakeOperationalAlerts();

    await alerts.raise({ kind: 'renewal_notice_deadline_missed', count: 2 });
    await alerts.raise({ kind: 'renewal_notice_outcome_unknown', count: 1 });
    await alerts.raise({ kind: 'renewal_notice_deadline_missed', count: 2 });

    expect(alerts.raised).toEqual([
      { kind: 'renewal_notice_deadline_missed', count: 2 },
      { kind: 'renewal_notice_outcome_unknown', count: 1 },
      { kind: 'renewal_notice_deadline_missed', count: 2 },
    ]);
  });

  it('reports each alert sent, unless told what the next ones meet', async () => {
    const alerts = new FakeOperationalAlerts();
    alerts.nextOutcomes('failed', 'suppressed');

    await expect(
      alerts.raise({ kind: 'operational_alert_drill', count: 1 }),
    ).resolves.toBe('failed');
    await expect(
      alerts.raise({ kind: 'operational_alert_drill', count: 1 }),
    ).resolves.toBe('suppressed');
    await expect(
      alerts.raise({ kind: 'operational_alert_drill', count: 1 }),
    ).resolves.toBe('sent');
    expect(alerts.raised).toHaveLength(3);
  });
});
