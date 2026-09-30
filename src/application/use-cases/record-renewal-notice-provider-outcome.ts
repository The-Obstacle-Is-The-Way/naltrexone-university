import type { Logger } from '@/src/application/ports/logger';
import type {
  RecordRenewalNoticeProviderOutcomeResult,
  RenewalNoticeDeliveryRepository,
  RenewalNoticeProviderOutcome,
} from '@/src/application/ports/renewal-notice-delivery-repository';

// DEBT-414 F07: the email provider's later report on a renewal notice it
// accepted. Acceptance is not delivery; this records whether the notice
// reached its reader. A notice that did not is logged at error level: the
// statutes require notice actually given, and the missed-deadline check no
// longer counts it as sent.
export class RecordRenewalNoticeProviderOutcomeUseCase {
  constructor(
    private readonly deliveries: Pick<
      RenewalNoticeDeliveryRepository,
      'recordProviderOutcome'
    >,
    private readonly logger: Pick<Logger, 'info' | 'error'>,
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
      this.logger.error(
        {
          providerEventId,
          failureClass: outcome.failureClass,
          failureCode: outcome.failureCode,
        },
        'Renewal notice was not delivered',
      );
    } else {
      this.logger.info(
        { providerEventId, outcome: outcome.kind },
        'Renewal notice delivery evidence recorded',
      );
    }
    return result;
  }
}
