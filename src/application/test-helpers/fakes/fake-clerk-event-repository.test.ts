import { describe, expect, it } from 'vitest';
import { FakeClerkEventRepository } from './fake-clerk-event-repository';

describe('FakeClerkEventRepository', () => {
  it('claims new events and returns false for existing ones', async () => {
    const repo = new FakeClerkEventRepository();

    await expect(repo.claim('evt_1', 'user.updated')).resolves.toBe(true);
    await expect(repo.claim('evt_1', 'user.updated')).resolves.toBe(false);
  });

  it('tracks processed and failed states', async () => {
    const repo = new FakeClerkEventRepository();
    await repo.claim('evt_1', 'user.updated');

    await repo.markFailed('evt_1', 'boom');
    await expect(repo.lock('evt_1')).resolves.toEqual({
      processedAt: null,
      error: 'boom',
    });

    await repo.markProcessed('evt_1');
    await expect(repo.lock('evt_1')).resolves.toEqual({
      processedAt: expect.any(Date),
      error: null,
    });
  });

  it('restores snapshots', async () => {
    const repo = new FakeClerkEventRepository();
    await repo.claim('evt_1', 'user.updated');
    await repo.markFailed('evt_1', 'boom');

    const snapshot = repo.snapshot();

    await repo.markProcessed('evt_1');
    await repo.claim('evt_2', 'user.deleted');

    repo.restore(snapshot);

    await expect(repo.lock('evt_1')).resolves.toEqual({
      processedAt: null,
      error: 'boom',
    });
    await expect(repo.lock('evt_2')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
