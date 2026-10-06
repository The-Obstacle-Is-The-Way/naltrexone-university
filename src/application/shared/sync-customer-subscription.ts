import { ApplicationError } from '@/src/application/errors';
import type {
  PaymentGateway,
  SubscriptionObservation,
} from '@/src/application/ports/gateways';
import type {
  SubscriptionRepository,
  SubscriptionUpsertResult,
} from '@/src/application/ports/repositories';
import { persistSubscriptionObservation } from './persist-subscription-observation';
import { compareCanonicalSubscriptionCandidates } from './subscription-canonicalization';

export type SyncCustomerSubscriptionInput = {
  userId: string;
  externalCustomerId: string;
  payments: Pick<PaymentGateway, 'listBlockingCustomerSubscriptions'>;
  subscriptions: SubscriptionRepository;
};

/**
 * BUG-321: Stripe refused a checkout because this customer already has a
 * subscription our database lacks. Records Stripe's canonical blocking
 * subscription through the same version fence and write guard as every other
 * writer, and only for the signed-in user's own customer. It reads Stripe and
 * changes nothing there.
 */
export async function syncCustomerSubscriptionFromProvider(
  input: SyncCustomerSubscriptionInput,
): Promise<SubscriptionUpsertResult> {
  const retrieve = async (): Promise<SubscriptionObservation> => {
    const listed = await input.payments.listBlockingCustomerSubscriptions({
      externalCustomerId: input.externalCustomerId,
    });
    if (
      listed.some(
        (subscription) =>
          subscription.userId !== input.userId ||
          subscription.externalCustomerId !== input.externalCustomerId,
      )
    ) {
      throw new ApplicationError(
        'CONFLICT',
        "A subscription on this customer is not the signed-in user's",
      );
    }
    const [canonical] = [...listed].sort((a, b) =>
      compareCanonicalSubscriptionCandidates(
        {
          subscriptionIdentity: a.externalSubscriptionId,
          status: a.status,
          currentPeriodEnd: a.currentPeriodEnd,
        },
        {
          subscriptionIdentity: b.externalSubscriptionId,
          status: b.status,
          currentPeriodEnd: b.currentPeriodEnd,
        },
      ),
    );
    if (!canonical) {
      throw new ApplicationError(
        'NOT_FOUND',
        'Stripe lists no blocking subscription for this customer',
      );
    }
    return canonical;
  };

  const { write } = await persistSubscriptionObservation({
    userId: input.userId,
    readVersion: (userId) =>
      input.subscriptions.findObservationVersionByUserId(userId),
    retrieve,
    getUserId: (subscription) => subscription.userId,
    persist: (subscription, expectedVersion) =>
      input.subscriptions.upsert({
        userId: subscription.userId,
        externalSubscriptionId: subscription.externalSubscriptionId,
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        startedAt: subscription.startedAt,
        billingCycleAnchor: subscription.billingCycleAnchor,
        expectedVersion,
      }),
  });
  return write;
}
