import { ApplicationError } from '@/src/application/errors';
import type { StripeCustomerRepository } from '@/src/application/ports/repositories';

export class FakeStripeCustomerRepository implements StripeCustomerRepository {
  private readonly userIdToCustomerId = new Map<string, string>();
  private readonly customerIdToUserId = new Map<string, string>();

  async findByUserId(
    userId: string,
  ): Promise<{ stripeCustomerId: string } | null> {
    const customerId = this.userIdToCustomerId.get(userId);
    if (!customerId) return null;
    return { stripeCustomerId: customerId };
  }

  async insert(
    userId: string,
    stripeCustomerId: string,
    options?: { conflictStrategy?: 'strict' | 'authoritative' },
  ): Promise<void> {
    const conflictStrategy = options?.conflictStrategy ?? 'strict';
    const existingCustomerId = this.userIdToCustomerId.get(userId);
    const existingUserId = this.customerIdToUserId.get(stripeCustomerId);

    if (existingCustomerId === stripeCustomerId && existingUserId === userId) {
      return;
    }

    if (existingCustomerId && existingCustomerId !== stripeCustomerId) {
      if (conflictStrategy !== 'authoritative') {
        throw new ApplicationError(
          'CONFLICT',
          'User is already mapped to a different Stripe customer',
        );
      }
      this.customerIdToUserId.delete(existingCustomerId);
    }

    if (existingUserId && existingUserId !== userId) {
      throw new ApplicationError(
        'CONFLICT',
        'Stripe customer is already mapped to a different user',
      );
    }

    this.userIdToCustomerId.set(userId, stripeCustomerId);
    this.customerIdToUserId.set(stripeCustomerId, userId);
  }
}
