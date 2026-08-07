import type { RenewalConsentRecordRepository } from '@/src/application/ports/repositories';

export const RENEWAL_CONSENT_PRUNE_BATCH_LIMIT = 100;

export class PruneRenewalConsentsUseCase {
  constructor(
    private readonly repository: RenewalConsentRecordRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<number> {
    return this.repository.pruneExpired({
      before: this.now(),
      limit: RENEWAL_CONSENT_PRUNE_BATCH_LIMIT,
    });
  }
}
