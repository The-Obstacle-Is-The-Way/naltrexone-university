import * as Sentry from '@sentry/nextjs';
import { toConsumerReference } from '@/src/adapters/shared/consumer-reference';
import { PRUNE_BATCH_LIMIT } from '@/src/adapters/shared/prune-constants';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import {
  projectSafeSpanAttributes,
  SERVER_SPAN_FAMILIES,
} from '@/src/adapters/shared/server-tracing';
import {
  isE2EOwnerMismatchEvent,
  isMissingStripeSubscriptionUserIdError,
} from '@/src/adapters/shared/stripe-subscription-errors';
import {
  ApplicationError,
  isApplicationError,
  isSubscriptionUserMissingError,
} from '@/src/application/errors';
import type { PaymentGateway } from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import type {
  RenewalConsentRecordRepository,
  RenewalNoticeDeliveryRepository,
  StripeCustomerRepository,
  StripeEventRepository,
  SubscriptionRepository,
  TrialPaymentMethodSetupOperation,
  TrialPaymentMethodSetupOperationRepository,
  UserRepository,
} from '@/src/application/ports/repositories';
import type { Sha256Hasher } from '@/src/application/ports/sha256-hasher';
import { persistSubscriptionObservation } from '@/src/application/shared/persist-subscription-observation';
import {
  type DispatchRenewalNoticeDeliveryUseCase,
  PruneRenewalConsentsUseCase,
  RecordRenewalConsentUseCase,
  SendRenewalAcknowledgmentUseCase,
} from '@/src/application/use-cases';
import type { RenewalConsentRecord } from '@/src/domain/entities';
import { DAY_MS } from '@/src/domain/services';

export type StripeWebhookInput = {
  rawBody: string;
  signature: string;
};

export type StripeWebhookTransaction = {
  stripeEvents: StripeEventRepository;
  subscriptions: SubscriptionRepository;
  stripeCustomers: StripeCustomerRepository;
  trialPaymentMethodSetupOperations: TrialPaymentMethodSetupOperationRepository;
  renewalConsentRecords: RenewalConsentRecordRepository;
  renewalNoticeDeliveries: RenewalNoticeDeliveryRepository;
  users: Pick<UserRepository, 'findById'>;
};

export type StripeWebhookDeps = {
  paymentGateway: PaymentGateway;
  subscriptionVersions: Pick<
    SubscriptionRepository,
    'findObservationVersionByUserId'
  >;
  transaction: <T>(
    fn: (tx: StripeWebhookTransaction) => Promise<T>,
  ) => Promise<T>;
  logger: Logger;
  now: () => Date;
  appUrl: string;
  sha256Hasher: Sha256Hasher;
  dispatchRenewalNoticeDelivery: Pick<
    DispatchRenewalNoticeDeliveryUseCase,
    'execute'
  >;
};

type StripeWebhookEvent = Awaited<
  ReturnType<PaymentGateway['processWebhookEvent']>
>;
type StripeSubscriptionUpdate = NonNullable<
  StripeWebhookEvent['subscriptionUpdate']
>;
type InitialSubscriptionConsent = NonNullable<
  StripeWebhookEvent['initialSubscriptionConsent']
>;
type TrialPaymentMethodSetupCompletion = NonNullable<
  StripeWebhookEvent['trialPaymentMethodSetupCompletion']
>;

class StripeWebhookAlreadyProcessed extends Error {}

// Provider-event lifecycle policies are intentionally distinct:
// - Processed Stripe events are webhook-pruned after 90 days.
// - Unresolved Stripe events are retained until successful replay or operator
//   resolution; age alone never makes them eligible for pruning.
// - Handled Clerk events are retained; automatic pruning remains parked behind
//   its production census/impact trigger.
// - The inline user.deleted path owns immediate customer cleanup, while the
//   daily drain owns retries and fallback.
const PROCESSED_STRIPE_EVENTS_RETENTION_MS = 90 * DAY_MS;
const TRIAL_PAYMENT_METHOD_SETUP_CLAIM_LEASE_MS = 5 * 60 * 1000;

async function queueRenewalAcknowledgment(input: {
  deps: StripeWebhookDeps;
  transaction: StripeWebhookTransaction;
  consent: RenewalConsentRecord;
}): Promise<string> {
  const userId = input.consent.userId;
  if (!userId) {
    throw new ApplicationError(
      'CONFLICT',
      'Initial renewal consent is missing its local user',
    );
  }
  const user = await input.transaction.users.findById(userId);
  if (!user) {
    throw new ApplicationError(
      'NOT_FOUND',
      'Renewal acknowledgment recipient not found',
    );
  }
  const delivery = await new SendRenewalAcknowledgmentUseCase(
    input.transaction.renewalNoticeDeliveries,
    input.deps.sha256Hasher,
    input.deps.appUrl,
  ).execute({ consent: input.consent, destination: user.email });
  return delivery.id;
}

async function dispatchRenewalAcknowledgment(
  deps: StripeWebhookDeps,
  eventId: string,
  deliveryId: string,
): Promise<void> {
  try {
    await deps.dispatchRenewalNoticeDelivery.execute({ deliveryId });
  } catch (error) {
    deps.logger.error(
      { eventId, error: projectSafeErrorDiagnostics(error) },
      'Renewal acknowledgment dispatch failed',
    );
  }
}

function setupSnapshotMatches(
  operation: TrialPaymentMethodSetupOperation,
  completion: TrialPaymentMethodSetupCompletion,
): boolean {
  return (
    operation.sessionId === completion.sessionId &&
    operation.userId === completion.userId &&
    operation.stripeCustomerId === completion.externalCustomerId &&
    operation.stripeSubscriptionId === completion.externalSubscriptionId &&
    operation.plan === completion.plan &&
    operation.amountCents === completion.amountCents &&
    operation.currency === completion.currency &&
    operation.frequency === completion.frequency &&
    operation.trialEndsAt.getTime() === completion.trialEndsAt.getTime() &&
    operation.disclosureVersion === completion.disclosureVersion &&
    operation.termsVersion === completion.termsVersion &&
    operation.termsHash === completion.termsHash
  );
}

async function processTrialPaymentMethodSetupWebhook(
  deps: StripeWebhookDeps,
  event: StripeWebhookEvent,
  completion: TrialPaymentMethodSetupCompletion,
): Promise<void> {
  const claimedAt = deps.now();
  const claimId = crypto.randomUUID();
  const claimed = await deps.transaction(
    async ({
      stripeEvents,
      subscriptions,
      stripeCustomers,
      trialPaymentMethodSetupOperations,
    }) => {
      await stripeEvents.claim(event.eventId, event.type);
      const eventState = await stripeEvents.lock(event.eventId);
      if (isSuccessfullyProcessed(eventState)) return null;

      const operation = await trialPaymentMethodSetupOperations.findBySessionId(
        completion.sessionId,
      );
      if (!operation) {
        throw new ApplicationError(
          'CONFLICT',
          'Trial payment-method setup operation is missing',
        );
      }
      if (!setupSnapshotMatches(operation, completion)) {
        throw new ApplicationError(
          'CONFLICT',
          'Trial payment-method completion does not match its pending consent snapshot',
        );
      }
      if (operation.status === 'completed') {
        if (
          operation.stripePaymentMethodId !== completion.stripePaymentMethodId
        ) {
          throw new ApplicationError(
            'CONFLICT',
            'Completed trial payment-method setup changed payment method',
          );
        }
        await stripeEvents.markProcessed(event.eventId);
        return null;
      }

      const [subscription, externalSubscriptionId, customer] =
        await Promise.all([
          subscriptions.findByUserId(completion.userId),
          subscriptions.findExternalSubscriptionIdByUserId(completion.userId),
          stripeCustomers.findByUserId(completion.userId),
        ]);
      if (
        subscription?.status !== 'inTrial' ||
        subscription.plan !== completion.plan ||
        subscription.currentPeriodEnd.getTime() !==
          completion.trialEndsAt.getTime() ||
        externalSubscriptionId !== completion.externalSubscriptionId ||
        customer?.stripeCustomerId !== completion.externalCustomerId
      ) {
        throw new ApplicationError(
          'CONFLICT',
          'Trial payment-method completion does not match current local billing ownership',
        );
      }

      const result = await trialPaymentMethodSetupOperations.claim({
        sessionId: completion.sessionId,
        claimId,
        claimedAt,
        staleBefore: new Date(
          claimedAt.getTime() - TRIAL_PAYMENT_METHOD_SETUP_CLAIM_LEASE_MS,
        ),
      });
      if (!result) {
        throw new ApplicationError(
          'CONFLICT',
          'Trial payment-method setup is already being processed',
        );
      }
      return result;
    },
  );

  if (!claimed) return;

  if (!claimed.paymentMethodAttachedAt) {
    await deps.paymentGateway.attachTrialPaymentMethod({
      sessionId: completion.sessionId,
      externalPaymentMethodId: completion.stripePaymentMethodId,
      externalCustomerId: completion.externalCustomerId,
    });
    await deps.transaction(async ({ trialPaymentMethodSetupOperations }) => {
      await trialPaymentMethodSetupOperations.markPaymentMethodAttached({
        sessionId: completion.sessionId,
        claimId,
        stripePaymentMethodId: completion.stripePaymentMethodId,
        attachedAt: deps.now(),
      });
    });
  } else if (
    claimed.stripePaymentMethodId !== completion.stripePaymentMethodId
  ) {
    throw new ApplicationError(
      'CONFLICT',
      'Recovered trial payment-method setup changed payment method',
    );
  }

  if (!claimed.subscriptionDefaultSetAt) {
    await deps.paymentGateway.setTrialSubscriptionDefaultPaymentMethod({
      sessionId: completion.sessionId,
      externalPaymentMethodId: completion.stripePaymentMethodId,
      externalSubscriptionId: completion.externalSubscriptionId,
    });
    await deps.transaction(async ({ trialPaymentMethodSetupOperations }) => {
      await trialPaymentMethodSetupOperations.markSubscriptionDefaultSet({
        sessionId: completion.sessionId,
        claimId,
        selectedAt: deps.now(),
      });
    });
  }

  const acknowledgmentDeliveryId = await deps.transaction(
    async (transaction) => {
      const {
        stripeEvents,
        trialPaymentMethodSetupOperations,
        renewalConsentRecords,
      } = transaction;
      const consent = await new RecordRenewalConsentUseCase(
        renewalConsentRecords,
      ).execute({
        userId: claimed.userId,
        consumerReference: toConsumerReference(claimed.stripeCustomerId),
        externalCustomerId: claimed.stripeCustomerId,
        externalSubscriptionId: claimed.stripeSubscriptionId,
        checkoutSessionId: null,
        setupSessionId: claimed.sessionId,
        applicationSourceId: null,
        plan: claimed.plan,
        amountCents: claimed.amountCents,
        currency: claimed.currency,
        frequency: claimed.frequency,
        trialEndsAt: claimed.trialEndsAt,
        cancellationDeadline: claimed.trialEndsAt,
        cancellationMethod: claimed.cancellationMethod,
        disclosureSnapshot: claimed.disclosureSnapshot,
        disclosureVersion: claimed.disclosureVersion,
        termsVersion: claimed.termsVersion,
        termsHash: claimed.termsHash,
        consentSource: 'stripe_setup',
        acceptedAt: completion.acceptedAt,
        consentKind: 'initial_offer',
        priorAmountCents: null,
        proposedAmountCents: null,
        effectiveRenewalAt: null,
      });
      const deliveryId = await queueRenewalAcknowledgment({
        deps,
        transaction,
        consent,
      });
      await trialPaymentMethodSetupOperations.markCompleted({
        sessionId: completion.sessionId,
        claimId,
        completedAt: deps.now(),
      });
      await stripeEvents.markProcessed(event.eventId);
      return deliveryId;
    },
  );
  await dispatchRenewalAcknowledgment(
    deps,
    event.eventId,
    acknowledgmentDeliveryId,
  );
}

function isSuccessfullyProcessed(event: {
  processedAt: Date | null;
  error: string | null;
}): boolean {
  return event.processedAt !== null && event.error === null;
}

async function persistFailure(
  deps: StripeWebhookDeps,
  event: StripeWebhookEvent,
  error: unknown,
): Promise<void> {
  const errorData = JSON.stringify(projectSafeErrorDiagnostics(error));

  try {
    await deps.transaction(async ({ stripeEvents }) => {
      await stripeEvents.claim(event.eventId, event.type);
      const current = await stripeEvents.lock(event.eventId);

      if (isSuccessfullyProcessed(current)) {
        return;
      }

      await stripeEvents.markFailed(event.eventId, errorData);
    });
  } catch (persistError) {
    deps.logger.error(
      {
        eventId: event.eventId,
        error: projectSafeErrorDiagnostics(persistError),
      },
      'Failed to persist Stripe webhook failure state',
    );
  }
}

async function persistAcknowledgedOutcome(
  deps: StripeWebhookDeps,
  event: StripeWebhookEvent,
  subscriptionUpdate?: StripeSubscriptionUpdate,
): Promise<void> {
  await deps.transaction(async ({ stripeEvents, renewalConsentRecords }) => {
    await stripeEvents.claim(event.eventId, event.type);
    const current = await stripeEvents.lock(event.eventId);

    if (isSuccessfullyProcessed(current)) {
      return;
    }

    if (subscriptionUpdate?.status === 'canceled') {
      await renewalConsentRecords.markSubscriptionTerminated({
        externalSubscriptionId: subscriptionUpdate.externalSubscriptionId,
        terminatedAt: event.occurredAt ?? deps.now(),
      });
    }
    await stripeEvents.markProcessed(event.eventId);
  });
}

async function persistInitialSubscriptionConsent(input: {
  repository: RenewalConsentRecordRepository;
  consent: InitialSubscriptionConsent;
  subscriptionUpdate: StripeSubscriptionUpdate;
}): Promise<RenewalConsentRecord> {
  const { consent, subscriptionUpdate } = input;
  if (
    consent.userId !== subscriptionUpdate.userId ||
    consent.externalCustomerId !== subscriptionUpdate.externalCustomerId ||
    consent.externalSubscriptionId !==
      subscriptionUpdate.externalSubscriptionId ||
    consent.plan !== subscriptionUpdate.plan
  ) {
    throw new ApplicationError(
      'CONFLICT',
      'Subscription Checkout consent changed during persistence',
    );
  }

  return new RecordRenewalConsentUseCase(input.repository).execute({
    userId: consent.userId,
    consumerReference: toConsumerReference(consent.externalCustomerId),
    externalCustomerId: consent.externalCustomerId,
    externalSubscriptionId: consent.externalSubscriptionId,
    checkoutSessionId: consent.checkoutSessionId,
    setupSessionId: null,
    applicationSourceId: null,
    plan: consent.plan,
    amountCents: consent.amountCents,
    currency: consent.currency,
    frequency: consent.frequency,
    trialEndsAt:
      subscriptionUpdate.status === 'inTrial'
        ? subscriptionUpdate.currentPeriodEnd
        : null,
    cancellationDeadline: subscriptionUpdate.currentPeriodEnd,
    cancellationMethod: consent.cancellationMethod,
    disclosureSnapshot: consent.disclosureSnapshot,
    disclosureVersion: consent.disclosureVersion,
    termsVersion: consent.termsVersion,
    termsHash: consent.termsHash,
    consentSource: 'stripe_checkout',
    acceptedAt: consent.acceptedAt,
    consentKind: 'initial_offer',
    priorAmountCents: null,
    proposedAmountCents: null,
    effectiveRenewalAt: null,
  });
}

async function processSubscriptionWebhook(
  deps: StripeWebhookDeps,
  input: StripeWebhookInput,
  event: StripeWebhookEvent,
  subscriptionUpdate: StripeSubscriptionUpdate,
): Promise<void> {
  let processingError: unknown;
  let hasProcessingError = false;
  let acknowledgmentDeliveryId: string | null = null;
  const discoveredUserId = subscriptionUpdate.userId;
  const initialConsent = event.initialSubscriptionConsent;
  const retrieveSubscriptionUpdate =
    async (): Promise<StripeSubscriptionUpdate> => {
      const refreshedEvent = await deps.paymentGateway.processWebhookEvent(
        input.rawBody,
        input.signature,
      );
      if (
        refreshedEvent.eventId !== event.eventId ||
        refreshedEvent.type !== event.type ||
        !refreshedEvent.subscriptionUpdate
      ) {
        throw new ApplicationError(
          'CONFLICT',
          'Stripe webhook changed during subscription refresh',
        );
      }
      return refreshedEvent.subscriptionUpdate;
    };

  try {
    await persistSubscriptionObservation({
      userId: discoveredUserId,
      readVersion: (userId) =>
        deps.subscriptionVersions.findObservationVersionByUserId(userId),
      retrieve: retrieveSubscriptionUpdate,
      getUserId: (nextSubscriptionUpdate) => nextSubscriptionUpdate.userId,
      persist: (nextSubscriptionUpdate, expectedVersion) =>
        deps.transaction(async (transaction) => {
          const {
            stripeEvents,
            subscriptions,
            stripeCustomers,
            renewalConsentRecords,
          } = transaction;
          const claimed = await stripeEvents.claim(event.eventId, event.type);
          if (!claimed) {
            const snapshot = await stripeEvents.peek(event.eventId);
            if (snapshot && isSuccessfullyProcessed(snapshot)) {
              throw new StripeWebhookAlreadyProcessed();
            }
          }

          const current = await stripeEvents.lock(event.eventId);
          if (isSuccessfullyProcessed(current)) {
            throw new StripeWebhookAlreadyProcessed();
          }

          try {
            // Stripe webhook, checkout-success, and reconcile use advisory(user)
            // -> stripe_subscriptions -> stripe_customers. User deletion is the
            // fourth writer and takes the same advisory before its inverse cascade.
            const write = await subscriptions.upsert({
              userId: nextSubscriptionUpdate.userId,
              externalSubscriptionId:
                nextSubscriptionUpdate.externalSubscriptionId,
              plan: nextSubscriptionUpdate.plan,
              status: nextSubscriptionUpdate.status,
              currentPeriodEnd: nextSubscriptionUpdate.currentPeriodEnd,
              cancelAtPeriodEnd: nextSubscriptionUpdate.cancelAtPeriodEnd,
              expectedVersion,
            });
            if (!write.persisted && write.reason === 'version_conflict') {
              return write;
            }

            if (write.persisted) {
              await stripeCustomers.insert(
                nextSubscriptionUpdate.userId,
                nextSubscriptionUpdate.externalCustomerId,
                { conflictStrategy: 'authoritative' },
              );
            }

            if (write.persisted && initialConsent) {
              const consent = await persistInitialSubscriptionConsent({
                repository: renewalConsentRecords,
                consent: initialConsent,
                subscriptionUpdate: nextSubscriptionUpdate,
              });
              acknowledgmentDeliveryId = await queueRenewalAcknowledgment({
                deps,
                transaction,
                consent,
              });
            }

            if (
              write.persisted &&
              nextSubscriptionUpdate.status === 'canceled'
            ) {
              await renewalConsentRecords.markSubscriptionTerminated({
                externalSubscriptionId:
                  nextSubscriptionUpdate.externalSubscriptionId,
                terminatedAt: event.occurredAt ?? deps.now(),
              });
            }

            await stripeEvents.markProcessed(event.eventId);
            return write;
          } catch (error) {
            if (error instanceof StripeWebhookAlreadyProcessed) {
              throw error;
            }
            processingError = error;
            hasProcessingError = true;
            throw error;
          }
        }),
    });
  } catch (transactionError) {
    if (transactionError instanceof StripeWebhookAlreadyProcessed) {
      // Another delivery committed this event first.
      return;
    }

    if (isSubscriptionUserMissingError(transactionError)) {
      await persistAcknowledgedOutcome(deps, event, subscriptionUpdate);
      deps.logger.warn(
        {
          reason: 'user_missing',
          eventId: event.eventId,
          eventType: event.type,
          stripeCustomerId: subscriptionUpdate.externalCustomerId,
          userId: transactionError.userId,
        },
        'Acknowledging Stripe subscription webhook for missing local user',
      );
      return;
    }

    throw hasProcessingError ? processingError : transactionError;
  }

  if (acknowledgmentDeliveryId) {
    await dispatchRenewalAcknowledgment(
      deps,
      event.eventId,
      acknowledgmentDeliveryId,
    );
  }
}

async function processStripeWebhookWithinSpan(
  deps: StripeWebhookDeps,
  input: StripeWebhookInput,
): Promise<void> {
  let event: StripeWebhookEvent;
  try {
    event = await deps.paymentGateway.processWebhookEvent(
      input.rawBody,
      input.signature,
    );
  } catch (error) {
    if (isMissingStripeSubscriptionUserIdError(error)) {
      deps.logger.warn(
        {
          reason: 'metadata_missing',
          code: error.code,
          fieldErrors: error.fieldErrors,
        },
        'Skipping Stripe subscription webhook with missing metadata.user_id',
      );
      return;
    }

    if (isE2EOwnerMismatchEvent(error)) {
      deps.logger.warn(
        {
          reason: 'e2e_owner_mismatch',
          code: error.code,
          fieldErrors: error.fieldErrors,
        },
        'Skipping Stripe subscription webhook from a different E2E owner',
      );
      return;
    }

    throw error;
  }

  let processingError: unknown;
  let hasProcessingError = false;

  try {
    if (event.trialPaymentMethodSetupCompletion) {
      await processTrialPaymentMethodSetupWebhook(
        deps,
        event,
        event.trialPaymentMethodSetupCompletion,
      );
    } else if (event.subscriptionUpdate) {
      await processSubscriptionWebhook(
        deps,
        input,
        event,
        event.subscriptionUpdate,
      );
    } else {
      await deps.transaction(async ({ stripeEvents }) => {
        const claimed = await stripeEvents.claim(event.eventId, event.type);
        if (!claimed) {
          const snapshot = await stripeEvents.peek(event.eventId);
          if (snapshot && isSuccessfullyProcessed(snapshot)) {
            return;
          }
        }

        const current = await stripeEvents.lock(event.eventId);
        if (isSuccessfullyProcessed(current)) {
          return;
        }

        try {
          await stripeEvents.markProcessed(event.eventId);
        } catch (error) {
          processingError = error;
          hasProcessingError = true;
          throw error;
        }
      });
    }
  } catch (transactionError) {
    const originalError = hasProcessingError
      ? processingError
      : transactionError;
    await persistFailure(deps, event, originalError);
    throw originalError;
  }

  // Best-effort cleanup: prune old stripe events.
  // Idempotency keys and rate limits are pruned in their own hot paths
  // (withIdempotency and DrizzleRateLimiter.limit respectively).
  const cutoff = new Date(
    deps.now().getTime() - PROCESSED_STRIPE_EVENTS_RETENTION_MS,
  );

  try {
    await deps.transaction(async ({ stripeEvents }) => {
      await stripeEvents.pruneProcessedBefore(cutoff, PRUNE_BATCH_LIMIT);
    });
  } catch (error) {
    deps.logger.warn(
      {
        eventId: event.eventId,
        error: projectSafeErrorDiagnostics(error),
      },
      'Stripe event pruning failed',
    );
  }

  try {
    await deps.transaction(async ({ renewalConsentRecords }) => {
      await new PruneRenewalConsentsUseCase(
        renewalConsentRecords,
        deps.now,
      ).execute();
    });
  } catch (error) {
    deps.logger.warn(
      {
        eventId: event.eventId,
        error: projectSafeErrorDiagnostics(error),
      },
      'Renewal consent pruning failed',
    );
  }
}

export async function processStripeWebhook(
  deps: StripeWebhookDeps,
  input: StripeWebhookInput,
): Promise<void> {
  const family = SERVER_SPAN_FAMILIES.stripe.parent;
  return Sentry.startSpan(
    {
      name: family.name,
      op: family.op,
      attributes: projectSafeSpanAttributes({
        'app.route': family.route,
      }),
    },
    async (span) => {
      try {
        await processStripeWebhookWithinSpan(deps, input);
      } catch (error) {
        if (isApplicationError(error)) {
          span.setAttributes(
            projectSafeSpanAttributes({
              'app.error_code': error.code,
            }),
          );
        }
        throw error;
      }
    },
  );
}
