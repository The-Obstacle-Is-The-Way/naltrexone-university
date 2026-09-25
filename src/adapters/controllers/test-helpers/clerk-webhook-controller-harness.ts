import {
  FakeClerkEventRepository,
  FakeDeletedClerkUserRepository,
  FakeLogger,
  FakePendingStripeCustomerCleanupRepository,
  FakeStripeCustomerRepository,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';
import type { ClerkWebhookTransaction } from '../clerk-webhook-controller';

// Every transaction shares the harness's fakes, and `transactions.count`
// records how many the controller opened. An injected subclass keeps its own
// type at the call site; the harness hands it to the controller as is.
export function createClerkWebhookTestDeps(
  input: {
    userRepository?: FakeUserRepository;
    deletedClerkUsers?: FakeDeletedClerkUserRepository;
    stripeCustomerRepository?: FakeStripeCustomerRepository;
  } = {},
) {
  const clerkEvents = new FakeClerkEventRepository();
  const deletedClerkUsers =
    input.deletedClerkUsers ?? new FakeDeletedClerkUserRepository();
  const pendingStripeCustomerCleanups =
    new FakePendingStripeCustomerCleanupRepository();
  const userRepository = input.userRepository ?? new FakeUserRepository();
  const stripeCustomerRepository =
    input.stripeCustomerRepository ?? new FakeStripeCustomerRepository();
  const customerDeleteCalls: string[] = [];
  const transactions = { count: 0 };

  return {
    clerkEvents,
    deletedClerkUsers,
    pendingStripeCustomerCleanups,
    userRepository,
    stripeCustomerRepository,
    customerDeleteCalls,
    transactions,
    transaction: async <T>(
      fn: (tx: ClerkWebhookTransaction) => Promise<T>,
    ): Promise<T> => {
      transactions.count += 1;
      return fn({
        clerkEvents,
        deletedClerkUsers,
        pendingStripeCustomerCleanups,
        userRepository,
        stripeCustomerRepository,
      });
    },
    deleteStripeCustomer: async (stripeCustomerId: string) => {
      customerDeleteCalls.push(stripeCustomerId);
    },
    getClerkUserById: async () => null,
    logger: new FakeLogger(),
  };
}
