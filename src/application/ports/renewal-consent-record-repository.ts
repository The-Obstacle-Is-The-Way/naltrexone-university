import type {
  NewRenewalConsentRecord,
  RenewalConsentRecord,
} from '@/src/domain/entities';

export type RenewalConsentSourceLookup =
  | { checkoutSessionId: string; setupSessionId?: never }
  | { checkoutSessionId?: never; setupSessionId: string };

export interface RenewalConsentRecordRepository {
  save(input: NewRenewalConsentRecord): Promise<RenewalConsentRecord>;
  findById(id: string): Promise<RenewalConsentRecord | null>;
  findBySource(
    source: RenewalConsentSourceLookup,
  ): Promise<RenewalConsentRecord | null>;
  markSubscriptionTerminated(input: {
    stripeSubscriptionId: string;
    terminatedAt: Date;
  }): Promise<number>;
  pruneExpired(input: { before: Date; limit: number }): Promise<number>;
}
