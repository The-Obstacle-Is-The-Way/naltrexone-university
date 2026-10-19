import type { Logger } from '@/src/application/ports/logger';
import type { OperationalAlerts } from '@/src/application/ports/operational-alerts';
import type {
  RecordRenewalNoticeProviderOutcomeResult,
  RenewalNoticeDeliveryRepository,
  RenewalNoticeProviderOutcome,
} from '@/src/application/ports/renewal-notice-delivery-repository';

// DEBT-414 F07: the email provider's later report on a renewal notice it
// accepted. Acceptance is not delivery; this records whether the notice
// reached its reader. A notice that did not is logged and alerts the operator: the
// statutes require notice actually given, and the missed-deadline check no
// longer counts it as sent.
export class RecordRenewalNoticeProviderOutcomeUseCase {
  constructor(
    private readonly deliveries: Pick<
      RenewalNoticeDeliveryRepository,
      'recordProviderOutcome'
    >,
    private readonly logger: Pick<Logger, 'info' | 'error'>,
    private readonly alerts: OperationalAlerts,
  ) {}

  async execute(input: {
    providerEventId: string;
    outcome: RenewalNoticeProviderOutcome;
    observedAt: Date;
  }): Promise<RecordRenewalNoticeProviderOutcomeResult> {
    const result = await this.deliveries.recordProviderOutcome(input);
    // Only a change is logged, so a redelivered report is not logged twice.
    if (result !== 'recorded') return result;
    const { providerEventId, outcome } = input;
    if (outcome.kind === 'failed') {
      try {
        this.logger.error(
          {
            providerEventId,
            failureClass: outcome.failureClass,
            failureCode: outcome.failureCode,
          },
          'Renewal notice was not delivered',
        );
      } catch {
        // Logging must not suppress the alert after a failure was recorded.
      }
      await this.alerts.raise({
        kind: 'renewal_notice_terminal_failure',
        count: 1,
      });
    } else {
      this.logger.info(
        { providerEventId, outcome: outcome.kind },
        'Renewal notice delivery evidence recorded',
      );
    }
    return result;
  }
}
