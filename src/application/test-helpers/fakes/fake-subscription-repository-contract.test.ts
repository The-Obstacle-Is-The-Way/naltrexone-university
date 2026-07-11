import { runSubscriptionObservationVersionContract } from '@/tests/shared/subscription-observation-version-contract';
import { FakeSubscriptionRepository } from './fake-subscription-repository';

runSubscriptionObservationVersionContract(
  'FakeSubscriptionRepository',
  async () => ({
    repository: new FakeSubscriptionRepository() as never,
    userId: crypto.randomUUID(),
    externalSubscriptionId: (label) => `sub_${label}_${crypto.randomUUID()}`,
  }),
);
