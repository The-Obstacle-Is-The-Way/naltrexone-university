import { ApplicationError } from '@/src/application/errors';
import type {
  RenewalNoticeDeliveryRepository,
  Sha256Hasher,
  TransactionalEmailGateway,
  TransactionalEmailPayload,
  TransactionalEmailSendResult,
} from '@/src/application/ports';
import type { Logger } from '@/src/application/ports/logger';
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
    private readonly hasher: Sha256Hasher,
    private readonly logger: Pick<Logger, 'error'>,
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
      return this.quarantineIntegrityFailure(
        delivery,
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
      return this.quarantineIntegrityFailure(
        delivery,
        'payload_snapshot_integrity_failure',
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
        status: 'outcome_unknown',
        failureCode: 'unexpected_gateway_exception',
      };
    }

    return {
      outcome: 'attempted',
      delivery: await this.persistOutcome(claimed, result, this.now()),
    };
  }

  private async quarantineIntegrityFailure(
    delivery: RenewalNoticeDelivery,
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
        failureClass: 'payload_integrity_failure',
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
      // Alerting failure must not undo the durable at-most-once quarantine.
    }
    return delivery;
  }
}
