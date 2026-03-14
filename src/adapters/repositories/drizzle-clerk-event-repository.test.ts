import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { DrizzleClerkEventRepository } from './drizzle-clerk-event-repository';

type RepoDb = ConstructorParameters<typeof DrizzleClerkEventRepository>[0];

describe('DrizzleClerkEventRepository', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('claims new events idempotently', async () => {
    const insertValues = vi.fn(() => ({
      onConflictDoNothing: () => ({
        returning: async () => [{ id: 'evt_123' }],
      }),
    }));

    const db = {
      insert: () => ({ values: insertValues }),
    } as const;

    const repo = new DrizzleClerkEventRepository(db as unknown as RepoDb);

    await expect(repo.claim('evt_123', 'user.updated')).resolves.toBe(true);
    expect(insertValues).toHaveBeenCalledWith({
      id: 'evt_123',
      type: 'user.updated',
      processedAt: null,
      error: null,
    });
  });

  it('returns false when claim hits an existing event', async () => {
    const insertValues = vi.fn(() => ({
      onConflictDoNothing: () => ({
        returning: async () => [],
      }),
    }));

    const db = {
      insert: () => ({ values: insertValues }),
    } as const;

    const repo = new DrizzleClerkEventRepository(db as unknown as RepoDb);

    await expect(repo.claim('evt_123', 'user.updated')).resolves.toBe(false);
    expect(insertValues).toHaveBeenCalledWith({
      id: 'evt_123',
      type: 'user.updated',
      processedAt: null,
      error: null,
    });
  });

  it('peeks existing events without locking', async () => {
    const processedAt = new Date('2026-02-01T12:00:00.000Z');
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ processedAt, error: null }],
          }),
        }),
      }),
    } as const;

    const repo = new DrizzleClerkEventRepository(db as unknown as RepoDb);

    await expect(repo.peek('evt_123')).resolves.toEqual({
      processedAt,
      error: null,
    });
  });

  it('locks existing events and throws when missing', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            for: async () => [],
          }),
        }),
      }),
    } as const;

    const repo = new DrizzleClerkEventRepository(db as unknown as RepoDb);

    await expect(repo.lock('evt_missing')).rejects.toBeInstanceOf(
      ApplicationError,
    );
    await expect(repo.lock('evt_missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('marks events processed', async () => {
    const now = new Date('2026-02-01T13:00:00.000Z');
    const nowFn = vi.fn(() => now);

    const updateSet = vi.fn(() => ({
      where: () => ({
        returning: async () => [{ id: 'evt_123' }],
      }),
    }));

    const db = {
      update: () => ({ set: updateSet }),
    } as const;

    const repo = new DrizzleClerkEventRepository(
      db as unknown as RepoDb,
      nowFn,
    );

    await expect(repo.markProcessed('evt_123')).resolves.toBeUndefined();
    expect(updateSet).toHaveBeenCalledWith({
      processedAt: now,
      error: null,
    });
  });

  it('marks events failed', async () => {
    const updateSet = vi.fn(() => ({
      where: () => ({
        returning: async () => [{ id: 'evt_123' }],
      }),
    }));

    const db = {
      update: () => ({ set: updateSet }),
    } as const;

    const repo = new DrizzleClerkEventRepository(db as unknown as RepoDb);

    await expect(
      repo.markFailed('evt_123', 'Something went wrong'),
    ).resolves.toBeUndefined();
    expect(updateSet).toHaveBeenLastCalledWith({
      processedAt: null,
      error: 'Something went wrong',
    });
  });
});
