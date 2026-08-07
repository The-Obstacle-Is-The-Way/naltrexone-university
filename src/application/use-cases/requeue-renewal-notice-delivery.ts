import { ApplicationError } from '@/src/application/errors';
import type { RenewalNoticeDeliveryRepository } from '@/src/application/ports/repositories';
import type { RenewalNoticeDelivery } from '@/src/domain/entities';

export type RequeueRenewalNoticeDeliveryInput = {
  deliveryId: string;
  reason: string;
  operator: string;
  confirmedNoSend: boolean;
};

export class RequeueRenewalNoticeDeliveryUseCase {
  constructor(
    private readonly repository: RenewalNoticeDeliveryRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    input: RequeueRenewalNoticeDeliveryInput,
  ): Promise<RenewalNoticeDelivery> {
    if (
      input.reason.trim().length === 0 ||
      input.operator.trim().length === 0
    ) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Renewal notice requeue requires an operator and an audit reason',
      );
    }

    return this.repository.requeue({
      id: input.deliveryId,
      reason: input.reason.trim(),
      requeuedBy: input.operator.trim(),
      requeuedAt: this.now(),
      confirmedNoSend: input.confirmedNoSend,
    });
  }
}
