export type RenewalNoticeKind =
  | 'acknowledgment'
  | 'annual_reminder'
  | 'renewal_notice'
  | 'material_change'
  | 'fee_change';

export type RenewalNoticeDeliveryStatus =
  | 'queued'
  | 'processing'
  | 'delivered'
  | 'transient_failure'
  | 'terminal_failure'
  | 'outcome_unknown';

export type RenewalNoticeRequeueAuditEntry = {
  reason: string;
  requeuedAt: string;
  requeuedBy: string;
  confirmedNoSend: boolean;
  priorStatus: 'terminal_failure' | 'outcome_unknown';
};

export type NewRenewalNoticeDelivery = {
  id: string;
  noticeKind: RenewalNoticeKind;
  consentRecordId: string | null;
  externalSubscriptionId: string | null;
  applicableAt: Date | null;
  disclosureVersion: string;
  destination: string;
  providerIdempotencyKey: string;
  payloadSnapshot: string;
  payloadHash: string;
};

export type RenewalNoticeDelivery = NewRenewalNoticeDelivery & {
  status: RenewalNoticeDeliveryStatus;
  providerEventId: string | null;
  attemptCount: number;
  attemptId: string | null;
  attemptStartedAt: Date | null;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  failureClass: string | null;
  failureCode: string | null;
  requeueReason: string | null;
  requeuedAt: Date | null;
  requeuedBy: string | null;
  requeueAudit: RenewalNoticeRequeueAuditEntry[];
  createdAt: Date;
  updatedAt: Date;
};

export function isValidRenewalNoticeDeliveryKeyShape(
  delivery: NewRenewalNoticeDelivery,
): boolean {
  return delivery.noticeKind === 'acknowledgment'
    ? delivery.consentRecordId !== null &&
        delivery.externalSubscriptionId === null &&
        delivery.applicableAt === null
    : delivery.consentRecordId === null &&
        delivery.externalSubscriptionId !== null &&
        delivery.applicableAt !== null;
}
