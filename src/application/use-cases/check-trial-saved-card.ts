import type {
  SubscriptionRepository,
  TrialPaymentMethodSetupOperationRepository,
} from '@/src/application/ports/repositories';

export type CheckTrialSavedCardInput = { userId: string };
export type CheckTrialSavedCardOutput = { cardSaved: boolean };

// BUG-308: a trial gains a card only through the add-card flow, because the
// trial's billing portal offers no payment-method update (DEBT-414 F05). So
// it renews on a saved card exactly when that flow set one as the current
// Stripe subscription's default.
export class CheckTrialSavedCardUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly operations: TrialPaymentMethodSetupOperationRepository,
  ) {}

  async execute(
    input: CheckTrialSavedCardInput,
  ): Promise<CheckTrialSavedCardOutput> {
    const stripeSubscriptionId =
      await this.subscriptions.findExternalSubscriptionIdByUserId(input.userId);
    // Stryker disable next-line ConditionalExpression: with no subscription id the lookup could only answer false; the guard skips the query
    if (!stripeSubscriptionId) return { cardSaved: false };
    return {
      cardSaved: await this.operations.hasSubscriptionDefaultSet({
        userId: input.userId,
        stripeSubscriptionId,
      }),
    };
  }
}
