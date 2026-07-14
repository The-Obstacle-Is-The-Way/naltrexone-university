import { describe, expect, it, vi } from 'vitest';
import {
  ApplicationError,
  isSubscriptionObservationAttemptsExhaustedError,
} from '@/src/application/errors';
import type { SubscriptionUpsertResult } from '@/src/application/ports/repositories';
import {
  persistSubscriptionObservation,
  SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
} from './persist-subscription-observation';

type Observation = {
  sequence: number;
  userId: string;
};

const userId = 'user_1';

function persisted(): SubscriptionUpsertResult {
  return { persisted: true };
}

function versionConflict(): SubscriptionUpsertResult {
  return { persisted: false, reason: 'version_conflict' };
}

describe('persistSubscriptionObservation', () => {
  it('reads the version before every retrieve and retries the whole operation', async () => {
    const operations: string[] = [];
    const versions = [3, 4, 5];
    let retrieveCount = 0;
    let persistCount = 0;

    const result = await persistSubscriptionObservation<Observation>({
      userId,
      readVersion: async () => {
        const version = versions.shift();
        if (version === undefined) throw new Error('Missing version');
        operations.push(`read:${version}`);
        return version;
      },
      retrieve: async () => {
        retrieveCount += 1;
        operations.push(`retrieve:${retrieveCount}`);
        return { sequence: retrieveCount, userId };
      },
      getUserId: (observation) => observation.userId,
      persist: async (observation, expectedVersion) => {
        persistCount += 1;
        operations.push(
          `persist:${observation.sequence}:${String(expectedVersion)}`,
        );
        return persistCount < 3 ? versionConflict() : persisted();
      },
    });

    expect(result).toEqual({
      observation: { sequence: 3, userId },
      write: { persisted: true },
    });
    expect(operations).toEqual([
      'read:3',
      'retrieve:1',
      'persist:1:3',
      'read:4',
      'retrieve:2',
      'persist:2:4',
      'read:5',
      'retrieve:3',
      'persist:3:5',
    ]);
  });

  it('uses a supplied Phase-1 version before the first retrieve', async () => {
    const operations: string[] = [];
    let retrieveCount = 0;
    let persistCount = 0;

    await persistSubscriptionObservation<Observation>({
      userId,
      initialExpectedVersion: 7,
      readVersion: async () => {
        operations.push('read:8');
        return 8;
      },
      retrieve: async () => {
        retrieveCount += 1;
        operations.push(`retrieve:${retrieveCount}`);
        return { sequence: retrieveCount, userId };
      },
      getUserId: (observation) => observation.userId,
      persist: async (_observation, expectedVersion) => {
        persistCount += 1;
        operations.push(`persist:${String(expectedVersion)}`);
        return persistCount === 1 ? versionConflict() : persisted();
      },
    });

    expect(operations).toEqual([
      'retrieve:1',
      'persist:7',
      'read:8',
      'retrieve:2',
      'persist:8',
    ]);
  });

  it('preserves a supplied absent-row expectation without reading again', async () => {
    const readVersion = vi.fn(async () => 9);
    const persist = vi.fn(async () => persisted());

    await persistSubscriptionObservation<Observation>({
      userId,
      initialExpectedVersion: null,
      readVersion,
      retrieve: async () => ({ sequence: 1, userId }),
      getUserId: (observation) => observation.userId,
      persist,
    });

    expect(readVersion).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledWith({ sequence: 1, userId }, null);
  });

  it('uses the first retrieve only for user discovery before a fenced re-retrieve', async () => {
    const operations: string[] = [];
    let retrieveCount = 0;

    const result = await persistSubscriptionObservation<Observation>({
      userId: null,
      readVersion: async (discoveredUserId) => {
        operations.push(`read:${discoveredUserId}`);
        return null;
      },
      retrieve: async () => {
        retrieveCount += 1;
        operations.push(`retrieve:${retrieveCount}`);
        return { sequence: retrieveCount, userId };
      },
      getUserId: (observation) => observation.userId,
      persist: async (observation, expectedVersion) => {
        operations.push(
          `persist:${observation.sequence}:${String(expectedVersion)}`,
        );
        return persisted();
      },
    });

    expect(result.observation.sequence).toBe(2);
    expect(operations).toEqual([
      'retrieve:1',
      `read:${userId}`,
      'retrieve:2',
      'persist:2:null',
    ]);
  });

  it('returns a write-guard rejection without retrying', async () => {
    const retrieve = vi.fn(async () => ({ sequence: 1, userId }));
    const readVersion = vi.fn(async () => 2);
    const write: SubscriptionUpsertResult = {
      persisted: false,
      reason: 'write_guard_rejected',
      current: {
        id: 'subscription_row_1',
        userId,
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2030-01-01T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    };
    const persist = vi.fn(async () => write);

    await expect(
      persistSubscriptionObservation<Observation>({
        userId,
        readVersion,
        retrieve,
        getUserId: (observation) => observation.userId,
        persist,
      }),
    ).resolves.toEqual({
      observation: { sequence: 1, userId },
      write,
    });
    expect(readVersion).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the refreshed observation changes user identity', async () => {
    const retrieve = vi
      .fn<() => Promise<Observation>>()
      .mockResolvedValueOnce({ sequence: 1, userId })
      .mockResolvedValueOnce({ sequence: 2, userId: 'user_2' });
    const persist = vi.fn(async () => persisted());

    await expect(
      persistSubscriptionObservation<Observation>({
        userId: null,
        readVersion: async () => 4,
        retrieve,
        getUserId: (observation) => observation.userId,
        persist,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Subscription observation user changed during refresh',
    });
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(persist).not.toHaveBeenCalled();
  });

  it('throws a typed exhaustion outcome after three fresh retrieves', async () => {
    const retrieve = vi.fn(async () => ({ sequence: 1, userId }));
    const readVersion = vi.fn(async () => 2);
    const persist = vi.fn(async () => versionConflict());

    await expect(
      persistSubscriptionObservation<Observation>({
        userId,
        readVersion,
        retrieve,
        getUserId: (observation) => observation.userId,
        persist,
      }),
    ).rejects.toMatchObject({
      name: 'SubscriptionObservationAttemptsExhaustedError',
      code: 'CONFLICT',
      reason: 'version_conflict_attempts_exhausted',
      attempts: SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
      message: `Subscription observation version conflicted after ${SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS} attempts`,
    });
    expect(readVersion).toHaveBeenCalledTimes(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    );
    expect(retrieve).toHaveBeenCalledTimes(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    );
    expect(persist).toHaveBeenCalledTimes(
      SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS,
    );
  });

  it('does not classify a same-message generic conflict as attempts exhausted', () => {
    const error = new ApplicationError(
      'CONFLICT',
      `Subscription observation version conflicted after ${SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS} attempts`,
    );

    expect(isSubscriptionObservationAttemptsExhaustedError(error)).toBe(false);
  });
});
