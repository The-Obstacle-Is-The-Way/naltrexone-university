import { describe, expect, it } from 'vitest';
import { FakeLogger } from '@/src/application/test-helpers/fakes';
import { rollUpClerkBackendCallUsage } from './clerk-backend-call-usage';

// DEBT-503 item 4, step 1: the renewal job's roll-up step. The roll-up's own
// behaviour runs on real Postgres.
describe('rollUpClerkBackendCallUsage', () => {
  it('reports rows written as rolled up', async () => {
    const logger = new FakeLogger();

    await expect(
      rollUpClerkBackendCallUsage({
        rollUps: { rollUp: async () => 7 },
        logger,
      }),
    ).resolves.toBe('rolled_up');
    expect(logger.warnCalls).toEqual([]);
  });

  it('reports up to date when every period was already rolled up', async () => {
    await expect(
      rollUpClerkBackendCallUsage({
        rollUps: { rollUp: async () => 0 },
        logger: new FakeLogger(),
      }),
    ).resolves.toBe('up_to_date');
  });

  it('logs a failed roll-up and reports it unavailable, without throwing', async () => {
    const logger = new FakeLogger();

    await expect(
      rollUpClerkBackendCallUsage({
        rollUps: {
          rollUp: async () => {
            throw new Error('database unavailable');
          },
        },
        logger,
      }),
    ).resolves.toBe('unavailable');
    expect(logger.warnCalls).toEqual([
      expect.objectContaining({
        msg: 'clerk_backend_call_usage_roll_up_unavailable',
      }),
    ]);
  });
});
