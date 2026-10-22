import type {
  CheckoutSuccessContainerLike,
  CheckoutSuccessDeps,
  CheckoutSuccessModuleLoaders,
} from './checkout-success-types';

const defaultModuleLoaders: CheckoutSuccessModuleLoaders = {
  loadContainer: () => import('@/lib/container'),
  loadClerkServer: () => import('@clerk/nextjs/server'),
};

export async function getCheckoutSuccessDeps(
  deps?: CheckoutSuccessDeps,
  loaders: CheckoutSuccessModuleLoaders = defaultModuleLoaders,
): Promise<CheckoutSuccessDeps> {
  if (deps) return deps;

  const { createRequestContainer } = await loaders.loadContainer();
  const { auth } = await loaders.loadClerkServer();

  const container = createRequestContainer() as CheckoutSuccessContainerLike;

  return {
    authGateway: container.createAuthGateway(),
    subscriptionVersions: container.createSubscriptionRepository(),
    getClerkAuth: auth,
    logger: container.logger,
    rateLimiter: container.createRateLimiter(),
    stripe: container.stripe,
    stripeBudget: container.stripeBudget,
    priceIds: {
      monthly: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY,
      annual: container.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL,
    },
    appUrl: container.env.NEXT_PUBLIC_APP_URL,
    transaction: async (fn) =>
      container.db.transaction(async (tx) =>
        fn({
          stripeCustomers: container.createStripeCustomerRepository(tx),
          subscriptions: container.createSubscriptionRepository(tx),
        }),
      ),
  };
}
