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
});
