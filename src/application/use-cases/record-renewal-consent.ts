import type { RenewalConsentRecordRepository } from '@/src/application/ports/repositories';
import {
  newRenewalConsentRecord,
  type RenewalConsentRecord,
  type RenewalConsentRecordInput,
} from '@/src/domain/entities';

export type RecordRenewalConsentInput = RenewalConsentRecordInput;
export type RecordRenewalConsentOutput = RenewalConsentRecord;

export class RecordRenewalConsentUseCase {
  constructor(private readonly repository: RenewalConsentRecordRepository) {}

  async execute(
    input: RecordRenewalConsentInput,
  ): Promise<RecordRenewalConsentOutput> {
    return this.repository.save(newRenewalConsentRecord(input));
  }
}
