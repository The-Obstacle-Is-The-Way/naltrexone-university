import type {
  NewRenewalNoticeDelivery,
  RenewalNoticeDelivery,
} from '@/src/domain/entities';

export type ClaimRenewalNoticeDeliveryInput = {
  id: string;
  attemptId: string;
  startedAt: Date;
};

export type MarkRenewalNoticeDeliveryFailureInput = {
  id: string;
  attemptId: string;
  failureClass: string;
  failureCode: string;
  failedAt: Date;
};

export interface RenewalNoticeDeliveryRepository {
  saveQueued(input: NewRenewalNoticeDelivery): Promise<RenewalNoticeDelivery>;
  findById(id: string): Promise<RenewalNoticeDelivery | null>;
  findDue(input: {
    now: Date;
    limit: number;
  }): Promise<RenewalNoticeDelivery[]>;
  claim(
    input: ClaimRenewalNoticeDeliveryInput,
  ): Promise<RenewalNoticeDelivery | null>;
  markDelivered(input: {
    id: string;
    attemptId: string;
    providerEventId: string;
    completedAt: Date;
  }): Promise<RenewalNoticeDelivery>;
  markTransientFailure(
    input: MarkRenewalNoticeDeliveryFailureInput & { nextAttemptAt: Date },
  ): Promise<RenewalNoticeDelivery>;
  markTerminalFailure(
    input: MarkRenewalNoticeDeliveryFailureInput,
  ): Promise<RenewalNoticeDelivery>;
  markOutcomeUnknown(
    input: MarkRenewalNoticeDeliveryFailureInput,
  ): Promise<RenewalNoticeDelivery>;
  markStaleProcessingUnknown(input: {
    staleBefore: Date;
    observedAt: Date;
    limit: number;
  }): Promise<number>;
  requeue(input: {
    id: string;
    reason: string;
    requeuedBy: string;
    requeuedAt: Date;
    confirmedNoSend: boolean;
  }): Promise<RenewalNoticeDelivery>;
}
