import { ApplicationError } from '@/src/application/errors';
import type {
  RenewalNoticeDeliveryRepository,
  Sha256Hasher,
  SubscriptionRepository,
  TransactionalEmailGateway,
  TransactionalEmailPayload,
  TransactionalEmailSendResult,
} from '@/src/application/ports';
import type { Logger } from '@/src/application/ports/logger';
import type { OperationalAlerts } from '@/src/application/ports/operational-alerts';
import type { RenewalNoticeFailureClass } from '@/src/application/ports/renewal-notice-delivery-repository';
import type { UserRepository } from '@/src/application/ports/user-repository';
import { renewalNoticeSendByCutoff } from '@/src/application/shared/renewal-notice-schedule';
import {
  getRenewalNoticeProviderIdempotencyKey,
  getRenewalNoticeRetryAt,
  parseTransactionalEmailPayloadSnapshot,
} from '@/src/application/shared/transactional-email-payload';
import type { RenewalNoticeDelivery } from '@/src/domain/entities';
import { nextAnniversaryRenewalAt } from '@/src/domain/services';

export type DispatchRenewalNoticeDeliveryResult =
  | {
      outcome: 'skipped_unconfigured';
      delivery: RenewalNoticeDelivery;
    }
  | { outcome: 'claim_lost'; delivery: null }
  | { outcome: 'attempted'; delivery: RenewalNoticeDelivery };

// The current facts a scheduled notice restates: its subscription and the
// account address it is sent to.
export type RenewalNoticeTargets = {
  subscriptions: Pick<SubscriptionRepository, 'findByExternalSubscriptionId'>;
  users: Pick<UserRepository, 'findById'>;
};

export class DispatchRenewalNoticeDeliveryUseCase {
  constructor(
    private readonly deliveryRepository: RenewalNoticeDeliveryRepository,
    private readonly emailGateway: TransactionalEmailGateway,
    private readonly noticeTargets: RenewalNoticeTargets,
    private readonly hasher: Sha256Hasher,
    private readonly logger: Pick<Logger, 'error'>,
    private readonly alerts: OperationalAlerts,
    private readonly now: () => Date = () => new Date(),
    private readonly createAttemptId: () => string = () => crypto.randomUUID(),
  ) {}

  async execute(input: {
    deliveryId: string;
  }): Promise<DispatchRenewalNoticeDeliveryResult> {
    const delivery = await this.deliveryRepository.findById(input.deliveryId);
    if (!delivery) {
      throw new ApplicationError(
        'NOT_FOUND',
        'Renewal notice delivery not found',
      );
    }

    const expectedProviderKey = getRenewalNoticeProviderIdempotencyKey(
      delivery.id,
    );
    if (delivery.providerIdempotencyKey !== expectedProviderKey) {
      return this.terminate(
        delivery,
        'payload_integrity_failure',
        'provider_idempotency_key_mismatch',
      );
    }
    let payload: TransactionalEmailPayload;
    try {
      payload = parseTransactionalEmailPayloadSnapshot(
        {
          snapshot: delivery.payloadSnapshot,
          hash: delivery.payloadHash,
          destination: delivery.destination,
        },
        this.hasher,
      );
    } catch (error) {
      if (!(error instanceof ApplicationError)) throw error;
      return this.terminate(
        delivery,
        'payload_integrity_failure',
        'payload_snapshot_integrity_failure',
      );
    }

    // A refusal is a fact about the notice, not the provider: a superseded or
    // late notice is never sendable, so it is recorded (and a missed cutoff
    // alerts) whether or not the provider is configured.
    const refusal = await this.refusalBeforeSend(delivery);
    if (refusal) {
      return this.terminate(
        delivery,
        refusal.failureClass,
        refusal.failureCode,
      );
    }

    if (!this.emailGateway.isConfigured()) {
      return { outcome: 'skipped_unconfigured', delivery };
    }

    const startedAt = this.now();
    const attemptId = this.createAttemptId();
    const claimed = await this.deliveryRepository.claim({
      id: delivery.id,
      attemptId,
      startedAt,
    });
    if (!claimed) return { outcome: 'claim_lost', delivery: null };

    let result: TransactionalEmailSendResult;
    try {
      result = await this.emailGateway.send({
        idempotencyKey: expectedProviderKey,
        payload,
      });
    } catch {
      result = {
        // Stryker disable next-line StringLiteral: persistOutcome treats every status but accepted, transient and terminal as unknown
        status: 'outcome_unknown',
        failureCode: 'unexpected_gateway_exception',
      };
    }

    return {
      outcome: 'attempted',
      delivery: await this.persistOutcome(claimed, result, this.now()),
    };
  }

  // DEBT-414 F07: the queued payload is immutable, but the facts it states can
  // change before it is sent. An acknowledgment records consent already given
  // and is always sent; a scheduled notice is revalidated first.
  private async refusalBeforeSend(delivery: RenewalNoticeDelivery): Promise<{
    failureClass: RenewalNoticeFailureClass;
    failureCode: string;
  } | null> {
    if (delivery.externalSubscriptionId === null) return null;
    const applicableAt = requireApplicableAt(delivery);
    const supersededBy = await this.supersededReason(
      delivery,
      delivery.externalSubscriptionId,
      applicableAt,
    );
    if (supersededBy) {
      return { failureClass: 'notice_superseded', failureCode: supersededBy };
    }
    if (
      isRenewalReminder(delivery) &&
      this.now() > renewalNoticeSendByCutoff(applicableAt)
    ) {
      try {
        this.logger.error(
          { deliveryId: delivery.id, noticeKind: delivery.noticeKind },
          'Renewal notice send-by cutoff passed',
        );
      } catch {
        // Logging failure must not undo the refusal.
      }
      // DEBT-505: a missed legal deadline needs a person; the log alone
      // reaches nobody. The port never rejects.
      await this.alerts.raise({
        kind: 'renewal_notice_send_by_cutoff_passed',
        count: 1,
      });
      return {
        failureClass: 'notice_deadline_passed',
        failureCode: 'send_by_cutoff_passed',
      };
    }
    return null;
  }

  private async supersededReason(
    delivery: RenewalNoticeDelivery,
    externalSubscriptionId: string,
    applicableAt: Date,
  ): Promise<string | null> {
    const subscription =
      await this.noticeTargets.subscriptions.findByExternalSubscriptionId(
        externalSubscriptionId,
      );
    if (!subscription) return 'subscription_missing';
    if (subscription.status !== 'active') return 'subscription_not_active';
    const account = await this.noticeTargets.users.findById(
      subscription.userId,
    );
    if (account?.email !== delivery.destination) return 'destination_changed';
    if (isAnnualRenewalReminder(delivery)) {
      // The annual kinds state the annual amount and yearly frequency.
      if (subscription.plan !== 'annual') return 'subscription_plan_changed';
      if (subscription.cancelAtPeriodEnd) return 'subscription_canceling';
      if (subscription.currentPeriodEnd.getTime() !== applicableAt.getTime()) {
        return 'renewal_date_changed';
      }
    }
    if (delivery.noticeKind === 'anniversary_reminder') {
      // DEBT-414 F02: the monthly amount, and the renewal recomputed from the
      // current service start and billing anchor.
      if (subscription.plan !== 'monthly') return 'subscription_plan_changed';
      if (subscription.cancelAtPeriodEnd) return 'subscription_canceling';
      if (
        subscription.startedAt === null ||
        subscription.billingCycleAnchor === null
      ) {
        return 'anniversary_unknown';
      }
      const renewal = nextAnniversaryRenewalAt({
        startedAt: subscription.startedAt,
        billingCycleAnchor: subscription.billingCycleAnchor,
        notBefore: this.now(),
      });
      if (renewal.getTime() !== applicableAt.getTime()) {
        return 'renewal_date_changed';
      }
    }
    return null;
  }

  private async terminate(
    delivery: RenewalNoticeDelivery,
    failureClass: RenewalNoticeFailureClass,
    failureCode: string,
  ): Promise<DispatchRenewalNoticeDeliveryResult> {
    const startedAt = this.now();
    const attemptId = this.createAttemptId();
    const claimed = await this.deliveryRepository.claim({
      id: delivery.id,
      attemptId,
      startedAt,
    });
    if (!claimed) return { outcome: 'claim_lost', delivery: null };

    return {
      outcome: 'attempted',
      delivery: await this.deliveryRepository.markTerminalFailure({
        id: claimed.id,
        attemptId,
        failureClass,
        failureCode,
        failedAt: this.now(),
      }),
    };
  }

  private async persistOutcome(
    claimed: RenewalNoticeDelivery,
    result: TransactionalEmailSendResult,
    completedAt: Date,
  ): Promise<RenewalNoticeDelivery> {
    const attemptId = claimed.attemptId;
    if (!attemptId) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Claimed renewal notice delivery is missing its attempt ID',
      );
    }

    if (result.status === 'accepted') {
      return this.deliveryRepository.markAccepted({
        id: claimed.id,
        attemptId,
        providerEventId: result.providerEventId,
        completedAt,
      });
    }

    const failure = {
      id: claimed.id,
      attemptId,
      failureCode: result.failureCode,
      failedAt: completedAt,
    };
    if (result.status === 'transient_failure') {
      return this.deliveryRepository.markTransientFailure({
        ...failure,
        failureClass: 'provider_non_acceptance',
        nextAttemptAt: getRenewalNoticeRetryAt(
          completedAt,
          claimed.attemptCount,
        ),
      });
    }
    if (result.status === 'terminal_failure') {
      return this.deliveryRepository.markTerminalFailure({
        ...failure,
        failureClass: 'provider_terminal_failure',
      });
    }
    const delivery = await this.deliveryRepository.markOutcomeUnknown({
      ...failure,
      failureClass: 'provider_outcome_unknown',
    });
    try {
      this.logger.error(
        { deliveryId: claimed.id, failureCode: result.failureCode },
        'Renewal notice delivery outcome is unknown',
      );
    } catch {
      // Logging failure must not undo the durable at-most-once quarantine.
    }
    await this.alerts.raise({
      kind: 'renewal_notice_outcome_unknown',
      count: 1,
    });
    return delivery;
  }
}

// The key shape (renewal_notice_deliveries_key_shape_chk) gives every
// scheduled notice an applicable date; a row without one is corrupt.
function requireApplicableAt(delivery: RenewalNoticeDelivery): Date {
  if (delivery.applicableAt === null) {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      'Scheduled renewal notice has no applicable date',
    );
  }
  return delivery.applicableAt;
}

function isAnnualRenewalReminder(delivery: RenewalNoticeDelivery): boolean {
  return (
    delivery.noticeKind === 'annual_reminder' ||
    delivery.noticeKind === 'renewal_notice'
  );
}

// Every scheduled reminder of a renewal has the same send-by cutoff.
function isRenewalReminder(delivery: RenewalNoticeDelivery): boolean {
  return (
    isAnnualRenewalReminder(delivery) ||
    delivery.noticeKind === 'anniversary_reminder'
  );
}
