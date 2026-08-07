import { ApplicationError } from '@/src/application/errors';
import type {
  RenewalNoticeDeliveryRepository,
  TransactionalEmailGateway,
  TransactionalEmailSendResult,
} from '@/src/application/ports';
import {
  getRenewalNoticeProviderIdempotencyKey,
  getRenewalNoticeRetryAt,
  parseTransactionalEmailPayloadSnapshot,
} from '@/src/application/shared/transactional-email-payload';
import type { RenewalNoticeDelivery } from '@/src/domain/entities';

export type DispatchRenewalNoticeDeliveryResult =
  | {
      outcome: 'skipped_unconfigured';
      delivery: RenewalNoticeDelivery;
    }
  | { outcome: 'claim_lost'; delivery: null }
  | { outcome: 'attempted'; delivery: RenewalNoticeDelivery };

export class DispatchRenewalNoticeDeliveryUseCase {
  constructor(
    private readonly deliveryRepository: RenewalNoticeDeliveryRepository,
    private readonly emailGateway: TransactionalEmailGateway,
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
      throw new ApplicationError(
        'CONFLICT',
        'Renewal notice provider idempotency key does not match its delivery',
      );
    }
    const payload = parseTransactionalEmailPayloadSnapshot({
      snapshot: delivery.payloadSnapshot,
      hash: delivery.payloadHash,
      destination: delivery.destination,
    });

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
        status: 'outcome_unknown',
        failureCode: 'unexpected_gateway_exception',
      };
    }

    return {
      outcome: 'attempted',
      delivery: await this.persistOutcome(claimed, result, this.now()),
    };
  }

  private persistOutcome(
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

    if (result.status === 'delivered') {
      return this.deliveryRepository.markDelivered({
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
    return this.deliveryRepository.markOutcomeUnknown({
      ...failure,
      failureClass: 'provider_outcome_unknown',
    });
  }
}
