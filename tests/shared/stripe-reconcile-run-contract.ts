import { describe, expect, it } from 'vitest';
import type { StripeReconcileRunRepository } from '@/src/application/ports/repositories';

/** A store with no runs in it, and its adapter. */
export type StripeReconcileRunHarness = {
  repository: StripeReconcileRunRepository;
};

const MINUTE_MS = 60_000;
const BASE = new Date('2026-11-24T08:00:00.000Z');
const at = (minutes: number) => new Date(BASE.getTime() + minutes * MINUTE_MS);

/**
 * DEBT-501 item 9: the same scenarios run against the fake and the Postgres
 * adapter, so the watch's unit tests cannot pass on a store that differs from
 * production's.
 */
export function runStripeReconcileRunContract(
  adapter: string,
  createHarness: () => Promise<StripeReconcileRunHarness>,
): void {
  describe(`${adapter} reconcile run contract`, () => {
    it('has no latest start before any run starts', async () => {
      const { repository } = await createHarness();

      expect(await repository.latestStartedAt()).toBeNull();
    });

    it('returns the latest start whatever order the runs were recorded in', async () => {
      const { repository } = await createHarness();
      await repository.recordStart(at(60));
      await repository.recordStart(at(0));

      expect(await repository.latestStartedAt()).toEqual(at(60));
    });

    it('gives each start its own ID', async () => {
      const { repository } = await createHarness();

      const first = await repository.recordStart(at(0));
      const second = await repository.recordStart(at(0));

      expect(first).not.toBe(second);
    });

    it('lists unreported runs with no finish that started before the cutoff, oldest first', async () => {
      const { repository } = await createHarness();
      const later = await repository.recordStart(at(30));
      const earlier = await repository.recordStart(at(10));
      const finished = await repository.recordStart(at(20));
      await repository.recordFinish(finished, at(21), []);
      await repository.recordStart(at(40));

      expect(await repository.listUnreportedUnfinished(at(40))).toEqual([
        { id: earlier, startedAt: at(10) },
        { id: later, startedAt: at(30) },
      ]);
    });

    it('leaves a reported run out of the unfinished list, and only that run', async () => {
      const { repository } = await createHarness();
      const reported = await repository.recordStart(at(0));
      const kept = await repository.recordStart(at(1));

      await repository.markReported([reported], at(60));
      await repository.markReported([], at(60));

      expect(await repository.listUnreportedUnfinished(at(60))).toEqual([
        { id: kept, startedAt: at(1) },
      ]);
    });

    it('keeps a recorded start when the caller changes its Date afterwards', async () => {
      const { repository } = await createHarness();
      const startedAt = at(0);
      const id = await repository.recordStart(startedAt);

      startedAt.setTime(at(30).getTime());

      expect(await repository.listUnreportedUnfinished(at(60))).toEqual([
        { id, startedAt: at(0) },
      ]);
    });

    it('keeps a recorded start when a listed copy is changed', async () => {
      const { repository } = await createHarness();
      const id = await repository.recordStart(at(0));
      await repository.recordFinish(id, at(1), []);

      const [finished] = await repository.listLatestFinished(1);
      finished?.startedAt.setTime(at(30).getTime());

      expect(await repository.listLatestFinished(1)).toEqual([
        { id, startedAt: at(0), failedSubscriptionIds: [] },
      ]);
    });

    it('lists finished runs newest start first, with their failed subscription IDs, up to the limit', async () => {
      const { repository } = await createHarness();
      const oldest = await repository.recordStart(at(0));
      const middle = await repository.recordStart(at(1440));
      const newest = await repository.recordStart(at(2880));
      await repository.recordStart(at(4320));
      await repository.recordFinish(oldest, at(1), ['sub_a']);
      await repository.recordFinish(newest, at(2881), ['sub_b', 'sub_a']);
      await repository.recordFinish(middle, at(1441), []);

      expect(await repository.listLatestFinished(2)).toEqual([
        {
          id: newest,
          startedAt: at(2880),
          failedSubscriptionIds: ['sub_b', 'sub_a'],
        },
        { id: middle, startedAt: at(1440), failedSubscriptionIds: [] },
      ]);
    });
  });
}
