import { describe, expect, it } from 'vitest';
import {
  FakeSubscriptionRepository,
  FakeTrialPaymentMethodSetupOperationRepository,
} from '@/src/application/test-helpers/fakes';
import { seedTrialSetupOperation } from '@/src/application/test-helpers/trial-payment-method-setup-operations';
import { createSubscription } from '@/src/domain/test-helpers';
import { CheckTrialSavedCardUseCase } from './check-trial-saved-card';

// BUG-308: the app shell and Billing must know when a trial already renews on
// a saved card, instead of asking the learner to add one.
describe('CheckTrialSavedCardUseCase', () => {
  const userId = crypto.randomUUID();
  const currentSubscription = 'sub_current';

  function createUseCase() {
    const subscriptions = new FakeSubscriptionRepository([
      {
        subscription: createSubscription({ userId, status: 'inTrial' }),
        externalSubscriptionId: currentSubscription,
      },
    ]);
    const operations = new FakeTrialPaymentMethodSetupOperationRepository();
    return {
      operations,
      useCase: new CheckTrialSavedCardUseCase(subscriptions, operations),
    };
  }

  it('reports no saved card when the learner has no Stripe subscription', async () => {
    const operations = new FakeTrialPaymentMethodSetupOperationRepository();
    const useCase = new CheckTrialSavedCardUseCase(
      new FakeSubscriptionRepository(),
      operations,
    );

    await expect(useCase.execute({ userId })).resolves.toEqual({
      cardSaved: false,
    });
  });

  it('reports a saved card once the add-card flow set it as the current subscription default', async () => {
    const { operations, useCase } = createUseCase();
    await seedTrialSetupOperation(operations, {
      userId,
      stripeSubscriptionId: currentSubscription,
      stage: 'defaultSet',
    });

    await expect(useCase.execute({ userId })).resolves.toEqual({
      cardSaved: true,
    });
  });

  it('ignores a card saved for an earlier subscription', async () => {
    const { operations, useCase } = createUseCase();
    await seedTrialSetupOperation(operations, {
      userId,
      stripeSubscriptionId: 'sub_earlier',
      stage: 'completed',
    });

    await expect(useCase.execute({ userId })).resolves.toEqual({
      cardSaved: false,
    });
  });
});
