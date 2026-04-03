import type {
  CheckoutSuccessContainerLike,
  CheckoutSuccessDeps,
  CheckoutSuccessModuleLoaders,
} from './checkout-success-types';

const defaultModuleLoaders: CheckoutSuccessModuleLoaders = {
  loadContainer: () => import('@/lib/container'),
  loadStripe: () => import('@/lib/stripe'),
  loadClerkServer: () => import('@clerk/nextjs/server'),
};

export async function getCheckoutSuccessDeps(
  deps?: CheckoutSuccessDeps,
  loaders: CheckoutSuccessModuleLoaders = defaultModuleLoaders,
): Promise<CheckoutSuccessDeps> {
  if (deps) return deps;

  const { createContainer } = await loaders.loadContainer();
  const { getStripe } = await loaders.loadStripe();
  const { auth } = await loaders.loadClerkServer();

  const container = createContainer() as CheckoutSuccessContainerLike;

  return {
    authGateway: container.createAuthGateway(),
    getClerkAuth: auth,
    logger: container.logger,
    stripe: getStripe(),
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
