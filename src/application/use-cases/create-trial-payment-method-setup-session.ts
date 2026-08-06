import { ApplicationError } from '@/src/application/errors';
import type {
  PaymentGateway,
  TrialPaymentMethodSetupSessionInput,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type {
  StripeCustomerRepository,
  SubscriptionRepository,
  TrialPaymentMethodSetupOperationRepository,
} from '@/src/application/ports/repositories';
import type { SubscriptionPlan } from '@/src/domain/value-objects';

export type TrialRenewalTerms = Pick<
  TrialPaymentMethodSetupSessionInput,
  | 'plan'
  | 'amountCents'
  | 'currency'
  | 'frequency'
  | 'disclosureSnapshot'
  | 'disclosureVersion'
  | 'termsVersion'
  | 'termsHash'
  | 'cancellationMethod'
>;

export type CreateTrialPaymentMethodSetupSessionInput = {
  userId: string;
  successUrl: string;
  cancelUrl: string;
};

export type CreateTrialPaymentMethodSetupSessionOutput = { url: string };

export class CreateTrialPaymentMethodSetupSessionUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly stripeCustomers: StripeCustomerRepository,
    private readonly operations: TrialPaymentMethodSetupOperationRepository,
    private readonly payments: PaymentGateway,
    private readonly getRenewalTerms: (
      plan: SubscriptionPlan,
    ) => TrialRenewalTerms,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    input: CreateTrialPaymentMethodSetupSessionInput,
  ): Promise<CreateTrialPaymentMethodSetupSessionOutput> {
    const subscription = await this.subscriptions.findByUserId(input.userId);
    const now = this.now();
    if (
      subscription?.status !== 'inTrial' ||
      subscription.currentPeriodEnd <= now
    ) {
      throw new ApplicationError(
        'CONFLICT',
        'An unexpired trial is required to add a payment method',
      );
    }

    const [externalSubscriptionId, customer] = await Promise.all([
      this.subscriptions.findExternalSubscriptionIdByUserId(input.userId),
      this.stripeCustomers.findByUserId(input.userId),
    ]);
    if (!externalSubscriptionId || !customer) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Trial billing identifiers are unavailable',
      );
    }

    const terms = this.getRenewalTerms(subscription.plan);
    if (terms.plan !== subscription.plan) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Trial renewal terms do not match the subscription plan',
      );
    }

    const setupInput = {
      userId: input.userId,
      externalCustomerId: customer.stripeCustomerId,
      externalSubscriptionId,
      plan: subscription.plan,
      amountCents: terms.amountCents,
      currency: terms.currency,
      frequency: terms.frequency,
      trialEndsAt: subscription.currentPeriodEnd,
      disclosureSnapshot: terms.disclosureSnapshot,
      disclosureVersion: terms.disclosureVersion,
      termsVersion: terms.termsVersion,
      termsHash: terms.termsHash,
      cancellationMethod: terms.cancellationMethod,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    } satisfies TrialPaymentMethodSetupSessionInput;
    const session =
      await this.payments.createTrialPaymentMethodSetupSession(setupInput);

    try {
      await this.operations.createPending({
        sessionId: session.sessionId,
        userId: setupInput.userId,
        stripeCustomerId: setupInput.externalCustomerId,
        stripeSubscriptionId: setupInput.externalSubscriptionId,
        plan: setupInput.plan,
        amountCents: setupInput.amountCents,
        currency: setupInput.currency,
        frequency: setupInput.frequency,
        trialEndsAt: setupInput.trialEndsAt,
        disclosureSnapshot: setupInput.disclosureSnapshot,
        disclosureVersion: setupInput.disclosureVersion,
        termsVersion: setupInput.termsVersion,
        termsHash: setupInput.termsHash,
        cancellationMethod: setupInput.cancellationMethod,
      });
    } catch (error) {
      try {
        this.logger.error(
          {
            sessionId: session.sessionId,
            errorCode: error instanceof ApplicationError ? error.code : null,
          },
          'Failed to persist trial payment-method setup operation',
        );
      } catch {
        // Logging must not replace the persistence failure.
      }
      throw error;
    }

    return { url: session.url };
  }
}
