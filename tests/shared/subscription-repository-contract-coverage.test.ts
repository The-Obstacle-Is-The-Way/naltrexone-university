import { describe, expect, it } from 'vitest';
import { SUBSCRIPTION_REPOSITORY_CONTRACT_METHODS } from './subscription-observation-version-contract';

describe('SubscriptionRepository fake-real contract coverage', () => {
  it('names every public port method', () => {
    expect(SUBSCRIPTION_REPOSITORY_CONTRACT_METHODS).toEqual([
      'findByUserId',
      'findExternalSubscriptionIdByUserId',
      'findObservationVersionByUserId',
      'findByExternalSubscriptionId',
      'upsert',
    ]);
  });
});
