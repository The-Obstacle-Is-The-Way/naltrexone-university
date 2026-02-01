import { isEntitled } from '@/src/domain/services';
import type { SubscriptionRepository } from '../ports/repositories';

export type CheckEntitlementInput = { userId: string };

export type CheckEntitlementOutput = {
  isEntitled: boolean;
};

export class CheckEntitlementUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: CheckEntitlementInput): Promise<CheckEntitlementOutput> {
    const subscription = await this.subscriptions.findByUserId(input.userId);

    return {
      isEntitled: isEntitled(subscription, this.now()),
    };
  }
}
