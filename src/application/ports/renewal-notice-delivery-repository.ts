import type {
  NewRenewalNoticeDelivery,
  RenewalNoticeDelivery,
} from '@/src/domain/entities';

export type ClaimRenewalNoticeDeliveryInput = {
  id: string;
  attemptId: string;
  startedAt: Date;
};

export type RenewalNoticeFailureClass =
  | 'payload_integrity_failure'
  | 'provider_non_acceptance'
  | 'provider_terminal_failure'
  | 'provider_outcome_unknown'
  | 'stale_processing_claim'
  | 'notice_superseded'
  | 'notice_deadline_passed'
  | RenewalNoticeProviderFailureClass;

// DEBT-414 F07: what the email provider later reports about a message it
// accepted. A bounce, a send failure or a suppressed address means the notice
// did not reach its reader.
export type RenewalNoticeProviderFailureClass =
  | 'provider_bounced'
  | 'provider_send_failed'
  | 'provider_suppressed';

export type RenewalNoticeProviderOutcome =
  | { kind: 'delivered' }
  | {
      kind: 'failed';
      failureClass: RenewalNoticeProviderFailureClass;
      failureCode: string;
    };

// 'unknown': no notice has that provider id, so the email was not a notice.
export type RecordRenewalNoticeProviderOutcomeResult =
  | 'recorded'
  | 'unchanged'
  | 'unknown';

export type MarkRenewalNoticeDeliveryFailureInput = {
  id: string;
  attemptId: string;
  failureClass: RenewalNoticeFailureClass;
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
  markAccepted(input: {
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
  /**
   * Records the provider's later report on an accepted notice, found by the
   * id the provider returned on acceptance. Delivery moves `accepted` to
   * `delivered`. A failure moves `accepted` or `delivered` to
   * `terminal_failure`, because a late bounce means the notice did not arrive.
   * Anything else, including a delivery report after a failure, is unchanged,
   * so redelivered or reordered reports are harmless.
   */
  recordProviderOutcome(input: {
    providerEventId: string;
    outcome: RenewalNoticeProviderOutcome;
    observedAt: Date;
  }): Promise<RecordRenewalNoticeProviderOutcomeResult>;
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
